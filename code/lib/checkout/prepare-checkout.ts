/**
 * Validation et calcul des totaux AVANT création de la session Stripe
 * (Tâche 1.5). Fonctions PURES, testables sans réseau (CLAUDE.md section 8) :
 * l'appelant (app/api/checkout/route.ts) est seul responsable de charger les
 * données live (produits, taux de taxe) et de leur injection ici.
 *
 * Re-validation au moment du checkout (et non simplement à l'ajout au
 * panier) : le panier peut rester ouvert longtemps (jusqu'à abandon) -- le
 * stock ou la disponibilité d'un produit peuvent avoir changé depuis l'ajout
 * (CLAUDE.md section 7, cas limite "stock épuisé" / produit retiré).
 */
import { BusinessRuleError } from '@/lib/entities/errors';
import { calculateTaxCents } from '@/lib/taxes/calculate-tax';

export interface CheckoutLineInput {
  productId: string;
  productName: string;
  quantity: number;
  /** Prix figé au moment de l'ajout au panier (cart_items.unit_price_cents)
   * -- jamais recalculé depuis le catalogue, pour ne jamais surprendre le
   * client avec un prix différent de celui vu au panier. */
  unitPriceCents: number;
  isTaxable: boolean;
  /** Disponibilité ET stock relus EN DIRECT depuis `products` au moment du
   * checkout (pas depuis le panier, qui peut être périmé). */
  isActive: boolean;
  stockQuantity: number;
}

export interface CheckoutTotals {
  subtotalCents: number;
  taxableSubtotalCents: number;
  taxCents: number;
  /**
   * V1 : livraison gratuite/forfaitaire (0 ¢) -- aucune table de tarifs de
   * livraison n'existe dans le schéma fourni et le cahier ne spécifie aucun
   * modèle de coût de livraison pour cette tâche. Décision autonome
   * documentée dans docs/DECISIONS.md ; `orders.shipping_cents` reste prêt à
   * accueillir un vrai calcul quand ce modèle sera défini (Phase 2).
   */
  shippingCents: number;
  totalCents: number;
}

/**
 * Lève une `BusinessRuleError` si le panier ne peut pas être payé en l'état :
 * panier vide, produit retiré du catalogue depuis son ajout, ou stock
 * désormais insuffisant. Ne modifie rien -- à l'appelant de décider quoi
 * faire (ex. rediriger vers le panier avec un message).
 */
export function validateCheckoutLines(lines: CheckoutLineInput[]): void {
  if (lines.length === 0) {
    throw new BusinessRuleError('Votre panier est vide.');
  }
  for (const line of lines) {
    if (!line.isActive) {
      throw new BusinessRuleError(
        `Le produit « ${line.productName} » n'est plus disponible. Retirez-le de votre panier pour continuer.`,
      );
    }
    if (line.quantity > line.stockQuantity) {
      throw new BusinessRuleError(
        `Stock insuffisant pour « ${line.productName} » (${line.stockQuantity} disponible(s)). Ajustez la quantité.`,
      );
    }
  }
}

/**
 * Calcule les totaux de la commande à partir des lignes déjà validées.
 * Seules les lignes `isTaxable` entrent dans l'assiette taxable
 * (CLAUDE.md section 2 : TPS 5 % + TVQ 9,975 % via `tax_rates`).
 */
export function computeCheckoutTotals(lines: CheckoutLineInput[], taxRateBps: number): CheckoutTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const taxableSubtotalCents = lines
    .filter((line) => line.isTaxable)
    .reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const taxCents = calculateTaxCents(taxableSubtotalCents, taxRateBps);
  const shippingCents = 0;
  const totalCents = subtotalCents + taxCents + shippingCents;
  return { subtotalCents, taxableSubtotalCents, taxCents, shippingCents, totalCents };
}
