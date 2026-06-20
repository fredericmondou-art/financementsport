-- ============================================================================
-- Migration 0004 : durcissement des privilèges EXECUTE sur les fonctions
-- d'aide RLS (SECURITY DEFINER)
-- ============================================================================
-- Contexte : l'advisor de sécurité Supabase (lints anon_security_definer_
-- function_executable / authenticated_security_definer_function_executable)
-- a signalé que toutes les fonctions d'aide RLS créées en 0003
-- (current_user_role, is_platform_admin, manages_*, owns_*) ainsi que
-- handle_new_auth_user (0002) étaient exécutables directement par anon via
-- l'API REST (/rest/v1/rpc/...). Supabase accorde EXECUTE explicitement à
-- anon et authenticated à la création d'une fonction dans le schéma public
-- (pas seulement via PUBLIC) — un simple `REVOKE ... FROM PUBLIC` est donc
-- insuffisant, il faut revoquer explicitement de anon et authenticated.
--
-- Ces fonctions ne doivent être invoquées que par le moteur de policies RLS
-- lors de l'évaluation d'une requête par un utilisateur connecté (rôle
-- authenticated) — jamais en appel RPC direct, et jamais par anon.
-- handle_new_auth_user n'est appelée que par le trigger on_auth_user_created
-- : aucun rôle n'a besoin de l'exécuter directement.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_team(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_team(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_club(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_club(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_athlete(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_athlete(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_beneficiary(public.beneficiary_type, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_beneficiary(public.beneficiary_type, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_campaign(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_campaign(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.manages_qr_target(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manages_qr_target(text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.owns_cart(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_cart(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.owns_order(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_order(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated;
