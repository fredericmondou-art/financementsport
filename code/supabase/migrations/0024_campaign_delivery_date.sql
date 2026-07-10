-- =============================================================================
-- Migration 0024 — Date de livraison de campagne (P.3, règle R2 de
-- SPEC-PARAMETRES-PLATEFORME.md, voir docs/PLAN-PARAMETRES-PLATEFORME.md).
--
-- Contexte : R2 exige qu'une date de livraison soit saisie et affichée
-- publiquement pour toute campagne, bornée par rapport à sa date de clôture
-- (paramètre `campagne_delai_livraison_jours_max`, migration 0023). Aucune
-- colonne équivalente n'existait dans le schéma (section 21 du cahier ne
-- couvrait que `starts_at`/`ends_at`) — ajout nécessaire avant de pouvoir
-- valider quoi que ce soit côté serveur.
--
-- Décision autonome (voir docs/DECISIONS.md) : `delivery_date` est NULLABLE
-- au niveau base, comme `starts_at`/`ends_at` déjà (migration 0001) — même
-- convention déjà en place dans ce schéma : le caractère "obligatoire" d'un
-- champ métier est appliqué par la validation applicative (zod, `lib/
-- campaigns/create-campaign.ts`), PAS par une contrainte NOT NULL, pour ne
-- jamais bloquer une migration sur des lignes déjà en production (une
-- campagne réelle existe déjà en base, voir docs/PROGRESS.md, Tâche 1.4.6).
-- Aucune borne min/max n'est imposée en CHECK ici non plus : les valeurs
-- 7/21/etc. viennent de `parametres_plateforme` (configurables sans
-- redéploiement), jamais en dur dans le schéma (CLAUDE.md section 9,
-- principe directeur de SPEC-PARAMETRES-PLATEFORME.md §1).
-- =============================================================================

ALTER TABLE public.campaigns ADD COLUMN delivery_date TIMESTAMPTZ;

COMMENT ON COLUMN public.campaigns.delivery_date IS
  'Date de livraison annoncée (R2) -- obligation légale de contrat à '
  'distance. Nullable au niveau base (voir en-tête de migration) ; '
  'obligatoire et bornée par lib/campaigns/create-campaign.ts à la création.';

-- -----------------------------------------------------------------------------
-- 1. create_campaign_with_details : nouveau paramètre p_delivery_date, inséré
-- juste après p_ends_at (même position que la colonne dans la table). La
-- fonction précédente (16 paramètres, migration 0008) est DROP explicitement
-- avant de recréer avec la nouvelle signature (17 paramètres) : un simple
-- CREATE OR REPLACE avec une liste de paramètres différente laisserait les
-- DEUX signatures coexister comme fonctions surchargées distinctes, ce qui
-- serait une confusion durable (laquelle PostgREST résout-il ?).
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  text, uuid[], uuid[], jsonb, jsonb
);

CREATE FUNCTION public.create_campaign_with_details(
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
  p_delivery_date timestamptz,
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
    club_id, team_id, goal_cents, starts_at, ends_at, delivery_date, created_by
  ) VALUES (
    p_type::campaign_type, p_status::campaign_status, p_name, p_slug, p_public_message,
    p_beneficiary_type::beneficiary_type, p_beneficiary_id,
    p_club_id, p_team_id, p_goal_cents, p_starts_at, p_ends_at, p_delivery_date, auth.uid()
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
  'Tâche 1.7 + migration 0024 (P.3, delivery_date) : écriture atomique '
  'campagne+participants+packs+règle de crédit+QR codes. SECURITY INVOKER '
  '(par défaut, volontaire) : chaque INSERT reste soumis à RLS. Logique '
  'métier/validation déjà faite en TypeScript (lib/campaigns/'
  'create-campaign.ts) avant l''appel — voir docs/DECISIONS.md.';

REVOKE ALL ON FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  timestamptz, text, uuid[], uuid[], jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  timestamptz, text, uuid[], uuid[], jsonb, jsonb
) TO anon, authenticated, service_role;

ALTER FUNCTION public.create_campaign_with_details(
  text, text, text, text, text, uuid, uuid, uuid, integer, timestamptz, timestamptz,
  timestamptz, text, uuid[], uuid[], jsonb, jsonb
) SET search_path = public, pg_temp;

-- -----------------------------------------------------------------------------
-- 2. v_public_campaign (migration 0007) : expose delivery_date, "affichée
-- publiquement" étant une exigence explicite de R2 (obligation légale de
-- contrat à distance, pas un simple confort d'affichage).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_public_campaign AS
SELECT
  c.id,
  c.type,
  c.name,
  c.slug,
  c.public_message,
  c.beneficiary_type,
  c.beneficiary_id,
  c.goal_cents,
  c.starts_at,
  c.ends_at,
  c.delivery_date
FROM public.campaigns c
WHERE c.status = 'active';

COMMENT ON VIEW public.v_public_campaign IS
  'Vue publique (Tâche 1.6 + migration 0024) : seules les campagnes '
  'status=''active'' sont exposées à anon/authenticated. delivery_date '
  'ajoutée en migration 0024 (R2, obligation légale). Aucune colonne '
  'interne (created_by, approved_at, closed_at, club_id, team_id).';
