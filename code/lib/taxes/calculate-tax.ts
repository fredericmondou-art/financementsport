/**
 * Calcul de la taxe (Tâche 1.5). Fonction PURE, testable : reçoit le taux déjà
 * résolu (lib/taxes/rates.ts) et le sous-total TAXABLE en centimes -- ne va
 * jamais chercher le taux elle-même (même séparation lecture/calcul que
 * lib/credits/resolve-rule.ts + calculate.ts).
 *
 * CLAUDE.md section 4 : tout montant est un integer en centimes. Arrondi au
 * centime le plus proche (`Math.round`), comme c'est l'usage standard pour
 * une taxe de vente -- contrairement au crédit (Tâche 1.3), où l'arrondi à
 * la baisse était explicitement exigé par le cahier pour ne jamais sur-créditer
 * un bénéficiaire. Décision autonome, voir docs/DECISIONS.md.
 *
 * Seules les lignes `products.is_taxable = true` doivent entrer dans
 * `taxableSubtotalCents` -- c'est la responsabilité de l'appelant (qui a
 * accès aux lignes du panier) de ne sommer que celles-ci.
 */
export function calculateTaxCents(taxableSubtotalCents: number, rateBps: number): number {
  if (taxableSubtotalCents < 0) {
    throw new Error('taxableSubtotalCents ne peut pas être négatif.');
  }
  if (rateBps < 0) {
    throw new Error('rateBps ne peut pas être négatif.');
  }
  return Math.round((taxableSubtotalCents * rateBps) / 10000);
}
