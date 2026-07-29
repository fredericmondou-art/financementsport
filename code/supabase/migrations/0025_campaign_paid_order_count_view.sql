-- P.4 (SPEC-PARAMETRES-PLATEFORME.md, R4) : plafond de commandes payées par
-- campagne (`parametres_plateforme.campagne_commandes_max`). Le contrôle a
-- lieu dans `lib/checkout/create-checkout-session.ts`, AVANT la création de
-- la session Stripe -- exécuté par le client de session de l'ACHETEUR
-- (souvent un invité, `anon`), pas un admin.
--
-- Or `orders` n'a que `orders_select_scoped` (migration 0005) : le
-- propriétaire de la commande ou un gestionnaire d'équipe/admin/staff -- rien
-- pour "n'importe quel acheteur potentiel de cette campagne". Une lecture
-- brute de `orders` depuis le client de l'acheteur retournerait donc un
-- sous-ensemble silencieusement incomplet (au mieux ses propres commandes),
-- ce qui romprait complètement le plafond R4.
--
-- Même pattern déjà établi par `v_campaign_progress` (migration ~0001) et
-- `v_campaign_supporter_count` (migration 0011) : une vue d'AGRÉGATION, sans
-- PII (juste un compte), ouverte en lecture à `anon`/`authenticated` -- un
-- compte de commandes payées n'est pas une donnée sensible.
--
-- Mêmes statuts « payés » que `isOrderPaid` (lib/distribution/build-list.ts),
-- seule définition partagée du projet (CLAUDE.md section 4, "une seule
-- source de vérité") -- si cette liste change en TypeScript, cette vue DOIT
-- être mise à jour en même temps (voir docs/DECISIONS.md).
CREATE VIEW v_campaign_paid_order_count AS
SELECT
  primary_campaign_id AS campaign_id,
  COUNT(*) AS paid_order_count
FROM orders
WHERE primary_campaign_id IS NOT NULL
  AND status IN ('paid', 'preparing', 'ready', 'delivered_to_team', 'distributed', 'completed', 'partially_refunded')
GROUP BY primary_campaign_id;

GRANT SELECT ON v_campaign_paid_order_count TO anon, authenticated;
