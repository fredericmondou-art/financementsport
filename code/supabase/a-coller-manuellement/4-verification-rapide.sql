-- ============================================================================
-- A COLLER DANS : Dashboard Supabase > SQL Editor > New query > Run
-- Lecture seule, ne modifie rien. Vérifie que les fichiers 1, 2 et 3 ont bien
-- été appliqués (Tâche 0.4).
-- ============================================================================

-- 1. RLS activée sur toutes les tables publiques (doit être 0 ligne)
SELECT tablename
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public' AND NOT c.relrowsecurity;

-- 2. Les vues publiques existent
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'v_public_%';

-- 3. Le masquage fonctionne : Emma doit avoir last_name NULL, Thomas son nom complet
SELECT first_name, last_name, display_name FROM v_public_athlete
WHERE id IN ('44444444-4444-4444-4444-444444444401', '44444444-4444-4444-4444-444444444402');

-- 4. Données du seed présentes
SELECT
  (SELECT count(*) FROM products WHERE kind = 'pack') AS packs,
  (SELECT count(*) FROM athletes) AS athletes,
  (SELECT count(*) FROM campaigns WHERE status = 'active') AS campagnes_actives,
  (SELECT rate_bps FROM tax_rates WHERE province = 'QC') AS taux_qc_bps;
