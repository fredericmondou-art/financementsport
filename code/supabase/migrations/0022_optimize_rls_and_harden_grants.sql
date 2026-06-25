-- 0022_optimize_rls_and_harden_grants.sql
-- Recommandations du point 7 de docs/AUDIT-2.0.md.
--
-- A) Réécrit les policies RLS qui ré-évaluaient auth.uid() par ligne, pour
--    qu'il soit évalué une seule fois par requête : (select auth.uid()).
--    AUCUN changement de comportement (même logique, juste un seul appel
--    de la fonction au lieu d'un appel par ligne examinée).
-- B) Fusionne les deux policies SELECT permissives de credit_rules en une
--    seule (elles étaient combinées par OR de toute façon ; les fusionner
--    évite une double évaluation de policy par ligne).
-- C) Retire le grant EXECUTE implicite (PUBLIC) sur la fonction trigger
--    handle_new_auth_user() : elle n'est appelée que par le trigger
--    lui-même (contexte SECURITY DEFINER), jamais par anon/authenticated
--    directement. Durcissement, pas un changement fonctionnel.
--
-- Voir docs/DECISIONS.md (2026-06-25) pour le détail et la justification.

-- A) Policies RLS — auth.uid() évalué une fois par requête

ALTER POLICY addresses_owner ON public.addresses
  USING (((user_id = (select auth.uid())) OR private.is_platform_admin()))
  WITH CHECK (((user_id = (select auth.uid())) OR private.is_platform_admin()));

ALTER POLICY athletes_insert ON public.athletes
  WITH CHECK ((private.is_platform_admin() OR (guardian_id = (select auth.uid())) OR private.manages_team(team_id)));

ALTER POLICY campaigns_select_scoped ON public.campaigns
  USING ((private.is_platform_admin() OR private.manages_team(team_id) OR private.manages_club(club_id) OR (created_by = (select auth.uid()))));

ALTER POLICY campaigns_update_scoped ON public.campaigns
  USING ((private.is_platform_admin() OR private.manages_team(team_id) OR private.manages_club(club_id) OR (created_by = (select auth.uid()))));

ALTER POLICY carts_owner ON public.carts
  USING (((user_id = (select auth.uid())) OR private.is_platform_admin()))
  WITH CHECK (((user_id = (select auth.uid())) OR private.is_platform_admin()));

ALTER POLICY memberships_select_own_or_admin ON public.memberships
  USING (((user_id = (select auth.uid())) OR private.is_platform_admin()));

ALTER POLICY orders_select_scoped ON public.orders
  USING (((user_id = (select auth.uid())) OR private.is_platform_admin() OR (private.current_user_role() = ANY (ARRAY['support'::user_role, 'logistics'::user_role, 'accounting'::user_role]))));

ALTER POLICY profiles_select_own_or_admin ON public.profiles
  USING (((id = (select auth.uid())) OR private.is_platform_admin()));

ALTER POLICY profiles_update_own_or_admin ON public.profiles
  USING (((id = (select auth.uid())) OR private.is_platform_admin()))
  WITH CHECK (((id = (select auth.uid())) OR private.is_platform_admin()));

-- B) Fusion des policies SELECT permissives en double sur credit_rules

DROP POLICY IF EXISTS credit_rules_read_active ON public.credit_rules;
DROP POLICY IF EXISTS credit_rules_staff_read ON public.credit_rules;

CREATE POLICY credit_rules_select ON public.credit_rules
  FOR SELECT
  USING (
    (is_active = true)
    OR private.is_platform_admin()
    OR (private.current_user_role() = 'accounting'::user_role)
  );

-- C) Durcissement du grant sur la fonction trigger

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
