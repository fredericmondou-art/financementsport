-- =============================================================================
-- Migration 0015 — Tâche 1.5.5 : confirmation de réception et livraison
-- groupée (transitions de statut de commande gardées).
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, Tâche 1.5.5) :
--   - CLAUDE.md section 9 et le cahier (docs/prompts/phase-1-5.md, Tâche
--     1.5.5) exigent : transitions de statut explicites et validées (sauts
--     illégaux interdits), seuls team_manager/club_admin/platform_admin du
--     scope concerné peuvent faire avancer ces statuts, chaque changement
--     horodaté et traçable, notification journalisée (email_log) à
--     « distribué »/« complété ».
--   - Donner à `authenticated` une policy RLS `UPDATE` ordinaire sur
--     `orders` permettrait de modifier N'IMPORTE QUELLE colonne (montants,
--     bénéficiaire, adresse...), pas seulement `status` -- RLS ne fait pas
--     de restriction colonne par colonne. On reprend donc le même patron que
--     `create_paid_order` (migration 0006) : une fonction Postgres unique,
--     SECURITY DEFINER, qui (a) vérifie elle-même l'autorisation, (b) valide
--     la transition demandée contre une table figée, (c) écrit le nouveau
--     statut + une ligne de traçabilité + au besoin une ligne `email_log`,
--     tout dans une seule transaction implicite. AUCUNE policy RLS `UPDATE`
--     supplémentaire n'est ajoutée sur `orders` pour les rôles
--     team_manager/club_admin -- leur seul chemin d'écriture est cette
--     fonction. `orders_admin_update` (migration 0003, platform_admin
--     uniquement) reste inchangée : c'est l'échappatoire déjà prévue pour
--     les corrections/litiges, hors de cette machine de transitions.
--   - La table de transitions ci-dessous est un MIROIR manuel de
--     `VALID_ORDER_STATUS_TRANSITIONS` dans `lib/orders/status.ts` -- une
--     fonction plpgsql ne peut pas importer du TypeScript. Toute évolution
--     de l'une doit être répercutée dans l'autre (commentaire laissé aux
--     deux endroits).
--   - `private.is_platform_admin()` / `private.current_user_role()` (pas
--     `public.*`) : migration 0005 a déplacé ces fonctions d'aide RLS vers
--     le schéma `private` et supprimé les versions `public.*` -- voir
--     migration 0005 pour le détail (PostgREST n'expose pas `private`, donc
--     EXECUTE peut y être large sans risque d'appel RPC direct).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table de traçabilité des changements de statut (« horodaté et
--    traçable », exigence du cahier). Écrite UNIQUEMENT par
--    `advance_order_status` ci-dessous (SECURITY DEFINER, bypasse RLS pour
--    l'écriture) -- aucune policy INSERT/UPDATE/DELETE pour anon/
--    authenticated, même convention que `credit_audit_log` (migration 0003).
-- -----------------------------------------------------------------------------

CREATE TABLE order_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status NOT NULL,
  to_status   order_status NOT NULL,
  changed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_log_order ON order_status_log(order_id);

ALTER TABLE order_status_log ENABLE ROW LEVEL SECURITY;

-- Lecture : même scope que la lecture de la commande elle-même
-- (propriétaire, platform_admin/support/logistics/accounting déjà couverts
-- par `orders_select_scoped`, OU responsable de la campagne concernée via
-- `private.manages_campaign`, comme pour la liste de distribution -- Tâche
-- 1.5.4, migration 0014).
CREATE POLICY order_status_log_select ON order_status_log FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.current_user_role() IN ('support', 'logistics', 'accounting')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_log.order_id
        AND (o.user_id = auth.uid() OR private.manages_campaign(o.primary_campaign_id))
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Fonction gardée d'avancement de statut.
--
-- Verrouille la ligne commande (`FOR UPDATE`) avant de lire son statut
-- courant, pour éviter qu'un double-clic ou deux responsables agissant en
-- même temps sur la même commande ne fassent toutes deux passer une
-- transition basée sur un statut déjà obsolète (même esprit que le
-- verrouillage produit de `create_paid_order`, migration 0006).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_order_status(p_order_id uuid, p_new_status order_status)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order      public.orders;
  v_old_status order_status;
  v_recipient  citext;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;

  IF NOT (private.is_platform_admin() OR private.manages_campaign(v_order.primary_campaign_id)) THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à modifier le statut de cette commande.';
  END IF;

  v_old_status := v_order.status;

  -- MIROIR de VALID_ORDER_STATUS_TRANSITIONS (lib/orders/status.ts).
  IF NOT (
    (v_old_status = 'payment_pending'   AND p_new_status IN ('paid', 'cancelled', 'error')) OR
    (v_old_status = 'paid'              AND p_new_status IN ('preparing', 'cancelled', 'refunded')) OR
    (v_old_status = 'preparing'         AND p_new_status IN ('ready', 'cancelled')) OR
    (v_old_status = 'ready'             AND p_new_status IN ('delivered_to_team', 'cancelled')) OR
    (v_old_status = 'delivered_to_team' AND p_new_status = 'distributed') OR
    (v_old_status = 'distributed'       AND p_new_status IN ('completed', 'partially_refunded'))
  ) THEN
    RAISE EXCEPTION 'Transition de statut invalide : % vers % n''est pas permis.', v_old_status, p_new_status;
  END IF;

  UPDATE public.orders
    SET status = p_new_status, updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

  INSERT INTO public.order_status_log (order_id, from_status, to_status, changed_by)
  VALUES (p_order_id, v_old_status, p_new_status, auth.uid());

  -- Notification journalisée (cahier, Tâche 1.5.5) : seulement à
  -- distribué/complété, et seulement si on a une adresse où l'envoyer --
  -- défensif, ne fait jamais échouer la transition pour une notification
  -- manquante (même philosophie que lib/email/email-log.ts).
  IF p_new_status IN ('distributed', 'completed') THEN
    v_recipient := v_order.guest_email;
    IF v_order.user_id IS NOT NULL THEN
      SELECT email INTO v_recipient FROM public.profiles WHERE id = v_order.user_id;
    END IF;
    IF v_recipient IS NOT NULL THEN
      INSERT INTO public.email_log (recipient, template, related_type, related_id, status)
      VALUES (
        v_recipient,
        CASE p_new_status WHEN 'distributed' THEN 'order_distributed' ELSE 'order_completed' END,
        'order',
        p_order_id,
        'queued'
      );
    END IF;
  END IF;

  RETURN v_order;
END;
$$;

-- Durcissement (même convention que migration 0006/0004) : seul
-- `authenticated` doit pouvoir appeler cette fonction (un visiteur `anon`
-- échouerait de toute façon l'autorisation interne, mais on retire l'accès
-- explicitement plutôt que de compter uniquement sur cette vérification).
REVOKE ALL ON FUNCTION public.advance_order_status(uuid, order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, order_status) TO authenticated;
ALTER FUNCTION public.advance_order_status(uuid, order_status) SET search_path = public, pg_temp;
