-- =============================================================================
-- Migration 0012 — Tâche 1.5.1 : résolution + comptage atomique d'un scan QR.
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md) :
--   - `app/api/qr/[code]` doit, à chaque accès : lire la cible du code QR ET
--     incrémenter `scan_count`, "sans bloquer la redirection si l'écriture
--     échoue" (cahier, Tâche 1.5.1). Faire un SELECT puis un UPDATE séparés
--     depuis la route ouvrirait une fenêtre de course (deux scans simultanés
--     du même code pourraient se marcher sur les pieds, comme le stock dans
--     `create_paid_order`, migration 0006) -- une seule instruction SQL
--     UPDATE ... RETURNING est intrinsèquement atomique et évite ce problème
--     sans verrou explicite.
--   - Cette fonction ne fait QUE lire/incrémenter -- toute la décision de
--     redirection (campagne terminée -> boutique, bénéficiaire masqué, etc.)
--     reste en TypeScript testable (`lib/qr/resolve-target.ts`), conforme à
--     CLAUDE.md section 6 (logique métier hors SQL).
--   - Appelée exclusivement par la route serveur via le client service_role
--     (commentaire RLS de la migration 0003, section 11) : pas de
--     SECURITY DEFINER nécessaire, service_role contourne déjà RLS de par
--     son rôle.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resolve_and_count_qr_scan(p_code text)
RETURNS TABLE (
  target_type text,
  target_id uuid,
  redirect_url text,
  expires_at timestamptz
)
LANGUAGE sql
AS $$
  UPDATE public.qr_codes
  SET scan_count = scan_count + 1
  WHERE code = p_code
  RETURNING qr_codes.target_type, qr_codes.target_id, qr_codes.redirect_url, qr_codes.expires_at;
$$;
