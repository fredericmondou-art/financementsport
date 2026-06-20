-- =============================================================================
-- Migration 0007 — Vue publique de campagne (Tâche 1.6)
--
-- Lacune identifiée à la Tâche 0.4 et tranchée ici (voir docs/DECISIONS.md,
-- entrée « Tâche 1.6 ») : la table `campaigns` n'a aucune policy SELECT pour
-- `anon` (migration 0003, `campaigns_select_scoped` réservée au staff scope
-- via is_platform_admin/manages_team/manages_club/created_by). Les pages
-- publiques athlète/équipe/club (objectif, message public, dates) ont besoin
-- d'une lecture publique filtrée — même mécanisme que `v_public_athlete` /
-- `v_public_team` / `v_public_club` (migration 0005) : vue `SECURITY
-- DEFINER` implicite (propriétaire bypass RLS), colonnes limitées au strict
-- nécessaire à l'affichage public, filtrée au statut 'active' UNIQUEMENT
-- (aucune campagne draft/pending_approval/scheduled/ended/closed/paid/
-- cancelled/archived n'est jamais exposée à anon — une campagne qui n'est
-- plus active ne doit pas continuer à apparaître publiquement).
-- =============================================================================

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
  c.ends_at
FROM public.campaigns c
WHERE c.status = 'active';

COMMENT ON VIEW public.v_public_campaign IS
  'Vue publique (Tâche 1.6) : seules les campagnes status=''active'' sont '
  'exposées à anon/authenticated. Aucune colonne interne (created_by, '
  'approved_at, closed_at, club_id, team_id) — voir docs/DECISIONS.md.';

-- Packs « recommandés » d'une campagne active : jointure campaign_products
-- -> campaigns (active uniquement) -> products (actif uniquement), pour ne
-- jamais révéler la curation de produits d'une campagne non publique, ni un
-- produit retiré du catalogue.
CREATE OR REPLACE VIEW public.v_public_campaign_products AS
SELECT cp.campaign_id, cp.product_id
FROM public.campaign_products cp
JOIN public.campaigns c ON c.id = cp.campaign_id AND c.status = 'active'
JOIN public.products p ON p.id = cp.product_id AND p.is_active = true;

COMMENT ON VIEW public.v_public_campaign_products IS
  'Vue publique (Tâche 1.6) : packs recommandés d''une campagne active, '
  'limités aux produits encore actifs.';

GRANT SELECT ON public.v_public_campaign TO anon, authenticated;
GRANT SELECT ON public.v_public_campaign_products TO anon, authenticated;
