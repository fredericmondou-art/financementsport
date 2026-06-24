-- Tâche 1.6.C2 : nombre de "supporters" affiché à l'athlète/tuteur sur la
-- page de suivi de progression.
--
-- Pourquoi une vue d'agrégation et pas une lecture directe de
-- `order_credits` depuis l'application : `order_credits` n'a que deux
-- policies RLS SELECT (migration 0009) -- `order_credits_select_staff`
-- (admin/manager) et `order_credits_select_own_order` (le PROPRIÉTAIRE de la
-- commande, c.-à-d. l'acheteur). Aucune policy ne donne accès au
-- bénéficiaire du crédit ni à son tuteur : un parent qui consulte le suivi
-- de son enfant n'est pas forcément l'acheteur de chaque commande qui l'a
-- soutenu (un supporter externe peut acheter sans créer de compte lié au
-- tuteur). Une lecture brute via le client de session du tuteur retournerait
-- donc un sous-ensemble silencieusement incomplet.
--
-- Plutôt que d'ajouter une policy supplémentaire sur `order_credits` (qui
-- exposerait des montants/lignes détaillées au-delà du besoin réel de cette
-- page -- juste un compte), on suit exactement le pattern déjà établi par
-- `v_campaign_progress` (migration ~0007) : une vue d'agrégation, sans PII,
-- ouverte en lecture à `anon`/`authenticated`. Le nombre de supporters n'est
-- pas une donnée sensible (CLAUDE.md section 2 : profil "Standard" par
-- défaut, montants déjà publics sauf `hide_amounts`) -- voir docs/DECISIONS.md.
--
-- "Supporter" = une commande distincte ayant généré un crédit actif/en
-- attente pour la campagne (PAS une personne unique : ce projet n'a pas
-- d'identité unifiée invité/connecté, CLAUDE.md section 63). Mêmes statuts
-- que `v_campaign_progress` pour rester cohérent avec le montant amassé
-- affiché juste au-dessus.
CREATE VIEW v_campaign_supporter_count AS
SELECT
  campaign_id,
  COUNT(DISTINCT order_id) AS supporter_count
FROM order_credits
WHERE status IN ('active', 'pending')
GROUP BY campaign_id;

GRANT SELECT ON v_campaign_supporter_count TO anon, authenticated;
