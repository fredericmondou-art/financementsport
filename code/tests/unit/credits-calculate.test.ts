/**
 * Tests unitaires du calcul de crédit et de la répartition par bénéficiaire
 * (Tâche 1.3). Couvre les critères d'acceptation du cahier mot pour mot
 * (03-prompts-phase-0-et-1.md), le bonus de seuil, les arrondis, le crédit 0
 * et la campagne inactive.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateOrderCredits,
  splitCreditAmongBeneficiaries,
  type BeneficiaryShare,
  type CreditLineInput,
} from '@/lib/credits/calculate';
import type { CreditRuleRow } from '@/lib/credits/resolve-rule';

let nextId = 1;
function makeRule(overrides: Partial<CreditRuleRow> = {}): CreditRuleRow {
  const id = overrides.id ?? `rule-${nextId++}`;
  return {
    campaign_id: null,
    product_id: null,
    scope: 'default',
    percent_bps: null,
    flat_cents: null,
    min_basket_cents: null,
    bonus_percent_bps: null,
    priority: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
    id,
  };
}

function makeLine(overrides: Partial<CreditLineInput>): CreditLineInput {
  return {
    productId: 'pack-saison',
    quantity: 1,
    unitPriceCents: 0,
    fixedCreditCents: null,
    ...overrides,
  };
}

describe('calculateOrderCredits() — critères d’acceptation Tâche 1.3', () => {
  it('Pack Saison 120$ en campagne active à 15 % → 18$ de crédit', () => {
    const rule = makeRule({ campaign_id: 'camp-saison', percent_bps: 1500 });
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 12_000, fixedCreditCents: null })],
      campaignId: 'camp-saison',
      isCampaignActive: true,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'athlete', beneficiaryId: 'a1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(1_800);
    expect(result.lineCredits[0]).toMatchObject({ creditCents: 1_800, appliedRuleId: rule.id });
  });

  it('Hors campagne (boutique permanente) → taux permanent 5 %', () => {
    const permanentRule = makeRule({ scope: 'permanent', percent_bps: 500 });
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 10_000 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [permanentRule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(500);
    expect(result.lineCredits[0]?.appliedRuleId).toBe(permanentRule.id);
  });

  it('campagne inactive : retombe sur le taux permanent, pas le taux de campagne', () => {
    const campaignRule = makeRule({ campaign_id: 'camp-x', percent_bps: 2000 });
    const permanentRule = makeRule({ scope: 'permanent', percent_bps: 500 });
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 10_000 })],
      campaignId: 'camp-x',
      isCampaignActive: false,
      rules: [campaignRule, permanentRule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(500);
  });

  it('bonus de seuil : ajouté seulement si le sous-total du panier atteint min_basket_cents', () => {
    const rule = makeRule({
      scope: 'permanent',
      percent_bps: 500,
      min_basket_cents: 10_000,
      bonus_percent_bps: 200,
    });

    const belowThreshold = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 9_999 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(belowThreshold.totalCreditCents).toBe(Math.floor((9_999 * 500) / 10_000));

    const atThreshold = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 10_000 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    // 5% + 2% de bonus = 7% de 10 000 = 700.
    expect(atThreshold.totalCreditCents).toBe(700);
  });

  it('le crédit fixe d’un produit ignore le bonus de seuil même si le panier l’atteint', () => {
    const rule = makeRule({ scope: 'permanent', percent_bps: 500, min_basket_cents: 1, bonus_percent_bps: 9000 });
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 3_500, fixedCreditCents: 500, quantity: 2 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(1_000); // 500 * 2, pas de bonus appliqué
  });

  it('percent_bps et flat_cents combinés (les deux peuvent être renseignés sur une règle)', () => {
    const rule = makeRule({ scope: 'permanent', percent_bps: 500, flat_cents: 100 });
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 10_000, quantity: 2 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    // (10000*2 * 5%) + (100 * 2) = 1000 + 200 = 1200.
    expect(result.totalCreditCents).toBe(1_200);
  });

  it('cas crédit 0 : fixedCreditCents = 0 sur le produit', () => {
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 5_000, fixedCreditCents: 0 })],
      campaignId: null,
      isCampaignActive: false,
      rules: [],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(0);
    expect(result.beneficiaryCredits[0]?.amountCents).toBe(0);
  });

  it('cas crédit 0 : aucune règle ne correspond et aucun crédit fixe', () => {
    const result = calculateOrderCredits({
      lines: [makeLine({ unitPriceCents: 5_000, fixedCreditCents: null })],
      campaignId: null,
      isCampaignActive: false,
      rules: [],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    expect(result.totalCreditCents).toBe(0);
  });

  it('plusieurs lignes : le crédit total est la somme des crédits de chaque ligne', () => {
    const rule = makeRule({ scope: 'permanent', percent_bps: 1000 });
    const result = calculateOrderCredits({
      lines: [
        makeLine({ productId: 'p1', unitPriceCents: 1_000, fixedCreditCents: null }),
        makeLine({ productId: 'p2', unitPriceCents: 2_000, fixedCreditCents: 50 }),
      ],
      campaignId: null,
      isCampaignActive: false,
      rules: [rule],
      beneficiaries: [{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 }],
    });
    // p1 : 10% de 1000 = 100. p2 : crédit fixe 50.
    expect(result.lineCredits).toHaveLength(2);
    expect(result.totalCreditCents).toBe(150);
  });
});

describe('splitCreditAmongBeneficiaries() — répartition et arrondis', () => {
  it('50/50 d’un crédit de 18$ → 9$ + 9$', () => {
    const beneficiaries: BeneficiaryShare[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a1', shareBps: 5_000 },
      { beneficiaryType: 'athlete', beneficiaryId: 'a2', shareBps: 5_000 },
    ];
    const result = splitCreditAmongBeneficiaries(1_800, beneficiaries);
    expect(result.map((r) => r.amountCents)).toEqual([900, 900]);
  });

  it('50/50 d’un crédit impair (9,01$ = 901 cents) → 4,51$ + 4,50$ (arrondi au premier)', () => {
    const beneficiaries: BeneficiaryShare[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a1', shareBps: 5_000 },
      { beneficiaryType: 'athlete', beneficiaryId: 'a2', shareBps: 5_000 },
    ];
    const result = splitCreditAmongBeneficiaries(901, beneficiaries);
    expect(result.map((r) => r.amountCents)).toEqual([451, 450]);
    expect(result.reduce((sum, r) => sum + r.amountCents, 0)).toBe(901);
  });

  it('répartition à 3 bénéficiaires avec arrondi non trivial (1000 cents, parts égales 33,33%)', () => {
    const beneficiaries: BeneficiaryShare[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a1', shareBps: 3_334 },
      { beneficiaryType: 'athlete', beneficiaryId: 'a2', shareBps: 3_333 },
      { beneficiaryType: 'athlete', beneficiaryId: 'a3', shareBps: 3_333 },
    ];
    const result = splitCreditAmongBeneficiaries(1_000, beneficiaries);
    expect(result.reduce((sum, r) => sum + r.amountCents, 0)).toBe(1_000);
    // Le résidu d'arrondi va au premier bénéficiaire du tableau.
    expect(result[0]?.amountCents).toBeGreaterThanOrEqual(result[1]?.amountCents ?? 0);
  });

  it('un seul bénéficiaire (100 %) reçoit la totalité, sans résidu', () => {
    const result = splitCreditAmongBeneficiaries(1_234, [
      { beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000 },
    ]);
    expect(result).toEqual([{ beneficiaryType: 'club', beneficiaryId: 'c1', shareBps: 10_000, amountCents: 1_234 }]);
  });

  it('crédit total de 0 → chaque bénéficiaire reçoit 0', () => {
    const result = splitCreditAmongBeneficiaries(0, [
      { beneficiaryType: 'athlete', beneficiaryId: 'a1', shareBps: 5_000 },
      { beneficiaryType: 'athlete', beneficiaryId: 'a2', shareBps: 5_000 },
    ]);
    expect(result.map((r) => r.amountCents)).toEqual([0, 0]);
  });

  it('aucun bénéficiaire → tableau vide (pas d’erreur)', () => {
    expect(splitCreditAmongBeneficiaries(1_000, [])).toEqual([]);
  });
});
