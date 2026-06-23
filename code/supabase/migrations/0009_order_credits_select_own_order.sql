-- Tâche 1.6.A3 (docs/prompts/phase-1-6.md) -- espace parent : afficher
-- l'impact généré par bénéficiaire, pour SES PROPRES commandes.
--
-- Gap RLS découvert en construisant cette tâche : `order_credits_select_staff`
-- (migration 0005) n'autorise que le staff (platform_admin, accounting, ou le
-- gestionnaire du bénéficiaire visé) à lire `order_credits` -- aucune policy
-- ne permet au client propriétaire de la commande de lire le crédit que SON
-- PROPRE achat a généré, contrairement à `order_items_select_scoped` (même
-- migration 0005) qui inclut déjà `private.owns_order(order_id)`.
--
-- Décision autonome (CLAUDE.md section 9 : choix mineur, pattern déjà établi
-- pour `order_items` ; voir docs/DECISIONS.md, Tâche 1.6.A3) : policy SELECT
-- ADDITIVE. Postgres combine plusieurs policies SELECT permissives par OR --
-- celle-ci ne remplace donc PAS `order_credits_select_staff`, les deux
-- coexistent (un membre du staff continue d'avoir accès via l'autre policy).
DROP POLICY IF EXISTS order_credits_select_own_order ON order_credits;
CREATE POLICY order_credits_select_own_order ON order_credits
  FOR SELECT
  USING (private.owns_order(order_id));
