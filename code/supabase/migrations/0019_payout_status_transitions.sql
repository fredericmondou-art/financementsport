-- =============================================================================
-- Migration 0019 — Tâche 1.5.10 : calcul des versements (paiement manuel).
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, Tâche 1.5.10) :
--   - CLAUDE.md section 4 ("versements MANUELS en V1") et le cahier (docs/
--     prompts/phase-1-5.md, Tâche 1.5.10, explicitement marquée « tâche
--     financière sensible — soin maximal ») exigent : calcul automatique du
--     montant dû, cycle de statut `calculated → approved → paid` avec
--     validation admin EXPLICITE, AUCUN passage automatique à `paid`, une
--     preuve de paiement obligatoire, et une trace d'audit de chaque
--     changement de statut (qui, quand).
--   - `payouts_staff_write` (migration 0005) est déjà `FOR ALL` et accorde
--     l'écriture directe (INSERT/UPDATE/DELETE) à `platform_admin`/
--     `accounting` UNIQUEMENT — contrairement à `orders`, les
--     team_manager/club_admin n'ont qu'un accès LECTURE sur `payouts`
--     (migration 0016, `payouts_select_campaign_managers`). Conséquence
--     directe : le calcul (INSERT/UPDATE de `amount_cents`) peut passer par
--     des appels Supabase ORDINAIRES (RLS suffit déjà à le restreindre),
--     SANS fonction `SECURITY DEFINER` — différent du patron `orders`/
--     `advance_order_status` (migration 0015), où une policy RLS large aurait
--     exposé TOUTES les colonnes. Ici, seule la TRANSITION DE STATUT (avec
--     ses effets de bord : preuve obligatoire, horodatage, traçabilité,
--     raison d'ajustement) a besoin d'une fonction gardée — voir
--     `advance_payout_status` ci-dessous.
--   - Essai initial envisagé puis abandonné (voir docs/DECISIONS.md) : faire
--     porter TOUTE la validation par un simple trigger `BEFORE UPDATE`
--     plutôt qu'une fonction RPC, en passant la « raison » d'un ajustement
--     via une variable de session (`set_config`). Abandonné : PostgREST/
--     Supabase exécute chaque appel RPC dans sa PROPRE requête HTTP (donc
--     très probablement sa propre transaction sous pooling) — une variable
--     de session positionnée par un premier appel ne survivrait pas
--     jusqu'au second appel (l'UPDATE réel). Un appel RPC UNIQUE, atomique,
--     est la seule façon fiable de garantir qu'une transition « adjusted »
--     arrive TOUJOURS accompagnée de sa raison, dans la même transaction.
--   - Idempotence du calcul (cahier : « recalculer ne crée pas de doublon de
--     payout pour la même campagne/bénéficiaire ») : géré CÔTÉ APPLICATION
--     (`lib/payouts/calculate.ts`), pas par une contrainte UNIQUE en base —
--     `tests/unit/dashboards-admin.test.ts` (Tâche 1.5.7, déjà livré) montre
--     qu'un SEUL versement par bénéficiaire peut être payé PARTIELLEMENT
--     (`amount_cents` du versement < crédits actifs du bénéficiaire), ce qui
--     n'implique PAS plusieurs lignes par bénéficiaire — juste qu'un montant
--     payé peut être inférieur au montant calculé. Le calcul recalcule donc
--     en UPDATE la ligne existante (si non finale) plutôt que d'en
--     insérer une nouvelle, mais aucune contrainte UNIQUE n'est ajoutée :
--     rien dans le cahier n'interdit explicitement une seconde ligne pour un
--     futur cycle de versement (ex. nouveaux crédits après un premier
--     versement déjà `closed`), et ajouter une contrainte UNIQUE figerait
--     une hypothèse non confirmée. Voir le verrou ci-dessous, qui empêche la
--     VRAIE source de risque : modifier en SILENCE le montant d'un versement
--     déjà validé/payé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Verrou de montant : une fois un versement sorti des deux statuts
--    "ouverts" au recalcul automatique (`calculated`, `in_validation`),
--    `amount_cents`/`fee_held_cents` ne peuvent plus changer SAUF dans la
--    même instruction qu'un changement de statut (la transition `adjusted`,
--    via `advance_payout_status` ci-dessous, est le SEUL chemin légitime
--    pour corriger un montant après validation — avec raison obligatoire et
--    trace d'audit). Défense en profondeur : même si `lib/payouts/
--    calculate.ts` est censé ne jamais tenter cette mise à jour, ce verrou
--    protège contre un appel direct ou une régression future.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payouts_guard_amount_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status
     AND OLD.status NOT IN ('calculated', 'in_validation')
     AND (NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
          OR NEW.fee_held_cents IS DISTINCT FROM OLD.fee_held_cents) THEN
    RAISE EXCEPTION
      'Le montant d''un versement au statut "%" ne peut être modifié que via une transition "adjusted" (raison obligatoire).',
      OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payouts_guard_amount_lock_trg ON public.payouts;
CREATE TRIGGER payouts_guard_amount_lock_trg
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.payouts_guard_amount_lock();

-- -----------------------------------------------------------------------------
-- 2. Table de traçabilité des changements de statut de versement (« qui,
--    quand », exigence du cahier — section 37, « historique »). Écrite
--    UNIQUEMENT par `advance_payout_status` ci-dessous (SECURITY DEFINER,
--    bypasse RLS pour l'écriture) — même convention que `order_status_log`
--    (migration 0015) / `credit_audit_log` (migration 0003) : aucune policy
--    INSERT/UPDATE/DELETE pour anon/authenticated.
--    `note` porte la raison obligatoire d'une transition `adjusted` (et,
--    facultativement, tout commentaire libre pour les autres transitions) —
--    NULL sinon.
-- -----------------------------------------------------------------------------

CREATE TABLE payout_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id   UUID NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  from_status payout_status NOT NULL,
  to_status   payout_status NOT NULL,
  changed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note        TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payout_status_log_payout ON payout_status_log(payout_id);

ALTER TABLE payout_status_log ENABLE ROW LEVEL SECURITY;

-- Lecture : même scope que la lecture du versement lui-même
-- (`payouts_staff_read` migration 0005 + `payouts_select_campaign_managers`
-- migration 0016) — platform_admin/accounting voient tout, un
-- team_manager/club_admin ne voit que l'historique des versements de ses
-- propres bénéficiaires.
CREATE POLICY payout_status_log_select ON payout_status_log FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.current_user_role() = 'accounting'
    OR EXISTS (
      SELECT 1 FROM public.payouts p
      WHERE p.id = payout_status_log.payout_id
        AND private.manages_beneficiary(p.beneficiary_type, p.beneficiary_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Fonction gardée de transition de statut de versement.
--
-- MIROIR de `VALID_PAYOUT_STATUS_TRANSITIONS` (lib/payouts/workflow.ts) —
-- toute évolution de l'une doit être répercutée dans l'autre (commentaire
-- laissé aux deux endroits, même convention que migration 0015).
--
-- Graphe de transitions choisi en autonomie (le cahier ne décrit QUE le
-- cycle principal `calculated → approved → paid`) — voir docs/DECISIONS.md,
-- Tâche 1.5.10, pour la justification complète :
--   calculated    → in_validation, approved, disputed
--   in_validation → approved, calculated, disputed
--   approved      → paid, disputed, adjusted
--   paid          → closed, disputed, adjusted
--   adjusted      → approved, paid, closed
--   disputed      → approved, adjusted, closed
--   closed        → (aucune — état terminal)
-- Règle non négociable : `paid` n'est atteignable QUE depuis `approved` ou
-- `adjusted` (jamais `calculated`/`in_validation` directement) — un admin
-- doit toujours avoir explicitement validé le montant avant paiement.
--
-- Verrouille la ligne (`FOR UPDATE`) avant de lire son statut courant, même
-- esprit que `advance_order_status` (migration 0015) / `create_paid_order`
-- (migration 0006) : éviter qu'une transition concurrente ne s'appuie sur un
-- statut déjà obsolète.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_payout_status(
  p_payout_id uuid,
  p_new_status payout_status,
  p_proof_url text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_new_amount_cents integer DEFAULT NULL,
  p_new_fee_held_cents integer DEFAULT NULL
)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payout     public.payouts;
  v_old_status payout_status;
BEGIN
  SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Versement introuvable.';
  END IF;

  -- Même scope d'autorisation que `payouts_staff_write` (migration 0005) :
  -- les responsables de campagne/équipe restent LECTURE SEULE sur les
  -- versements (migration 0016) — aucune transition de statut pour eux.
  IF NOT (private.is_platform_admin() OR private.current_user_role() = 'accounting') THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à modifier le statut de ce versement.';
  END IF;

  v_old_status := v_payout.status;

  IF NOT (
    (v_old_status = 'calculated'    AND p_new_status IN ('in_validation', 'approved', 'disputed')) OR
    (v_old_status = 'in_validation' AND p_new_status IN ('approved', 'calculated', 'disputed')) OR
    (v_old_status = 'approved'      AND p_new_status IN ('paid', 'disputed', 'adjusted')) OR
    (v_old_status = 'paid'          AND p_new_status IN ('closed', 'disputed', 'adjusted')) OR
    (v_old_status = 'adjusted'      AND p_new_status IN ('approved', 'paid', 'closed')) OR
    (v_old_status = 'disputed'      AND p_new_status IN ('approved', 'adjusted', 'closed'))
  ) THEN
    RAISE EXCEPTION 'Transition de statut de versement invalide : % vers % n''est pas permis.', v_old_status, p_new_status;
  END IF;

  IF p_new_status = 'paid' THEN
    IF COALESCE(p_proof_url, v_payout.proof_url) IS NULL OR btrim(COALESCE(p_proof_url, v_payout.proof_url)) = '' THEN
      RAISE EXCEPTION 'Une preuve de paiement (proof_url) est obligatoire pour marquer un versement payé.';
    END IF;
    v_payout.proof_url := COALESCE(p_proof_url, v_payout.proof_url);
    IF v_payout.paid_at IS NULL THEN
      v_payout.paid_at := now();
    END IF;
  END IF;

  IF p_new_status = 'approved' AND v_payout.approved_by IS NULL THEN
    v_payout.approved_by := auth.uid();
  END IF;

  IF p_new_status = 'adjusted' THEN
    IF p_new_amount_cents IS NULL OR p_new_amount_cents < 0 THEN
      RAISE EXCEPTION 'Un ajustement requiert un nouveau montant (>= 0).';
    END IF;
    IF p_note IS NULL OR btrim(p_note) = '' THEN
      RAISE EXCEPTION 'Une raison est obligatoire pour ajuster un versement.';
    END IF;
    v_payout.amount_cents := p_new_amount_cents;
    IF p_new_fee_held_cents IS NOT NULL THEN
      v_payout.fee_held_cents := p_new_fee_held_cents;
    END IF;
  END IF;

  UPDATE public.payouts
    SET status = p_new_status,
        proof_url = v_payout.proof_url,
        paid_at = v_payout.paid_at,
        approved_by = v_payout.approved_by,
        amount_cents = v_payout.amount_cents,
        fee_held_cents = v_payout.fee_held_cents,
        updated_at = now()
    WHERE id = p_payout_id
    RETURNING * INTO v_payout;

  INSERT INTO public.payout_status_log (payout_id, from_status, to_status, changed_by, note)
  VALUES (p_payout_id, v_old_status, p_new_status, auth.uid(), NULLIF(btrim(COALESCE(p_note, '')), ''));

  RETURN v_payout;
END;
$$;

-- Durcissement (même convention que migrations 0004/0006/0015) : seul
-- `authenticated` peut appeler cette fonction (un `anon` échouerait de toute
-- façon l'autorisation interne, mais on retire l'accès explicitement).
REVOKE ALL ON FUNCTION public.advance_payout_status(uuid, payout_status, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_payout_status(uuid, payout_status, text, text, integer, integer) TO authenticated;
ALTER FUNCTION public.advance_payout_status(uuid, payout_status, text, text, integer, integer) SET search_path = public, pg_temp;
