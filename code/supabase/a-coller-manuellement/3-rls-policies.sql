-- ============================================================================
-- A COLLER DANS : Dashboard Supabase > SQL Editor > New query > Run
-- A executer APRES les fichiers 1-schema-et-seed.sql et
-- 2-trigger-auth-profiles.sql.
-- Active RLS sur les 24 tables du schema + cree les fonctions d'aide
-- SECURITY DEFINER + les vues publiques v_public_athlete / v_public_team /
-- v_public_club (respectent les hide_*). Sans danger a re-executer (DROP
-- POLICY IF EXISTS + CREATE OR REPLACE FUNCTION/VIEW partout).
-- ============================================================================

-- =============================================================================
-- Tâche 0.4 — Politiques RLS (Row Level Security) + vues publiques.
--
-- Numérotation : ce fichier est 0003 (et non 0002 comme suggéré dans
-- 03-prompts) car 0002 a déjà été utilisé par le trigger de profil de la
-- Tâche 0.3. Décision mineure, voir docs/DECISIONS.md.
--
-- Principe général (cf. CLAUDE.md section 5 et NOTE RLS du schéma) :
--   - RLS ACTIVÉE sur TOUTES les tables, sans exception.
--   - Une table sans policy d'écriture pour les rôles standards n'est PAS un
--     oubli : c'est volontaire quand l'écriture doit passer EXCLUSIVEMENT par
--     le service_role côté serveur (webhooks Stripe, moteur de crédit). Le
--     service_role Supabase a l'attribut BYPASSRLS et n'est donc jamais
--     bloqué par ces policies, même sans policy explicite.
--   - Les pages publiques ne lisent JAMAIS les tables brutes athletes/teams/
--     clubs : elles passent par v_public_athlete / v_public_team /
--     v_public_club, qui respectent les champs hide_*.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fonctions utilitaires (SECURITY DEFINER : contournent volontairement RLS
--    en interne pour éviter toute récursion de policy, mais ne renvoient
--    jamais que des booléens ou des ids dérivés de auth.uid() — aucune fuite
--    de données sensibles via ces fonctions).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND role = 'team_manager' AND team_id = p_team_id
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_club(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_club_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND role = 'club_admin' AND club_id = p_club_id
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_athlete(p_athlete_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athletes a
    LEFT JOIN public.teams t ON t.id = a.team_id
    WHERE a.id = p_athlete_id
      AND (
        a.guardian_id = auth.uid()
        OR a.user_id = auth.uid()
        OR public.manages_team(a.team_id)
        OR (t.club_id IS NOT NULL AND public.manages_club(t.club_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_beneficiary(p_type beneficiary_type, p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_type
    WHEN 'team' THEN public.manages_team(p_id)
    WHEN 'club' THEN public.manages_club(p_id)
    WHEN 'athlete' THEN public.manages_athlete(p_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.manages_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND (
        public.manages_team(c.team_id)
        OR public.manages_club(c.club_id)
        OR c.created_by = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_qr_target(p_target_type text, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_target_type
    WHEN 'team' THEN public.manages_team(p_target_id)
    WHEN 'club' THEN public.manages_club(p_target_id)
    WHEN 'athlete' THEN public.manages_athlete(p_target_id)
    WHEN 'campaign' THEN public.manages_campaign(p_target_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.owns_cart(p_cart_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.carts WHERE id = p_cart_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.owns_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND user_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 2. profiles
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON profiles;
CREATE POLICY profiles_select_own_or_admin ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS profiles_update_own_or_admin ON profiles;
CREATE POLICY profiles_update_own_or_admin ON profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (id = auth.uid() OR public.is_platform_admin());
-- Pas de policy INSERT/DELETE standard : la création passe par le trigger
-- on_auth_user_created (SECURITY DEFINER, Tâche 0.3), jamais par un insert
-- direct du client.

-- -----------------------------------------------------------------------------
-- 3. addresses
-- -----------------------------------------------------------------------------
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addresses_owner ON addresses;
CREATE POLICY addresses_owner ON addresses FOR ALL
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 4. clubs
-- -----------------------------------------------------------------------------
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clubs_select ON clubs;
CREATE POLICY clubs_select ON clubs FOR SELECT
  USING (public.is_platform_admin() OR public.manages_club(id));

DROP POLICY IF EXISTS clubs_insert_admin ON clubs;
CREATE POLICY clubs_insert_admin ON clubs FOR INSERT
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS clubs_update_scoped ON clubs;
CREATE POLICY clubs_update_scoped ON clubs FOR UPDATE
  USING (public.is_platform_admin() OR public.manages_club(id))
  WITH CHECK (public.is_platform_admin() OR public.manages_club(id));

DROP POLICY IF EXISTS clubs_delete_admin ON clubs;
CREATE POLICY clubs_delete_admin ON clubs FOR DELETE
  USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 5. teams
-- -----------------------------------------------------------------------------
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams FOR SELECT
  USING (public.is_platform_admin() OR public.manages_club(club_id) OR public.manages_team(id));

DROP POLICY IF EXISTS teams_insert ON teams;
CREATE POLICY teams_insert ON teams FOR INSERT
  WITH CHECK (public.is_platform_admin() OR public.manages_club(club_id));

DROP POLICY IF EXISTS teams_update ON teams;
CREATE POLICY teams_update ON teams FOR UPDATE
  USING (public.is_platform_admin() OR public.manages_club(club_id) OR public.manages_team(id))
  WITH CHECK (public.is_platform_admin() OR public.manages_club(club_id) OR public.manages_team(id));

DROP POLICY IF EXISTS teams_delete ON teams;
CREATE POLICY teams_delete ON teams FOR DELETE
  USING (public.is_platform_admin() OR public.manages_club(club_id));

-- -----------------------------------------------------------------------------
-- 6. athletes (table BRUTE — jamais exposée à anon ; voir v_public_athlete)
-- -----------------------------------------------------------------------------
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS athletes_select ON athletes;
CREATE POLICY athletes_select ON athletes FOR SELECT
  USING (public.is_platform_admin() OR public.manages_athlete(id));

DROP POLICY IF EXISTS athletes_insert ON athletes;
CREATE POLICY athletes_insert ON athletes FOR INSERT
  WITH CHECK (
    public.is_platform_admin()
    OR guardian_id = auth.uid()
    OR public.manages_team(team_id)
  );

DROP POLICY IF EXISTS athletes_update ON athletes;
CREATE POLICY athletes_update ON athletes FOR UPDATE
  USING (public.is_platform_admin() OR public.manages_athlete(id))
  WITH CHECK (public.is_platform_admin() OR public.manages_athlete(id));

DROP POLICY IF EXISTS athletes_delete ON athletes;
CREATE POLICY athletes_delete ON athletes FOR DELETE
  USING (public.is_platform_admin() OR public.manages_athlete(id));

-- -----------------------------------------------------------------------------
-- 7. memberships
-- -----------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_select_own_or_admin ON memberships;
CREATE POLICY memberships_select_own_or_admin ON memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS memberships_write_admin ON memberships;
CREATE POLICY memberships_write_admin ON memberships FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
-- Seul platform_admin attribue les rôles team_manager/club_admin (action
-- sensible : qui gère quoi).

-- -----------------------------------------------------------------------------
-- 8. product_categories / products (catalogue : pas de donnée personnelle,
--    lecture publique directe acceptable — cf. docs/DECISIONS.md)
-- -----------------------------------------------------------------------------
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_categories_public_read ON product_categories;
CREATE POLICY product_categories_public_read ON product_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS product_categories_admin_write ON product_categories;
CREATE POLICY product_categories_admin_write ON product_categories FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS products_admin_all ON products;
CREATE POLICY products_admin_all ON products FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 9. credit_rules (sensible : logique métier de crédit, jamais publique)
-- -----------------------------------------------------------------------------
ALTER TABLE credit_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_rules_staff_read ON credit_rules;
CREATE POLICY credit_rules_staff_read ON credit_rules FOR SELECT
  USING (public.is_platform_admin() OR public.current_user_role() = 'accounting');

DROP POLICY IF EXISTS credit_rules_admin_write ON credit_rules;
CREATE POLICY credit_rules_admin_write ON credit_rules FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 10. campaigns / campaign_participants / campaign_products
-- -----------------------------------------------------------------------------
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select_scoped ON campaigns;
CREATE POLICY campaigns_select_scoped ON campaigns FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.manages_team(team_id)
    OR public.manages_club(club_id)
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS campaigns_insert_scoped ON campaigns;
CREATE POLICY campaigns_insert_scoped ON campaigns FOR INSERT
  WITH CHECK (
    public.is_platform_admin()
    OR public.manages_team(team_id)
    OR public.manages_club(club_id)
  );

DROP POLICY IF EXISTS campaigns_update_scoped ON campaigns;
CREATE POLICY campaigns_update_scoped ON campaigns FOR UPDATE
  USING (
    public.is_platform_admin()
    OR public.manages_team(team_id)
    OR public.manages_club(club_id)
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.manages_team(team_id)
    OR public.manages_club(club_id)
  );

DROP POLICY IF EXISTS campaigns_delete_admin ON campaigns;
CREATE POLICY campaigns_delete_admin ON campaigns FOR DELETE
  USING (public.is_platform_admin());

ALTER TABLE campaign_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_participants_scoped ON campaign_participants;
CREATE POLICY campaign_participants_scoped ON campaign_participants FOR ALL
  USING (public.is_platform_admin() OR public.manages_campaign(campaign_id))
  WITH CHECK (public.is_platform_admin() OR public.manages_campaign(campaign_id));

ALTER TABLE campaign_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_products_scoped ON campaign_products;
CREATE POLICY campaign_products_scoped ON campaign_products FOR ALL
  USING (public.is_platform_admin() OR public.manages_campaign(campaign_id))
  WITH CHECK (public.is_platform_admin() OR public.manages_campaign(campaign_id));

-- -----------------------------------------------------------------------------
-- 11. qr_codes (la résolution publique d'un QR scanné passe par une route
--     serveur avec le client service_role, jamais par anon directement)
-- -----------------------------------------------------------------------------
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_codes_scoped ON qr_codes;
CREATE POLICY qr_codes_scoped ON qr_codes FOR ALL
  USING (public.is_platform_admin() OR public.manages_qr_target(target_type, target_id))
  WITH CHECK (public.is_platform_admin() OR public.manages_qr_target(target_type, target_id));

-- -----------------------------------------------------------------------------
-- 12. carts / cart_items / cart_beneficiaries
--     Paniers invités (user_id NULL) : gérés exclusivement par le serveur via
--     le client service_role (identifiés par session_token), jamais exposés
--     directement à anon — aucune policy anon ici par conception.
-- -----------------------------------------------------------------------------
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carts_owner ON carts;
CREATE POLICY carts_owner ON carts FOR ALL
  USING (user_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_platform_admin());

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_items_owner ON cart_items;
CREATE POLICY cart_items_owner ON cart_items FOR ALL
  USING (public.owns_cart(cart_id) OR public.is_platform_admin())
  WITH CHECK (public.owns_cart(cart_id) OR public.is_platform_admin());

ALTER TABLE cart_beneficiaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_beneficiaries_owner ON cart_beneficiaries;
CREATE POLICY cart_beneficiaries_owner ON cart_beneficiaries FOR ALL
  USING (public.owns_cart(cart_id) OR public.is_platform_admin())
  WITH CHECK (public.owns_cart(cart_id) OR public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 13. orders / order_items
--     Écriture réservée au service_role (webhook Stripe confirmé, Tâche 1.5) :
--     aucune policy INSERT standard. platform_admin peut corriger un statut
--     (ex. litige) via UPDATE.
-- -----------------------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_scoped ON orders;
CREATE POLICY orders_select_scoped ON orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.current_user_role() IN ('support', 'logistics', 'accounting')
  );

DROP POLICY IF EXISTS orders_admin_update ON orders;
CREATE POLICY orders_admin_update ON orders FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_items_select_scoped ON order_items;
CREATE POLICY order_items_select_scoped ON order_items FOR SELECT
  USING (
    public.owns_order(order_id)
    OR public.is_platform_admin()
    OR public.current_user_role() IN ('support', 'logistics', 'accounting')
  );

-- -----------------------------------------------------------------------------
-- 14. order_credits / credit_audit_log — SOURCE DE VÉRITÉ DE L'ARGENT.
--     INSERT réservé au service_role uniquement (calcul de crédit déclenché
--     PAR le webhook de paiement confirmé, jamais manuellement — règle d'or
--     CLAUDE.md section 4). platform_admin peut UPDATE (correction), ce qui
--     doit toujours s'accompagner d'une ligne credit_audit_log (garanti par
--     lib/credits/persist.ts, pas par RLS — RLS ne peut pas forcer une
--     écriture corrélée dans une autre table).
-- -----------------------------------------------------------------------------
ALTER TABLE order_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_credits_select_staff ON order_credits;
CREATE POLICY order_credits_select_staff ON order_credits FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.current_user_role() = 'accounting'
    OR public.manages_beneficiary(beneficiary_type, beneficiary_id)
  );

DROP POLICY IF EXISTS order_credits_admin_update ON order_credits;
CREATE POLICY order_credits_admin_update ON order_credits FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

ALTER TABLE credit_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_audit_log_staff_read ON credit_audit_log;
CREATE POLICY credit_audit_log_staff_read ON credit_audit_log FOR SELECT
  USING (public.is_platform_admin() OR public.current_user_role() = 'accounting');

-- -----------------------------------------------------------------------------
-- 15. tax_rates (référentiel non sensible, lecture publique acceptable)
-- -----------------------------------------------------------------------------
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_rates_public_read ON tax_rates;
CREATE POLICY tax_rates_public_read ON tax_rates FOR SELECT USING (true);

DROP POLICY IF EXISTS tax_rates_admin_write ON tax_rates;
CREATE POLICY tax_rates_admin_write ON tax_rates FOR ALL
  USING (public.is_platform_admin() OR public.current_user_role() = 'accounting')
  WITH CHECK (public.is_platform_admin() OR public.current_user_role() = 'accounting');

-- -----------------------------------------------------------------------------
-- 16. distribution_lists / payouts / email_log (opérations internes)
-- -----------------------------------------------------------------------------
ALTER TABLE distribution_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distribution_lists_scoped ON distribution_lists;
CREATE POLICY distribution_lists_scoped ON distribution_lists FOR ALL
  USING (
    public.is_platform_admin()
    OR public.current_user_role() = 'logistics'
    OR public.manages_campaign(campaign_id)
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.current_user_role() = 'logistics'
    OR public.manages_campaign(campaign_id)
  );

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_staff_read ON payouts;
CREATE POLICY payouts_staff_read ON payouts FOR SELECT
  USING (public.is_platform_admin() OR public.current_user_role() = 'accounting');

DROP POLICY IF EXISTS payouts_staff_write ON payouts;
CREATE POLICY payouts_staff_write ON payouts FOR ALL
  USING (public.is_platform_admin() OR public.current_user_role() = 'accounting')
  WITH CHECK (public.is_platform_admin() OR public.current_user_role() = 'accounting');

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_log_staff_read ON email_log;
CREATE POLICY email_log_staff_read ON email_log FOR SELECT
  USING (public.is_platform_admin() OR public.current_user_role() = 'support');
-- Écriture réservée au service_role (lib/email/*).

-- -----------------------------------------------------------------------------
-- 17. Vues publiques respectant les champs hide_* (lues par anon ET
--     authenticated — jamais les tables brutes athletes/teams/clubs).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_public_athlete AS
SELECT
  a.id,
  a.team_id,
  a.first_name,
  CASE WHEN a.hide_last_name THEN NULL ELSE a.last_name END AS last_name,
  CASE
    WHEN a.hide_last_name THEN a.first_name || ' ' || left(a.last_name, 1) || '.'
    ELSE a.first_name || ' ' || a.last_name
  END AS display_name,
  a.slug,
  a.sport,
  CASE WHEN a.hide_city THEN NULL ELSE a.city END AS city,
  CASE WHEN a.hide_photo THEN NULL ELSE a.photo_url END AS photo_url,
  a.personal_message,
  a.hide_amounts,
  a.show_team_only
FROM public.athletes a
WHERE a.is_active = true
  AND (a.is_minor = false OR a.parental_consent_at IS NOT NULL);

COMMENT ON VIEW public.v_public_athlete IS
  'Vue publique respectant hide_last_name/hide_photo/hide_city. Ne publie '
  'jamais un mineur sans parental_consent_at renseigné.';

CREATE OR REPLACE VIEW public.v_public_team AS
SELECT id, club_id, name, slug, sport, category, logo_url, city, province
FROM public.teams
WHERE is_active = true;

CREATE OR REPLACE VIEW public.v_public_club AS
SELECT id, name, slug, description, logo_url, city, province
FROM public.clubs
WHERE is_active = true AND approved_at IS NOT NULL;

COMMENT ON VIEW public.v_public_club IS
  'Décision autonome : seuls les clubs approuvés (approved_at non nul) sont '
  'publics. Voir docs/DECISIONS.md.';

GRANT SELECT ON public.v_public_athlete TO anon, authenticated;
GRANT SELECT ON public.v_public_team TO anon, authenticated;
GRANT SELECT ON public.v_public_club TO anon, authenticated;

-- Vues d'agrégats déjà créées en migration 0001 (Tâche 0.2) : aucune donnée
-- personnelle, uniquement des totaux/compteurs liés à une campagne publique.
GRANT SELECT ON public.v_beneficiary_credit_totals TO anon, authenticated;
GRANT SELECT ON public.v_campaign_progress TO anon, authenticated;
