/**
 * Calcul du crédit par bénéficiaire pour une commande (Tâche 1.3 — CŒUR).
 *
 * Fonction PURE : entrées → sortie, aucune écriture DB ici (l'écriture des
 * `order_credits` est la Tâche 1.5). Toute l'arithmétique est entière, en
 * CENTIMES (CLAUDE.md section 4) — jamais de `float` pour un montant.
 *
 * Hypothèse de portée retenue pour cette tâche (documentée dans
 * docs/DECISIONS.md) : UNE commande a UNE campagne de contexte au plus
 * (cohérent avec `orders.primary_campaign_id`), partagée par tous ses
 * bénéficiaires — pas de campagne distincte par bénéficiaire. Le crédit
 * total de la commande est calculé une fois (somme des lignes), puis
 * réparti entre bénéficiaires via `share_bps`.
 */
import { resolveRule, type CreditRuleRow } from './resolve-rule';

export type BeneficiaryType = 'athlete' | 'team' | 'club';

export interface CreditLineInput {
  productId: string;
  quantity: number;
  /** Prix unitaire en centimes (figé au moment de l'ajout, comme
   * `cart_items.unit_price_cents` / `order_items.unit_price_cents`). */
  unitPriceCents: number;
  /** `products.fixed_credit_cents` pour ce produit, `null` si crédit
   * variable via `credit_rules`. */
  fixedCreditCents: number | null;
}

export interface BeneficiaryShare {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  /** Points de base ; la validation `SUM(share_bps) = 10000` est la
   * responsabilité de l'appelant (Tâche 1.4, avant même d'arriver ici) — voir
   * la note en bas de fichier sur le comportement si la somme n'est pas
   * 10000. */
  shareBps: number;
}

export interface CalculateOrderCreditsInput {
  lines: CreditLineInput[];
  campaignId: string | null;
  isCampaignActive: boolean;
  rules: CreditRuleRow[];
  beneficiaries: BeneficiaryShare[];
  globalScope?: string;
}

export interface LineCreditResult {
  productId: string;
  creditCents: number;
  appliedRuleId: string | null;
  computationNote: string;
}

export interface BeneficiaryCreditResult {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  shareBps: number;
  amountCents: number;
}

export interface CalculateOrderCreditsResult {
  totalCreditCents: number;
  lineCredits: LineCreditResult[];
  beneficiaryCredits: BeneficiaryCreditResult[];
}

function basketSubtotalCents(lines: CreditLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

/**
 * Crédit pour UNE ligne de commande, règle déjà résolue.
 * - Mode `fixed_product` : crédit fixe par unité, AUCUN bonus de seuil (le
 *   crédit fixe d'un pack ne dépend pas du sous-total du panier).
 * - Mode `rule` : `percent_bps` du sous-total de la LIGNE + bonus de seuil
 *   (`bonus_percent_bps`, ajouté au taux si le sous-total du PANIER entier
 *   atteint `min_basket_cents`) + `flat_cents` par unité. `percent_bps` et
 *   `flat_cents` peuvent être combinés (contrainte `credit_rule_mode` du
 *   schéma : au moins l'un des deux est renseigné, pas exclusif).
 * - Mode `none` : aucune règle ne s'applique, crédit 0 (cas explicitement
 *   couvert par les tests, pas une erreur).
 */
function computeLineCreditCents(
  basis: ReturnType<typeof resolveRule>,
  line: CreditLineInput,
  basketSubtotal: number,
): number {
  if (basis.mode === 'none') {
    return 0;
  }
  if (basis.mode === 'fixed_product') {
    return basis.unitCreditCents * line.quantity;
  }

  const rule = basis.rule;
  const lineSubtotalCents = line.unitPriceCents * line.quantity;

  let effectivePercentBps = rule.percent_bps ?? 0;
  if (
    rule.min_basket_cents !== null &&
    rule.bonus_percent_bps !== null &&
    basketSubtotal >= rule.min_basket_cents
  ) {
    effectivePercentBps += rule.bonus_percent_bps;
  }

  const percentPartCents = Math.floor((lineSubtotalCents * effectivePercentBps) / 10000);
  const flatPartCents = (rule.flat_cents ?? 0) * line.quantity;
  return percentPartCents + flatPartCents;
}

/**
 * Répartit un crédit total entre bénéficiaires selon `share_bps`. Arrondi à
 * la baisse pour chacun, puis le ou les centimes résiduels (somme des
 * arrondis < total) sont attribués au PREMIER bénéficiaire du tableau —
 * comportement déterministe explicitement exigé par le cahier (section 13,
 * critère d'acceptation Tâche 1.2/1.3).
 *
 * Ne valide PAS que `SUM(shareBps) = 10000` : cette validation appartient à
 * la couche panier (Tâche 1.4), qui doit bloquer le checkout avant d'arriver
 * ici. Si la somme des parts diffère de 10000 malgré tout (défense en
 * profondeur), le total réellement réparti peut différer de
 * `totalCreditCents` — c'est un signal de bug amont, pas quelque chose que
 * cette fonction doit masquer en corrigeant silencieusement les parts.
 */
export function splitCreditAmongBeneficiaries(
  totalCreditCents: number,
  beneficiaries: BeneficiaryShare[],
): BeneficiaryCreditResult[] {
  if (beneficiaries.length === 0) {
    return [];
  }

  const flooredEntries = beneficiaries.map((beneficiary) => ({
    beneficiary,
    flooredAmountCents: Math.floor((totalCreditCents * beneficiary.shareBps) / 10000),
  }));
  const allocatedCents = flooredEntries.reduce((sum, entry) => sum + entry.flooredAmountCents, 0);
  const remainderCents = totalCreditCents - allocatedCents;

  return flooredEntries.map((entry, index) => ({
    beneficiaryType: entry.beneficiary.beneficiaryType,
    beneficiaryId: entry.beneficiary.beneficiaryId,
    shareBps: entry.beneficiary.shareBps,
    amountCents: entry.flooredAmountCents + (index === 0 ? remainderCents : 0),
  }));
}

/** Calcule le crédit de chaque ligne, le total de la commande, puis sa
 * répartition entre bénéficiaires. C'est le point d'entrée principal du
 * moteur de crédit. */
export function calculateOrderCredits(
  input: CalculateOrderCreditsInput,
): CalculateOrderCreditsResult {
  const basketSubtotal = basketSubtotalCents(input.lines);

  const lineCredits: LineCreditResult[] = input.lines.map((line) => {
    const basis = resolveRule({
      productId: line.productId,
      fixedCreditCents: line.fixedCreditCents,
      campaignId: input.campaignId,
      isCampaignActive: input.isCampaignActive,
      rules: input.rules,
      globalScope: input.globalScope,
    });
    return {
      productId: line.productId,
      creditCents: computeLineCreditCents(basis, line, basketSubtotal),
      appliedRuleId: basis.appliedRuleId,
      computationNote: basis.computationNote,
    };
  });

  const totalCreditCents = lineCredits.reduce((sum, line) => sum + line.creditCents, 0);
  const beneficiaryCredits = splitCreditAmongBeneficiaries(totalCreditCents, input.beneficiaries);

  return { totalCreditCents, lineCredits, beneficiaryCredits };
}
