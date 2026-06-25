-- ============================================================================
-- Migration 0020 : accès lecture campagnes/équipes pour le rôle accounting
-- (Tâche 1.5.11 -- Export des commandes admin)
-- ============================================================================
-- Contexte : `orders_select_scoped`/`order_items_select_scoped`/
-- `order_credits_select_staff` (migration 0005) accordent déjà à
-- `accounting` (et `platform_admin`, toujours en court-circuit via
-- `private.is_platform_admin()`) la lecture de `orders`/`order_items`/
-- `order_credits` -- mais PAS de `campaigns` ni `teams`. `campaigns_select_
-- scoped`/`teams_select` (0003/0005) ne couvrent que platform_admin et les
-- responsables (`manages_team`/`manages_club`/`created_by`), jamais
-- `accounting` directement.
--
-- L'export de commandes (lib/export/orders.ts) a besoin de résoudre le nom
-- de la campagne/équipe de chaque commande (colonnes "Campagne"/"Équipe") et
-- de lister les campagnes/équipes pour les filtres combinables de la page --
-- `accounting` ne pouvait donc pas voir ces noms malgré son accès en lecture
-- déjà accordé sur les commandes elles-mêmes.
--
-- Décision autonome (voir docs/DECISIONS.md, Tâche 1.5.11) : policies
-- SUPPLÉMENTAIRES (Postgres combine plusieurs policies permissives FOR
-- SELECT avec OR), même patron que la migration 0014 -- aucune modification
-- des policies existantes, donc aucun risque de régression sur les chemins
-- déjà testés. Portée volontairement étroite : SELECT seulement, et
-- seulement pour `accounting` (platform_admin a toujours accès via les
-- policies existantes).
-- ============================================================================

DROP POLICY IF EXISTS campaigns_select_staff ON campaigns;
CREATE POLICY campaigns_select_staff ON campaigns FOR SELECT
  USING (private.current_user_role() = 'accounting');

DROP POLICY IF EXISTS teams_select_staff ON teams;
CREATE POLICY teams_select_staff ON teams FOR SELECT
  USING (private.current_user_role() = 'accounting');
