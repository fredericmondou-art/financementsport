/**
 * Sélection des packs "recommandés" affichés sur une page publique
 * (Tâche 1.6). Fonction pure : reçoit des listes déjà chargées, ne fait
 * aucun I/O — réutilise `sortProducts` (Tâche 1.2, déjà testée) plutôt que
 * de dupliquer une logique de tri.
 */
import { sortProducts, type ProductRow } from '@/lib/catalog/products';

/**
 * Si la campagne active a une curation explicite (`campaign_products`), on
 * s'y limite ; sinon repli sur tout le catalogue actif — jamais une liste
 * vide de recommandations s'il existe des produits actifs, même sans
 * campagne. Tri par crédit indicatif décroissant : met en avant les
 * produits qui financent le plus le bénéficiaire.
 */
export function selectRecommendedProducts(
  allActiveProducts: ProductRow[],
  campaignProductIds: string[],
  limit = 4,
): ProductRow[] {
  const candidates =
    campaignProductIds.length > 0
      ? allActiveProducts.filter((product) => campaignProductIds.includes(product.id))
      : allActiveProducts;
  return sortProducts(candidates, 'credit_desc').slice(0, limit);
}
