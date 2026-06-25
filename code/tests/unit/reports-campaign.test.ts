/**
 * Tests unitaires du rapport financier de campagne (Tâche 1.5.9, docs/
 * prompts/phase-1-5.md) : `lib/reports/campaign.ts`.
 *
 * Comme pour `tests/unit/dashboards-admin.test.ts`, le repo Supabase réel
 * (`createSupabaseCampaignReportRepo`) n'est volontairement PAS exercé ici --
 * fine couche de requêtes, pas de logique métier. Seules les fonctions PURES
 * sont testées, sur un jeu de données CONNU (cahier : « unitaire : exactitude
 * de chaque ligne du rapport sur un jeu de données connu, ventilation
 * TPS/TVQ »).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BILLING_PROVINCE,
  QC_TPS_RATE_BPS,
  buildCampaignReport,
  computeProductCost,
  computeProfitEstimate,
  findApplicableTaxRateBps,
  splitQcTax,
  summarizeCreditTotal,
  summarizePaymentFees,
  summarizeSales,
  summarizeTaxBreakdown,
  type OrderCreditRow,
  type OrderRow,
  type PayoutRow,
  type TaxRateRow,
} from '@/lib/reports/campaign';

function makeOrder(overrides: Partial<OrderRow> & Pick<OrderRow, 'id' | 'status' | 'total_cents'>): OrderRow {
  return {
    order_number: `CMD-${overrides.id}`,
    user_id: null,
    guest_email: null,
    subtotal_cents: overrides.total_cents,
    tax_cents: 0,
    shipping_cents: 0,
    credit_total_cents: 0,
    shipping_address_id: null,
    primary_campaign_id: 'camp-1',
    team_id: null,
    stripe_payment_intent_id: null,
    notes_internal: null,
    created_at: '2026-01-01T00:00:00Z',
    paid_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as OrderRow;
}

function makeCredit(
  overrides: Partial<OrderCreditRow> & Pick<OrderCreditRow, 'id' | 'amount_cents' | 'status'>,
): OrderCreditRow {
  return {
    order_id: 'order-x',
    beneficiary_type: 'athlete',
    beneficiary_id: 'a1',
    campaign_id: 'camp-1',
    applied_rule_id: null,
    computation_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as OrderCreditRow;
}

function makePayout(overrides: Partial<PayoutRow> & Pick<PayoutRow, 'id' | 'fee_held_cents'>): PayoutRow {
  return {
    campaign_id: 'camp-1',
    beneficiary_type: 'athlete',
    beneficiary_id: 'a1',
    amount_cents: 0,
    status: 'calculated',
    approved_by: null,
    paid_at: null,
    proof_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as PayoutRow;
}

const QC_RATE: TaxRateRow = {
  id: 'rate-qc',
  province: 'QC',
  rate_bps: 1498,
  label: 'TPS 5% + TVQ 9.975% (taux combiné Québec)',
  effective_at: '2026-01-01T00:00:00Z',
};

describe('splitQcTax', () => {
  it('ventile exactement TPS/TVQ pour un taux combiné connu (1498 bps)', () => {
    const split = splitQcTax(1498, 1498);
    // TPS = round(1498 * 500/1498) = 500 ; TVQ = 1498 - 500 = 998
    expect(split.tpsCents).toBe(500);
    expect(split.tvqCents).toBe(998);
    expect(split.tpsCents + split.tvqCents).toBe(1498);
  });

  it('taxCents=0 : TPS=TVQ=0, jamais de division par zéro', () => {
    expect(splitQcTax(0, 1498)).toEqual({ tpsCents: 0, tvqCents: 0 });
  });

  it('combinedRateBps<=0 (défensif) : tout attribué à la TVQ, jamais de division par zéro', () => {
    expect(splitQcTax(1000, 0)).toEqual({ tpsCents: 0, tvqCents: 1000 });
  });

  it('le reste de l\'arrondi est toujours absorbé par la TVQ -- somme exacte garantie', () => {
    // 1497 n'est pas un multiple "rond" : round(1497*500/1498) = round(499.666) = 500
    const split = splitQcTax(1497, 1498);
    expect(split.tpsCents + split.tvqCents).toBe(1497);
  });

  it('QC_TPS_RATE_BPS vaut 500 (5%, taux fédéral fixe)', () => {
    expect(QC_TPS_RATE_BPS).toBe(500);
  });
});

describe('findApplicableTaxRateBps', () => {
  const rates: TaxRateRow[] = [
    { id: 'r1', province: 'QC', rate_bps: 1400, label: null, effective_at: '2025-01-01T00:00:00Z' },
    { id: 'r2', province: 'QC', rate_bps: 1498, label: null, effective_at: '2026-01-01T00:00:00Z' },
  ];

  it('retourne le taux le plus récent déjà passé', () => {
    expect(findApplicableTaxRateBps(rates, 'QC', '2026-06-01T00:00:00Z')).toBe(1498);
  });

  it('retourne le taux antérieur si la date demandée précède le changement', () => {
    expect(findApplicableTaxRateBps(rates, 'QC', '2025-06-01T00:00:00Z')).toBe(1400);
  });

  it('aucun taux applicable (date antérieure à tout) : null', () => {
    expect(findApplicableTaxRateBps(rates, 'QC', '2024-01-01T00:00:00Z')).toBeNull();
  });

  it('province sans taux configuré : null', () => {
    expect(findApplicableTaxRateBps(rates, 'ON', '2026-06-01T00:00:00Z')).toBeNull();
  });
});

describe('summarizeSales', () => {
  it('ventes brutes/nettes calculées uniquement sur les commandes payées (isOrderPaid)', () => {
    const orders = [
      { status: 'paid' as const, total_cents: 11498, tax_cents: 1498, shipping_cents: 0 },
      { status: 'completed' as const, total_cents: 5000, tax_cents: 0, shipping_cents: 0 },
      { status: 'cancelled' as const, total_cents: 9999, tax_cents: 999, shipping_cents: 0 }, // exclue
    ];
    const summary = summarizeSales(orders);
    expect(summary.orderCount).toBe(2);
    expect(summary.grossSalesCents).toBe(16498);
    expect(summary.taxCents).toBe(1498);
    expect(summary.netSalesCents).toBe(15000); // ventes brutes - taxes (critère d'acceptation)
  });

  it('aucune commande : tout à 0', () => {
    expect(summarizeSales([])).toEqual({
      orderCount: 0,
      grossSalesCents: 0,
      taxCents: 0,
      shippingCents: 0,
      netSalesCents: 0,
    });
  });
});

describe('summarizeTaxBreakdown', () => {
  it('ventile TPS/TVQ commande par commande puis somme -- total exact', () => {
    const orders = [
      makeOrder({ id: 'o1', status: 'paid', total_cents: 11498, tax_cents: 1498 }),
      makeOrder({ id: 'o2', status: 'completed', total_cents: 11498, tax_cents: 1498 }),
      makeOrder({ id: 'o3', status: 'cancelled', total_cents: 1498, tax_cents: 1498 }), // exclue
    ];
    const split = summarizeTaxBreakdown(orders, [QC_RATE], DEFAULT_BILLING_PROVINCE);
    expect(split.tpsCents).toBe(1000); // 500 x 2
    expect(split.tvqCents).toBe(1996); // 998 x 2
    expect(split.tpsCents + split.tvqCents).toBe(2996); // = somme des tax_cents payées
  });

  it('commande payée avec tax_cents=0 (produit non taxable) : ignorée sans erreur', () => {
    const orders = [makeOrder({ id: 'o1', status: 'paid', total_cents: 1000, tax_cents: 0 })];
    expect(summarizeTaxBreakdown(orders, [QC_RATE])).toEqual({ tpsCents: 0, tvqCents: 0 });
  });

  it('aucun taux trouvé pour la date de la commande (défensif) : ventile quand même sans planter (tout en TVQ)', () => {
    const orders = [makeOrder({ id: 'o1', status: 'paid', total_cents: 1498, tax_cents: 1498, paid_at: '2020-01-01T00:00:00Z' })];
    const split = summarizeTaxBreakdown(orders, [QC_RATE]);
    expect(split.tpsCents).toBe(0);
    expect(split.tvqCents).toBe(1498);
  });

  it('utilise `created_at` si `paid_at` est absent', () => {
    const orders = [makeOrder({ id: 'o1', status: 'paid', total_cents: 1498, tax_cents: 1498, paid_at: null, created_at: '2026-06-01T00:00:00Z' })];
    const split = summarizeTaxBreakdown(orders, [QC_RATE]);
    expect(split.tpsCents).toBe(500);
  });
});

describe('summarizePaymentFees', () => {
  it('somme `fee_held_cents` quel que soit le statut du versement', () => {
    const payouts = [
      makePayout({ id: 'p1', fee_held_cents: 100 }),
      makePayout({ id: 'p2', fee_held_cents: 250 }),
    ];
    expect(summarizePaymentFees(payouts)).toBe(350);
  });

  it('aucun versement : 0', () => {
    expect(summarizePaymentFees([])).toBe(0);
  });
});

describe('summarizeCreditTotal', () => {
  it('ne compte que les crédits `active` (critère d\'acceptation explicite)', () => {
    const credits = [
      makeCredit({ id: 'c1', amount_cents: 5000, status: 'active' }),
      makeCredit({ id: 'c2', amount_cents: 3000, status: 'pending' }), // exclu
      makeCredit({ id: 'c3', amount_cents: 1000, status: 'expired' }), // exclu
      makeCredit({ id: 'c4', amount_cents: 2000, status: 'active' }),
    ];
    expect(summarizeCreditTotal(credits)).toBe(7000);
  });

  it('aucun crédit : 0', () => {
    expect(summarizeCreditTotal([])).toBe(0);
  });
});

describe('computeProductCost', () => {
  it('toujours non disponible en V1 (aucune colonne de coût)', () => {
    const result = computeProductCost();
    expect(result.costCents).toBeNull();
    expect(result.reason).toBeTruthy();
  });
});

describe('computeProfitEstimate', () => {
  it('profit = ventes nettes - frais de paiement - livraison - crédit total (coût exclu)', () => {
    const result = computeProfitEstimate({
      netSalesCents: 15000,
      paymentFeesCents: 500,
      shippingCents: 0,
      creditTotalCents: 7000,
      productCostCents: null,
    });
    expect(result.profitEstimateCents).toBe(7500); // 15000 - 500 - 0 - 7000
    expect(result.profitEstimateExcludesCost).toBe(true);
  });

  it('si le coût produits était un jour disponible, il serait déduit et signalé', () => {
    const result = computeProfitEstimate({
      netSalesCents: 15000,
      paymentFeesCents: 500,
      shippingCents: 0,
      creditTotalCents: 7000,
      productCostCents: 1000,
    });
    expect(result.profitEstimateCents).toBe(6500);
    expect(result.profitEstimateExcludesCost).toBe(false);
  });

  it('peut être négatif (campagne déficitaire) -- pas de plancher artificiel à 0', () => {
    const result = computeProfitEstimate({
      netSalesCents: 1000,
      paymentFeesCents: 500,
      shippingCents: 0,
      creditTotalCents: 2000,
      productCostCents: null,
    });
    expect(result.profitEstimateCents).toBe(-1500);
  });
});

describe('buildCampaignReport (assemblage complet, données connues)', () => {
  it('assemble toutes les lignes de façon cohérente, exactitude vérifiée ligne par ligne', () => {
    const orders = [
      makeOrder({ id: 'o1', status: 'paid', total_cents: 11498, tax_cents: 1498, shipping_cents: 0 }),
      makeOrder({ id: 'o2', status: 'cancelled', total_cents: 9999, tax_cents: 999 }), // exclue des ventes
    ];
    const credits = [makeCredit({ id: 'c1', amount_cents: 4000, status: 'active' })];
    const payouts = [makePayout({ id: 'p1', fee_held_cents: 200 })];

    const report = buildCampaignReport({
      campaignId: 'camp-1',
      campaignName: 'Campagne A',
      orders,
      credits,
      payouts,
      taxRates: [QC_RATE],
      frozen: false,
      generatedAt: '2026-06-24T12:00:00Z',
    });

    expect(report.orderCount).toBe(1);
    expect(report.grossSalesCents).toBe(11498);
    expect(report.taxTotalCents).toBe(1498);
    expect(report.tpsCents).toBe(500);
    expect(report.tvqCents).toBe(998);
    expect(report.netSalesCents).toBe(10000); // 11498 - 1498
    expect(report.productCostCents).toBeNull();
    expect(report.paymentFeesCents).toBe(200);
    expect(report.shippingCents).toBe(0);
    expect(report.creditTotalCents).toBe(4000);
    expect(report.profitEstimateCents).toBe(5800); // 10000 - 200 - 0 - 4000
    expect(report.profitEstimateExcludesCost).toBe(true);
    expect(report.frozen).toBe(false);
  });

  it('aucune commande/crédit/versement : toutes les sommes à 0, pas d\'erreur', () => {
    const report = buildCampaignReport({
      campaignId: 'camp-1',
      campaignName: 'Campagne vide',
      orders: [],
      credits: [],
      payouts: [],
      taxRates: [],
      frozen: false,
      generatedAt: '2026-06-24T12:00:00Z',
    });
    expect(report.orderCount).toBe(0);
    expect(report.grossSalesCents).toBe(0);
    expect(report.netSalesCents).toBe(0);
    expect(report.creditTotalCents).toBe(0);
    expect(report.profitEstimateCents).toBe(0);
  });
});
