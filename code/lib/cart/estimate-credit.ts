/**
 * Crédit estimé d'un panier (Tâche 1.4).
 *
 * Règle explicite du cahier : "Le crédit affiché utilise
 * lib/credits/calculate.ts (jamais un calcul dupliqué dans l'UI)." — ce
 * module se contente d'ASSEMBLER les entrées du moteur (Tâche 1.3) à partir
 * de l'état du panier ; aucune arithmétique de crédit ici, uniquement du
 * mapping de formes de données.
 *
 * `campaignId`/`isCampaignActive` sont des paramètres de CE module (pas
 * dérivés de `cart_beneficiaries.campaign_id`) : un panier a une seule
 * campagne de contexte, cohérent avec la décision de la Tâche 1.3 (voir
 * docs/DECISIONS.md) — c'est à l'appelant (route/page) de déterminer cette
 * campagne (ex. depuis l'URL d'une page de campagne, ou `null` pour un achat
 * boutique permanent).
 */
import {
  calculateOrderCredits,
  type CalculateOrderCreditsResult,
  type CreditLineInput,
} from '@/lib/credits/calculate';
import type { CreditRuleRow } from '@/lib/credits/resolve-rule';
import { formatCents } from '@/lib/format-cents';
import type { CartBeneficiaryRow } from './beneficiaries';
import type { CartItemRow } from './items';

/** Information produit nécessaire au moteur de crédit, en plus de ce qui est
 * déjà figé sur la ligne de panier (`unit_price_cents`). */
export interface CartItemCreditInfo {
  fixedCreditCents: number | null;
}

export interface EstimateCartCreditParams {
  items: CartItemRow[];
  /** `fixed_credit_cents` de chaque produit présent dans `items`, indexé par
   * `product_id` — chargé par l'appelant (lib/catalog/products.ts), jamais
   * dupliqué/deviné ici. */
  productCreditInfoById: Map<string, CartItemCreditInfo>;
  beneficiaries: CartBeneficiaryRow[];
  campaignId: string | null;
  isCampaignActive: boolean;
  rules: CreditRuleRow[];
  globalScope?: string;
}

/**
 * Assemble les lignes du moteur de crédit à partir des articles du panier.
 * Un produit absent de `productCreditInfoById` est traité comme n'ayant pas
 * de crédit fixe (`null`) — ne devrait pas arriver si l'appelant charge bien
 * l'info pour chaque `product_id` présent dans `items`, mais ne bloque pas
 * l'affichage si jamais un produit a été retiré du catalogue entre-temps.
 */
function toCreditLines(
  items: CartItemRow[],
  productCreditInfoById: Map<string, CartItemCreditInfo>,
): CreditLineInput[] {
  return items.map((item) => ({
    productId: item.product_id,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    fixedCreditCents: productCreditInfoById.get(item.product_id)?.fixedCreditCents ?? null,
  }));
}

export function estimateCartCredit(params: EstimateCartCreditParams): CalculateOrderCreditsResult {
  return calculateOrderCredits({
    lines: toCreditLines(params.items, params.productCreditInfoById),
    campaignId: params.campaignId,
    isCampaignActive: params.isCampaignActive,
    rules: params.rules,
    beneficiaries: params.beneficiaries.map((beneficiary) => ({
      beneficiaryType: beneficiary.beneficiary_type,
      beneficiaryId: beneficiary.beneficiary_id,
      shareBps: beneficiary.share_bps,
    })),
    globalScope: params.globalScope,
  });
}

/**
 * Message obligatoire du cahier : « Votre achat générera X $ pour
 * [bénéficiaire]. ». `beneficiaryLabel` est le nom d'affichage déjà résolu
 * par l'appelant (nom de l'athlète/équipe/club) — ce module ne fait aucune
 * requête, uniquement le formatage du montant (CLAUDE.md section 4 :
 * centimes -> affichage via `formatCents`, déjà testé).
 */
export function formatCreditMessage(amountCents: number, beneficiaryLabel: string): string {
  // Certains libellés (voir lib/cart/beneficiary-labels.ts, abréviation du
  // nom de famille masqué) se terminent déjà par un point ("Thomas T.") --
  // on évite le double point final plutôt que de l'accepter tel quel.
  const label = beneficiaryLabel.endsWith('.') ? beneficiaryLabel.slice(0, -1) : beneficiaryLabel;
  return `Votre achat générera ${formatCents(amountCents)} pour ${label}.`;
}
