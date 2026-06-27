/**
 * Ventilation des taxes pour l'AFFICHAGE du panier (Tâche 1.4b.4,
 * docs/prompts/phase-1-4b.md) : « Afficher le détail : sous-total, TPS (5 %),
 * TVQ (9,975 %), total — clairement, avant le paiement. »
 *
 * Présentation uniquement (CLAUDE.md section 9 : « ne change pas la logique
 * de calcul »). Ne duplique aucun calcul d'argent — compose exclusivement des
 * fonctions PURES déjà écrites et testées ailleurs :
 * - `calculateTaxCents` (lib/taxes/calculate-tax.ts, Tâche 1.5) : même calcul
 *   exact que `lib/checkout/prepare-checkout.ts#computeCheckoutTotals`,
 *   utilisé pour la vraie session Stripe.
 * - `splitQcTax` (lib/reports/campaign.ts, Tâche 1.5.9) : même ventilation
 *   TPS/TVQ déjà utilisée pour les rapports de campagne et l'export des
 *   commandes (Tâche 1.5.11) — reliquat d'arrondi toujours à la TVQ.
 *
 * Le taux combiné (`combinedRateBps`) doit être lu depuis `tax_rates` par
 * l'appelant (jamais codé en dur ici, CLAUDE.md section 2).
 */
import { calculateTaxCents } from '@/lib/taxes/calculate-tax';
import { splitQcTax } from '@/lib/reports/campaign';

export interface CartTaxLineInput {
  unitPriceCents: number;
  quantity: number;
  isTaxable: boolean;
}

export interface CartTaxBreakdown {
  subtotalCents: number;
  taxableSubtotalCents: number;
  tpsCents: number;
  tvqCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Fonction PURE. `combinedRateBps` à 0 (aucun taux applicable trouvé, cas
 * limite défensif) produit une taxe nulle plutôt qu'une division par zéro --
 * `splitQcTax`/`calculateTaxCents` gèrent déjà ce cas, voir leurs tests.
 */
export function computeCartTaxBreakdown(
  lines: CartTaxLineInput[],
  combinedRateBps: number,
): CartTaxBreakdown {
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const taxableSubtotalCents = lines
    .filter((line) => line.isTaxable)
    .reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const taxCents = calculateTaxCents(taxableSubtotalCents, combinedRateBps);
  const { tpsCents, tvqCents } = splitQcTax(taxCents, combinedRateBps);
  const totalCents = subtotalCents + taxCents;
  return { subtotalCents, taxableSubtotalCents, tpsCents, tvqCents, taxCents, totalCents };
}
