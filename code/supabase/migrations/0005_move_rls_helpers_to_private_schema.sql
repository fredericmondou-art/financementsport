-- ============================================================================
-- Migration 0005 : déplacement des fonctions d'aide RLS vers un schéma privé
-- ============================================================================
-- Contexte : la migration 0004 a révoqué EXECUTE sur les fonctions d'aide RLS
-- pour anon/authenticated afin d'empêcher leur appel RPC direct
-- (/rest/v1/rpc/...). Bug découvert par les tests d'intégration
-- (tests/integration/rls-policies.test.ts) AVANT tout impact sur un vrai
-- client : Postgres exige le privilège EXECUTE pour TOUT appel d'une
-- fonction, y compris depuis l'INTÉRIEUR d'une expression de policy RLS
-- (SECURITY DEFINER ne change que le contexte d'exécution du CORPS de la
-- fonction, pas qui a le droit de l'appeler). Résultat : 0004 cassait toute
-- requête anon sur une table dont la policy référence l'une de ces fonctions
-- (campaigns, clubs, teams, athletes, orders, ...) — anon recevait une erreur
-- SQL « permission denied for function » au lieu d'un résultat vide filtré
-- par RLS comme attendu.
--
-- Solution standard Supabase/PostgREST : déplacer ces fonctions d'aide —
-- utilisées UNIQUEMENT par les policies RLS, jamais censées être appelées
-- directement — vers un schéma non exposé par l'API REST (`private`, absent
-- de la configuration « Exposed schemas » de Supabase, qui n'inclut que
-- `public` par défaut). EXECUTE peut alors être accordé largement à
-- anon/authenticated/service_role (nécessaire pour que RLS continue de
-- fonctionner sur TOUTES les tables), sans qu'aucun client REST ne puisse les
-- appeler en RPC direct — PostgREST ne route que les fonctions des schémas
-- explicitement exposés. Voir docs/DECISIONS.md.
--
-- handle_new_auth_user (0002) reste dans public : fonction de trigger
-- uniquement, jamais invoquée par une policy RLS ni par EXECUTE direct (les
-- triggers ne passent pas par la vérification EXECUTE ordinaire).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND role = 'team_manager' AND team_id = p_team_id
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_club(p_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_club_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid() AND role = 'club_admin' AND club_id = p_club_id
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_athlete(p_athlete_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athletes a
    LEFT JOIN public.teams t ON t.id = a.team_id
    WHERE a.id = p_athlete_id
      AND (
        a.guardian_id = auth.uid()
        OR a.user_id = auth.uid()
        OR private.manages_team(a.team_id)
        OR (t.club_id IS NOT NULL AND private.manages_club(t.club_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_beneficiary(p_type beneficiary_type, p_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_type
    WHEN 'team' THEN private.manages_team(p_id)
    WHEN 'club' THEN private.manages_club(p_id)
    WHEN 'athlete' THEN private.manages_athlete(p_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION private.manages_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND (
        private.manages_team(c.team_id)
        OR private.manages_club(c.club_id)
        OR c.created_by = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_qr_target(p_target_type text, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_target_type
    WHEN 'team' THEN private.manages_team(p_target_id)
    WHEN 'club' THEN private.manages_club(p_target_id)
    WHEN 'athlete' THEN private.manages_athlete(p_target_id)
    WHEN 'campaign' THEN private.manages_campaign(p_target_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION private.owns_cart(p_cart_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.carts WHERE id = p_cart_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.owns_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION private.current_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_team(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_club(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_athlete(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_beneficiary(public.beneficiary_type, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_campaign(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.manages_qr_target(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_cart(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_order(uuid) TO anon, authenticated, service_role;

-- Recrée chaque policy pour référencer private.* au lieu de public.* (DROP +
-- CREATE : RLS exige une définition complète, pas un simple rename).
-- Comportement IDENTIQUE à la migration 0003 — seul le schéma des fonctions
-- d'aide change.

DROP POLICY IF EXISTS profiles_select_own_or_admin ON profiles;
CREATE POLICY profiles_select_own_or_admin ON profiles FOR SELECT
  USING (id = auth.uid() OR private.is_platform_admin());

DROP POLICY IF EXISTS profiles_update_own_or_admin ON profiles;
CREATE POLICY profiles_update_own_or_admin ON profiles FOR UPDATE
  USING (id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (id = auth.uid() OR private.is_platform_admin());

DROP POLICY IF EXISTS addresses_owner ON addresses;
CREATE POLICY addresses_owner ON addresses FOR ALL
  USING (user_id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR private.is_platform_admin());

DROP POLICY IF EXISTS clubs_select ON clubs;
CREATE POLICY clubs_select ON clubs FOR SELECT
  USING (private.is_platform_admin() OR private.manages_club(id));

DROP POLICY IF EXISTS clubs_insert_admin ON clubs;
CREATE POLICY clubs_insert_admin ON clubs FOR INSERT
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS clubs_update_scoped ON clubs;
CREATE POLICY clubs_update_scoped ON clubs FOR UPDATE
  USING (private.is_platform_admin() OR private.manages_club(id))
  WITH CHECK (private.is_platform_admin() OR private.manages_club(id));

DROP POLICY IF EXISTS clubs_delete_admin ON clubs;
CREATE POLICY clubs_delete_admin ON clubs FOR DELETE
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams FOR SELECT
  USING (private.is_platform_admin() OR private.manages_club(club_id) OR private.manages_team(id));

DROP POLICY IF EXISTS teams_insert ON teams;
CREATE POLICY teams_insert ON teams FOR INSERT
  WITH CHECK (private.is_platform_admin() OR private.manages_club(club_id));

DROP POLICY IF EXISTS teams_update ON teams;
CREATE POLICY teams_update ON teams FOR UPDATE
  USING (private.is_platform_admin() OR private.manages_club(club_id) OR private.manages_team(id))
  WITH CHECK (private.is_platform_admin() OR private.manages_club(club_id) OR private.manages_team(id));

DROP POLICY IF EXISTS teams_delete ON teams;
CREATE POLICY teams_delete ON teams FOR DELETE
  USING (private.is_platform_admin() OR private.manages_club(club_id));

DROP POLICY IF EXISTS athletes_select ON athletes;
CREATE POLICY athletes_select ON athletes FOR SELECT
  USING (private.is_platform_admin() OR private.manages_athlete(id));

DROP POLICY IF EXISTS athletes_insert ON athletes;
CREATE POLICY athletes_insert ON athletes FOR INSERT
  WITH CHECK (
    private.is_platform_admin()
    OR guardian_id = auth.uid()
    OR private.manages_team(team_id)
  );

DROP POLICY IF EXISTS athletes_update ON athletes;
CREATE POLICY athletes_update ON athletes FOR UPDATE
  USING (private.is_platform_admin() OR private.manages_athlete(id))
  WITH CHECK (private.is_platform_admin() OR private.manages_athlete(id));

DROP POLICY IF EXISTS athletes_delete ON athletes;
CREATE POLICY athletes_delete ON athletes FOR DELETE
  USING (private.is_platform_admin() OR private.manages_athlete(id));

DROP POLICY IF EXISTS memberships_select_own_or_admin ON memberships;
CREATE POLICY memberships_select_own_or_admin ON memberships FOR SELECT
  USING (user_id = auth.uid() OR private.is_platform_admin());

DROP POLICY IF EXISTS memberships_write_admin ON memberships;
CREATE POLICY memberships_write_admin ON memberships FOR ALL
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS product_categories_admin_write ON product_categories;
CREATE POLICY product_categories_admin_write ON product_categories FOR ALL
  USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS products_admin_all ON products;
CREATE POLICY products_admin_all ON products FOR ALL
  USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS credit_rules_staff_read ON credit_rules;
CREATE POLICY credit_rules_staff_read ON credit_rules FOR SELECT
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS credit_rules_admin_write ON credit_rules;
CREATE POLICY credit_rules_admin_write ON credit_rules FOR ALL
  USING (private.is_platform_admin()) WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS campaigns_select_scoped ON campaigns;
CREATE POLICY campaigns_select_scoped ON campaigns FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.manages_team(team_id)
    OR private.manages_club(club_id)
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS campaigns_insert_scoped ON campaigns;
CREATE POLICY campaigns_insert_scoped ON campaigns FOR INSERT
  WITH CHECK (
    private.is_platform_admin()
    OR private.manages_team(team_id)
    OR private.manages_club(club_id)
  );

DROP POLICY IF EXISTS campaigns_update_scoped ON campaigns;
CREATE POLICY campaigns_update_scoped ON campaigns FOR UPDATE
  USING (
    private.is_platform_admin()
    OR private.manages_team(team_id)
    OR private.manages_club(club_id)
    OR created_by = auth.uid()
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.manages_team(team_id)
    OR private.manages_club(club_id)
  );

DROP POLICY IF EXISTS campaigns_delete_admin ON campaigns;
CREATE POLICY campaigns_delete_admin ON campaigns FOR DELETE
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS campaign_participants_scoped ON campaign_participants;
CREATE POLICY campaign_participants_scoped ON campaign_participants FOR ALL
  USING (private.is_platform_admin() OR private.manages_campaign(campaign_id))
  WITH CHECK (private.is_platform_admin() OR private.manages_campaign(campaign_id));

DROP POLICY IF EXISTS campaign_products_scoped ON campaign_products;
CREATE POLICY campaign_products_scoped ON campaign_products FOR ALL
  USING (private.is_platform_admin() OR private.manages_campaign(campaign_id))
  WITH CHECK (private.is_platform_admin() OR private.manages_campaign(campaign_id));

DROP POLICY IF EXISTS qr_codes_scoped ON qr_codes;
CREATE POLICY qr_codes_scoped ON qr_codes FOR ALL
  USING (private.is_platform_admin() OR private.manages_qr_target(target_type, target_id))
  WITH CHECK (private.is_platform_admin() OR private.manages_qr_target(target_type, target_id));

DROP POLICY IF EXISTS carts_owner ON carts;
CREATE POLICY carts_owner ON carts FOR ALL
  USING (user_id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR private.is_platform_admin());

DROP POLICY IF EXISTS cart_items_owner ON cart_items;
CREATE POLICY cart_items_owner ON cart_items FOR ALL
  USING (private.owns_cart(cart_id) OR private.is_platform_admin())
  WITH CHECK (private.owns_cart(cart_id) OR private.is_platform_admin());

DROP POLICY IF EXISTS cart_beneficiaries_owner ON cart_beneficiaries;
CREATE POLICY cart_beneficiaries_owner ON cart_beneficiaries FOR ALL
  USING (private.owns_cart(cart_id) OR private.is_platform_admin())
  WITH CHECK (private.owns_cart(cart_id) OR private.is_platform_admin());

DROP POLICY IF EXISTS orders_select_scoped ON orders;
CREATE POLICY orders_select_scoped ON orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR private.is_platform_admin()
    OR private.current_user_role() IN ('support', 'logistics', 'accounting')
  );

DROP POLICY IF EXISTS orders_admin_update ON orders;
CREATE POLICY orders_admin_update ON orders FOR UPDATE
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS order_items_select_scoped ON order_items;
CREATE POLICY order_items_select_scoped ON order_items FOR SELECT
  USING (
    private.owns_order(order_id)
    OR private.is_platform_admin()
    OR private.current_user_role() IN ('support', 'logistics', 'accounting')
  );

DROP POLICY IF EXISTS order_credits_select_staff ON order_credits;
CREATE POLICY order_credits_select_staff ON order_credits FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.current_user_role() = 'accounting'
    OR private.manages_beneficiary(beneficiary_type, beneficiary_id)
  );

DROP POLICY IF EXISTS order_credits_admin_update ON order_credits;
CREATE POLICY order_credits_admin_update ON order_credits FOR UPDATE
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS credit_audit_log_staff_read ON credit_audit_log;
CREATE POLICY credit_audit_log_staff_read ON credit_audit_log FOR SELECT
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS tax_rates_admin_write ON tax_rates;
CREATE POLICY tax_rates_admin_write ON tax_rates FOR ALL
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting')
  WITH CHECK (private.is_platform_admin() OR private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS distribution_lists_scoped ON distribution_lists;
CREATE POLICY distribution_lists_scoped ON distribution_lists FOR ALL
  USING (
    private.is_platform_admin()
    OR private.current_user_role() = 'logistics'
    OR private.manages_campaign(campaign_id)
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.current_user_role() = 'logistics'
    OR private.manages_campaign(campaign_id)
  );

DROP POLICY IF EXISTS payouts_staff_read ON payouts;
CREATE POLICY payouts_staff_read ON payouts FOR SELECT
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS payouts_staff_write ON payouts;
CREATE POLICY payouts_staff_write ON payouts FOR ALL
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting')
  WITH CHECK (private.is_platform_admin() OR private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS email_log_staff_read ON email_log;
CREATE POLICY email_log_staff_read ON email_log FOR SELECT
  USING (private.is_platform_admin() OR private.current_user_role() = 'support');

-- Anciennes fonctions public.* : plus aucune policy n'y référence après le
-- bloc ci-dessus, on les supprime (pas de CASCADE nécessaire).
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.is_platform_admin();
DROP FUNCTION IF EXISTS public.manages_team(uuid);
DROP FUNCTION IF EXISTS public.manages_club(uuid);
DROP FUNCTION IF EXISTS public.manages_athlete(uuid);
DROP FUNCTION IF EXISTS public.manages_beneficiary(public.beneficiary_type, uuid);
DROP FUNCTION IF EXISTS public.manages_campaign(uuid);
DROP FUNCTION IF EXISTS public.manages_qr_target(text, uuid);
DROP FUNCTION IF EXISTS public.owns_cart(uuid);
DROP FUNCTION IF EXISTS public.owns_order(uuid);
