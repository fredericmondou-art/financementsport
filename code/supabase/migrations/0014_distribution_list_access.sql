-- ============================================================================
-- Migration 0014 : accès lecture pour les responsables de campagne
-- (Tâche 1.5.4 -- Liste de distribution par équipe)
-- ============================================================================
-- Contexte : `distribution_lists_scoped` (migration 0005) accorde déjà à
-- `private.manages_campaign(campaign_id)` un accès complet à la table
-- `distribution_lists` -- cette table existait dès 0001_initial_schema.sql
-- en amorce de la Phase 1.5, mais ne stocke qu'un statut de cycle de vie
-- ('draft'|'ready'|'distributed'), PAS le contenu de la liste : le contenu
-- (commandes regroupées par athlète/client) est recalculé à la demande à
-- partir de `orders`/`order_items`/`order_credits` (source de vérité,
-- CLAUDE.md section 4 : "Les soldes ne se stockent pas en dur").
--
-- Or, en lisant les policies existantes pour préparer cette tâche
-- (`orders_select_scoped`, `order_items_select_scoped`, 0005), aucune des
-- deux n'accorde l'accès via `manages_campaign()` -- seulement
-- propriétaire/admin/support/logistics/accounting. Un `team_manager` ou
-- `club_admin` (le "responsable" visé par la section 24 du cahier) ne
-- pouvait donc PAS lire les commandes de sa propre campagne. Pareillement,
-- `profiles_select_own_or_admin` ne permet de lire QUE son propre profil (ou
-- l'admin) : impossible pour un responsable de connaître le nom du client
-- ayant passé une commande, pourtant explicitement requis par l'objectif de
-- cette tâche ("commandes regroupées par athlète puis par CLIENT").
--
-- Décision autonome (voir docs/DECISIONS.md, Tâche 1.5.4) : combler cet
-- écart avec des policies SUPPLÉMENTAIRES (Postgres combine plusieurs
-- policies permissives FOR SELECT avec OR), plutôt que de modifier les
-- policies existantes -- changement isolé, sans risque de régression sur les
-- chemins déjà testés (CLAUDE.md section 6 : petits changements atomiques).
-- Portée volontairement étroite : seulement SELECT, seulement les lignes
-- liées à une campagne que l'utilisateur gère réellement
-- (`private.manages_campaign`, déjà utilisé pour `campaigns`/`qr_codes`/
-- `distribution_lists`). Pour `profiles`, la portée est encore plus étroite :
-- uniquement le profil d'un acheteur ayant au moins une commande sur une
-- campagne gérée par l'utilisateur courant -- jamais un accès général aux
-- profils.
-- ============================================================================

DROP POLICY IF EXISTS orders_select_campaign_managers ON orders;
CREATE POLICY orders_select_campaign_managers ON orders FOR SELECT
  USING (private.manages_campaign(primary_campaign_id));

DROP POLICY IF EXISTS order_items_select_campaign_managers ON order_items;
CREATE POLICY order_items_select_campaign_managers ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND private.manages_campaign(o.primary_campaign_id)
    )
  );

DROP POLICY IF EXISTS profiles_select_campaign_buyers ON profiles;
CREATE POLICY profiles_select_campaign_buyers ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.user_id = profiles.id
        AND private.manages_campaign(o.primary_campaign_id)
    )
  );
