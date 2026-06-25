-- =============================================================================
-- Migration 0017 — Tâche 1.5.8 : clôture de campagne (verrouillage des
-- ventes avant rapport et versement).
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, Tâche 1.5.8) :
--   - Cahier (docs/prompts/phase-1-5.md, Tâche 1.5.8) : passage en statut
--     `closed`, verrouillage des ventes (plus aucune commande/crédit
--     rattaché après clôture), horodatage, action réversible UNIQUEMENT par
--     un admin (réouverture), tracée. Vérifier qu'il n'y a pas de commande
--     en cours de paiement non résolue avant de clôturer.
--   - Même patron que `advance_order_status` (migration 0015) : une policy
--     RLS `UPDATE` ordinaire sur `campaigns` permettrait de modifier
--     N'IMPORTE QUELLE colonne, pas seulement `status`/`closed_at`. Deux
--     fonctions Postgres SECURITY DEFINER (`close_campaign`/
--     `reopen_campaign`) vérifient elles-mêmes l'autorisation, valident la
--     transition, écrivent le nouveau statut + une ligne de traçabilité,
--     tout dans une seule transaction implicite. `campaigns_update_scoped`
--     (migration 0003/0005) reste inchangée -- ces fonctions sont le SEUL
--     chemin pour changer `status`/`closed_at` en dehors d'une correction
--     admin directe déjà permise par cette policy pour d'autres colonnes.
--   - « Vérifier qu'il n'y a pas de commande en cours de paiement non
--     résolue » : sous l'architecture actuelle (migration 0006), AUCUNE
--     ligne `orders` n'existe avant la confirmation webhook du paiement
--     (`create_paid_order` insère directement avec `status = 'paid'`) -- le
--     statut `payment_pending` (valeur par défaut de la colonne) n'est donc
--     jamais atteint en pratique par le code applicatif actuel. La
--     vérification ci-dessous reste faite (`orders.status = 'payment_pending'`)
--     par souci de robustesse/compatibilité future si un flux différent
--     venait à pré-créer une commande avant paiement, mais elle ne protège
--     PAS contre une session Stripe Checkout déjà ouverte (non suivie en
--     base) qui se résoudrait après la clôture : ce cas-là est volontairement
--     accepté tel quel -- un paiement déjà encaissé par Stripe doit toujours
--     produire une commande/un crédit (CLAUDE.md section 4, section 7 :
--     jamais perdre un paiement confirmé), la vraie protection contre du
--     NOUVEAU démarchage après clôture est le blocage, côté TypeScript, de
--     la création d'une NOUVELLE session Stripe pour une campagne non
--     `active` (`lib/checkout/create-checkout-session.ts`).
--   - Réouverture : `credit_audit_log` est structurellement lié à une ligne
--     `order_credits` précise (`order_credit_id NOT NULL`) -- une réouverture
--     de campagne n'a pas de crédit unique à référencer. La trace exigée par
--     CLAUDE.md section 4 (« toute modification d'un crédit après coup... »)
--     ne s'applique donc pas littéralement ici (aucun crédit n'est modifié
--     par une réouverture, seul le statut de la campagne change) ; on crée à
--     la place `campaign_status_log`, même rôle que `order_status_log`
--     (migration 0015) mais au niveau de la campagne, avec une colonne
--     `reason` obligatoire pour la réouverture (exigence du cahier : « action
--     réversible uniquement par un admin, avec trace »).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table de traçabilité des changements de statut de campagne liés à la
--    clôture/réouverture. Écrite UNIQUEMENT par `close_campaign`/
--    `reopen_campaign` (SECURITY DEFINER, bypasse RLS pour l'écriture) --
--    aucune policy INSERT/UPDATE/DELETE pour anon/authenticated, même
--    convention que `order_status_log`/`credit_audit_log`.
-- -----------------------------------------------------------------------------

CREATE TABLE campaign_status_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  previous_status campaign_status NOT NULL,
  new_status      campaign_status NOT NULL,
  reason          TEXT,                 -- obligatoire pour une réouverture, NULL pour une clôture normale
  changed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_status_log_campaign ON campaign_status_log(campaign_id);

ALTER TABLE campaign_status_log ENABLE ROW LEVEL SECURITY;

-- Lecture : même scope que la lecture de la campagne elle-même (responsable
-- via `private.manages_campaign`, OU platform_admin).
CREATE POLICY campaign_status_log_select ON campaign_status_log FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.manages_campaign(campaign_status_log.campaign_id)
  );

-- -----------------------------------------------------------------------------
-- 2. Clôture (active -> closed). Responsable de la campagne OU admin.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_campaign(p_campaign_id uuid)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign       public.campaigns;
  v_pending_orders integer;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'Campagne introuvable.';
  END IF;

  IF NOT (private.is_platform_admin() OR private.manages_campaign(p_campaign_id)) THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à clôturer cette campagne.';
  END IF;

  IF v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Seule une campagne active peut être clôturée (statut actuel : %).', v_campaign.status;
  END IF;

  SELECT count(*) INTO v_pending_orders
    FROM public.orders
    WHERE primary_campaign_id = p_campaign_id
      AND status = 'payment_pending';
  IF v_pending_orders > 0 THEN
    RAISE EXCEPTION
      '% commande(s) en attente de confirmation de paiement pour cette campagne -- attendez leur résolution avant de clôturer.',
      v_pending_orders;
  END IF;

  UPDATE public.campaigns
    SET status = 'closed', closed_at = now(), updated_at = now()
    WHERE id = p_campaign_id
    RETURNING * INTO v_campaign;

  INSERT INTO public.campaign_status_log (campaign_id, previous_status, new_status, reason, changed_by)
  VALUES (p_campaign_id, 'active', 'closed', NULL, auth.uid());

  RETURN v_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.close_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_campaign(uuid) TO authenticated;
ALTER FUNCTION public.close_campaign(uuid) SET search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 3. Réouverture (closed -> active). RÉSERVÉE platform_admin, raison
--    obligatoire (exigence du cahier : « action réversible uniquement par
--    un admin, avec trace »).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_campaign(p_campaign_id uuid, p_reason text)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign public.campaigns;
BEGIN
  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'Campagne introuvable.';
  END IF;

  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur de la plateforme peut rouvrir une campagne clôturée.';
  END IF;

  IF v_campaign.status <> 'closed' THEN
    RAISE EXCEPTION 'Seule une campagne clôturée peut être rouverte (statut actuel : %).', v_campaign.status;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'La raison de la réouverture est obligatoire.';
  END IF;

  UPDATE public.campaigns
    SET status = 'active', closed_at = NULL, updated_at = now()
    WHERE id = p_campaign_id
    RETURNING * INTO v_campaign;

  INSERT INTO public.campaign_status_log (campaign_id, previous_status, new_status, reason, changed_by)
  VALUES (p_campaign_id, 'closed', 'active', p_reason, auth.uid());

  RETURN v_campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_campaign(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_campaign(uuid, text) TO authenticated;
ALTER FUNCTION public.reopen_campaign(uuid, text) SET search_path = public, pg_temp;
