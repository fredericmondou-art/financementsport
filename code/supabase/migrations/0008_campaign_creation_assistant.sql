-- =============================================================================
-- Migration 0008 — Tâche 1.7 : assistant de création de campagne.
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, entrée « Tâche 1.7 ») :
--
--   1. Le cahier (section 17/53) demande que l'assistant laisse le
--      responsable (team_manager/club_admin) définir la « règle de crédit »
--      de SA campagne. Mais `credit_rules_admin_write` (migration 0005)
--      réserve TOUTE écriture sur `credit_rules` à `platform_admin`. Question
--      posée à Frédéric (choix engageant l'argent — CLAUDE.md section 9a) :
--      tranché pour l'option « self-service plafonné ». On ajoute donc deux
--      policies suivantes (INSERT/UPDATE), EN PLUS de `credit_rules_admin_write`
--      (qui reste inchangée — l'admin garde un accès total sans plafond) :
--        - portée strictement campagne (campaign_id NOT NULL, product_id
--          NULL, scope='campaign') — jamais une règle globale ou produit ;
--        - plafonnée : percent_bps <= 5000 (50 %), bonus_percent_bps <= 5000,
--          flat_cents <= 10000 (100 $). Mêmes plafonds dupliqués côté
--          application (`lib/campaigns/create-campaign.ts`) pour un message
--          d'erreur clair — la policy RLS reste le filet de sécurité final.
--      Filet de sécurité produit déjà existant qui justifie ce niveau de
--      risque acceptable : les versements restent MANUELS en V1 (CLAUDE.md
--      section 2), un admin valide et paie à la main avant que l'argent ne
--      sorte réellement — un taux excessif est rattrapable avant paiement.
--
--   2. Bug PRÉ-EXISTANT découvert en cours de route (depuis la Tâche 1.3/0.4) :
--      `credit_rules` n'a AUCUNE policy SELECT pour un client/invité normal
--      (`credit_rules_staff_read` = platform_admin/accounting uniquement).
--      `lib/cart/credit-context.ts` (`loadCartCreditContext`) interroge
--      pourtant `credit_rules` avec le client de session de l'utilisateur
--      courant (pas service_role) pour estimer le crédit au panier — sous
--      RLS, cette requête renvoie donc TOUJOURS un tableau vide pour un
--      client/invité, et l'estimation de crédit affichée au panier est
--      silencieusement nulle pour toute règle non liée à `fixed_credit_cents`
--      d'un produit. C'est le cœur même de la plateforme (CLAUDE.md section 1
--      : « calculer le crédit automatiquement »), donc corrigé ici au passage
--      (même classe de correction que le bug seed.sql/trigger de la Tâche 0.4
--      et la régression 0004→0005) : ajout d'une policy SELECT exposant les
--      règles `is_active = true` (configuration de taux, pas une donnée
--      personnelle ou sensible — les pourcentages sont de toute façon affichés
--      publiquement comme argument de vente). Les règles inactives restent
--      réservées à platform_admin/accounting.
--
--   3. Atomicité (CLAUDE.md section 4) : création de campagne + participants +
--      packs + règle de crédit optionnelle + QR codes en une seule
--      transaction. Comme `create_paid_order` (migration 0006), mais ICI la
--      fonction est `SECURITY INVOKER` (PAR DÉFAUT, donc rien à préciser) —
--      contrairement au webhook Stripe, l'appelant est l'utilisateur
--      authentifié lui-même (team_manager/club_admin via son propre jeton de
--      session), donc CHAQUE INSERT à l'intérieur de la fonction doit rester
--      soumis à RLS avec son propre `auth.uid()`. Aucun bypass de sécurité :
--      la fonction n'est qu'une primitive d'écriture mécanique (slug et codes
--      QR déjà résolus/validés uniques côté TypeScript, comme
--      `pickUniqueSlug`) ; si une étape viole une policy RLS (ex. plafond de
--      la règle de crédit dépassé), toute la transaction échoue et rien n'est
--      créé.
--
--   4. Génération des QR codes : la tâche 1.7 demande de « générer le slug et
--      la page publique + un QR code par campagne et par athlète
--      participant ». Le cahier (section « Après la Phase 1 ») liste
--      explicitement « QR codes téléchargeables » comme une fonctionnalité de
--      la PHASE 1.5 (pas la Phase 1). On en déduit que seule la COUCHE DE
--      DONNÉES (ligne `qr_codes` : `code`, `target_type`, `target_id`) relève
--      de la Tâche 1.7 ; la génération de l'IMAGE scannable, son téléchargement
--      et la route de résolution `/q/<code>` (redirection + incrément de
--      `scan_count`) sont déférées à la Phase 1.5, en même temps que le reste
--      du flux « téléchargeable ». Aucun changement de schéma/RLS requis pour
--      cette partie (`qr_codes_scoped`, migration 0005, couvre déjà
--      `target_type IN ('campaign','athlete')` via `manages_qr_target`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Correction : lecture publique des règles de crédit actives (point 2).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS credit_rules_read_active ON credit_rules;
CREATE POLICY credit_rules_read_active ON credit_rules FOR SELECT
  USING (is_active = true);

COMMENT ON POLICY credit_rules_read_active ON credit_rules IS
  'Tâche 1.7 : corrige un trou RLS pré-existant (depuis 0.4/1.3) qui rendait '
  'le calcul de crédit au panier toujours vide pour un client/invité — '
  'lib/cart/credit-context.ts interroge credit_rules avec le client de '
  'session, pas service_role. Les règles inactives restent réservées à '
  'platform_admin/accounting via credit_rules_staff_read.';

-- -----------------------------------------------------------------------------
-- 2. Self-service plafonné : INSERT/UPDATE scopés campagne (point 1).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS credit_rules_campaign_manager_insert ON credit_rules;
CREATE POLICY credit_rules_campaign_manager_insert ON credit_rules FOR INSERT
  WITH CHECK (
    campaign_id IS NOT NULL
    AND product_id IS NULL
    AND scope = 'campaign'
    AND private.manages_campaign(campaign_id)
    AND (percent_bps IS NULL OR percent_bps <= 5000)
    AND (bonus_percent_bps IS NULL OR bonus_percent_bps <= 5000)
    AND (flat_cents IS NULL OR flat_cents <= 10000)
  );

DROP POLICY IF EXISTS credit_rules_campaign_manager_update ON credit_rules;
CREATE POLICY credit_rules_campaign_manager_update ON credit_rules FOR UPDATE
  USING (
    campaign_id IS NOT NULL
    AND private.manages_campaign(campaign_id)
  )
  WITH CHECK (
    campaign_id IS NOT NULL
    AND product_id IS NULL
    AND scope = 'campaign'
    AND private.manages_campaign(campaign_id)
    AND (percent_bps IS NULL OR percent_bps <= 5000)
    AND (bonus_percent_bps IS NULL OR bonus_percent_bps <= 5000)
    AND (flat_cents IS NULL OR flat_cents <= 10000)
  );

COMMENT ON POLICY credit_rules_campaign_manager_insert ON credit_rules IS
  'Tâche 1.7 (self-service plafonné, décision Frédéric) : un team_manager/'
  'club_admin gérant la campagne peut créer SA règle de crédit, jamais une '
  'règle globale/produit, plafonnée à 50 % / 100 $. platform_admin garde un '
  'accès total non plafonné via credit_rules_admin_write (policy distincte, '
  'inchangée).';

-- -----------------------------------------------------------------------------
-- 3. Fonction d'écriture atomique : campagne + participants + packs + règle
--    de crédit optionnelle + QR codes (point 3).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_campaign_with_details(
  p_type text,
  p_name text,
  p_slug text,
  p_public_message text,
  p_beneficiary_type text,
  p_beneficiary_id uuid,
  p_club_id uuid,
  p_team_id uuid,
  p_goal_cents integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text,
  p_participant_athlete_ids uuid[],
  p_product_ids uuid[],
  p_credit_rule jsonb,
  p_qr_codes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign public.campaigns;
  v_athlete_id uuid;
  v_product_id uuid;
  v_credit_rule_id uuid := NULL;
  v_qr_code jsonb;
  v_qr_ids jsonb := '[]'::jsonb;
  v_participant_ids jsonb := '[]'::jsonb;
  v_product_rows jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO public.campaigns (
    type, status, name, slug, public_message, beneficiary_type, beneficiary_id,
    club_id, team_id, goal_cents, starts_at, ends_at, created_by
  ) VALUES (
    p_type::campaign_type, p_status::campaign_status, p_name, p_slug, p_public_message,
    p_beneficiary_type::beneficiary_type, p_beneficiary_id,
    p_club_id, p_team_id, p_goal_cents, p_starts_at, p_ends_at, auth.uid()
  ) RETURNING * INTO v_campaign;

  IF p_participant_athlete_ids IS NOT NULL THEN
    FOREACH v_athlete_id IN ARRAY p_participant_athlete_ids LOOP
      INSERT INTO public.campaign_participants (campaign_id, athlete_id)
      VALUES (v_campaign.id, v_athlete_id);
      v_participant_ids := v_participant_ids || to_jsonb(v_athlete_id);
    END LOOP;
  END IF;

  IF p_product_ids IS NOT NULL THEN
    FOREACH v_product_id IN ARRAY p_product_ids LOOP
      INSERT INTO public.campaign_products (campaign_id, product_id)
      VALUES (v_campaign.id, v_product_id);
      v_product_rows := v_product_rows || to_jsonb(v_product_id);
    END LOOP;
  END IF;

  IF p_credit_rule IS NOT NULL THEN
    INSERT INTO public.credit_rules (
      campaign_id, product_id, scope, percent_bps, flat_cents, min_basket_cents,
      bonus_percent_bps, is_active
    ) VALUES (
      v_campaign.id, NULL, 'campaign',
      (p_credit_rule->>'percent_bps')::integer,
      (p_credit_rule->>'flat_cents')::integer,
      (p_credit_rule->>'min_basket_cents')::integer,
      (p_credit_rule->>'bonus_percent_bps')::integer,
      true
    ) RETURNING id INTO v_credit_rule_id;
  END IF;

  IF p_qr_codes IS NOT NULL THEN
    FOR v_qr_code IN SELECT * FROM jsonb_array_elements(p_qr_codes) LOOP
      -- Le QR « campagne » n'a pas d'id de campagne connu au moment où
      -- TypeScript construit la liste (la campagne vient d'être créée
      -- ci-dessus, dans cette même transaction) : son `target_id` arrive donc
      -- à `NULL`, et on le résout ici avec `v_campaign.id`. Les QR « athlète »
      -- arrivent toujours avec un `target_id` déjà connu.
      INSERT INTO public.qr_codes (target_type, target_id, code, is_dynamic)
      VALUES (
        v_qr_code->>'target_type',
        COALESCE(
          (v_qr_code->>'target_id')::uuid,
          CASE WHEN v_qr_code->>'target_type' = 'campaign' THEN v_campaign.id END
        ),
        v_qr_code->>'code',
        true
      );
      v_qr_ids := v_qr_ids || jsonb_build_object('target_type', v_qr_code->>'target_type', 'code', v_qr_code->>'code');
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'campaign', to_jsonb(v_campaign),
    'participant_athlete_ids', v_participant_ids,
    'product_ids', v_product_rows,
    'credit_rule_id', v_credit_rule_id,
    'qr_codes', v_qr_ids
  );
END;
$$;

COMMENT ON FUNCTION public.create_campaign_with_details IS
  'Tâche 1.7 : écriture atomique campagne+participants+packs+règle de crédit'
  '+QR codes. SECURITY INVOKER (par défaut, volontaire) : appelée avec le '
  'jeton de l''utilisateur authentifié, chaque INSERT reste soumis à RLS '
  '(contrairement à create_paid_order, qui est appelée par le webhook via '
  'service_role). Logique métier/validation déjà faite en TypeScript '
  '(lib/campaigns/create-campaign.ts) avant l''appel — voir docs/DECISIONS.md.';

-- Durcissement (même standard que 0004/0005/0006) : révoque l'EXECUTE accordé
-- par défaut à PUBLIC, puis ré-accorde explicitement à anon/authenticated —
-- contrairement à create_paid_order (service_role uniquement), CETTE fonction
-- DOIT être appelable par un utilisateur authentifié normal (c'est tout son
-- intérêt : SECURITY INVOKER + RLS). `anon` est inclus pour ne pas casser la
-- résolution de la fonction côté PostgREST, mais ne peut de toute façon rien
-- insérer (aucune policy `campaigns_insert_scoped`/`credit_rules_campaign_
-- manager_insert` n'autorise `anon`).
REVOKE ALL ON FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  text, uuid[], uuid[], jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  text, uuid[], uuid[], jsonb, jsonb
) TO anon, authenticated, service_role;

ALTER FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  text, uuid[], uuid[], jsonb, jsonb
) SET search_path = public, pg_temp;
