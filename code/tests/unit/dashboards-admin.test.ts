/**
 * Tests unitaires du dashboard admin plateforme (Tâche 1.5.7, docs/prompts/
 * phase-1-5.md) : `lib/dashboards/admin.ts`.
 *
 * Comme pour `tests/unit/dashboards-team.test.ts`, le repo Supabase réel
 * (`createSupabaseAdminDashboardRepo`) n'est volontairement PAS exercé ici --
 * fine couche de requêtes, pas de logique métier. Seules les fonctions PURES
 * sont testées, sur un jeu de données CONNU (cahier : « unitaire : calcul des
 * indicateurs sur jeu de données connu »).
 */
import { describe, expect, it } from 'vitest';
import {
  AT_RISK_DAYS_THRESHOLD,
  AT_RISK_PROGRESS_RATIO_THRESHOLD,
  buildAdminDashboard,
  canViewAdminDashboard,
  computeGrossMargin,
  computeRaisedCentsByCampaign,
  countActiveCampaigns,
  findAtRiskCampaigns,
  summarizeCreditsDue,
  summarizeFailedPayments,
  summarizePopularProducts,
  summarizeRefunds,
  summarizeRevenue,
  type CampaignRow,
  type OrderCreditRow,
  type OrderItemRow,
  type OrderRow,
  type PayoutRow,
} from '@/lib/dashboards/admin';
import type { CampaignStatus, OrderStatus } from '@/lib/db/types';

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
    primary_campaign_id: null,
    team_id: null,
    stripe_payment_intent_id: null,
    notes_internal: null,
    created_at: '2024-01-01T00:00:00Z',
    paid_at: null,
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as OrderRow;
}

function makeOrderItem(
  overrides: Partial<OrderItemRow> &
    Pick<OrderItemRow, 'id' | 'order_id' | 'product_id' | 'product_name' | 'quantity' | 'line_total_cents'>,
): OrderItemRow {
  return {
    unit_price_cents: overrides.line_total_cents,
    ...overrides,
  } as OrderItemRow;
}

function makeCredit(
  overrides: Partial<OrderCreditRow> &
    Pick<OrderCreditRow, 'id' | 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>,
): OrderCreditRow {
  return {
    order_id: 'order-x',
    campaign_id: null,
    applied_rule_id: null,
    computation_note: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as OrderCreditRow;
}

function makePayout(
  overrides: Partial<PayoutRow> &
    Pick<PayoutRow, 'id' | 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>,
): PayoutRow {
  return {
    campaign_id: null,
    fee_held_cents: 0,
    approved_by: null,
    paid_at: null,
    proof_url: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as PayoutRow;
}

function makeCampaign(
  overrides: Partial<CampaignRow> & Pick<CampaignRow, 'id' | 'name' | 'status'>,
): CampaignRow {
  return {
    type: 'athlete',
    slug: `slug-${overrides.id}`,
    public_message: null,
    beneficiary_type: 'athlete',
    beneficiary_id: 'athlete-x',
    club_id: null,
    team_id: null,
    goal_cents: null,
    starts_at: null,
    ends_at: null,
    created_by: null,
    approved_at: null,
    closed_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as CampaignRow;
}

describe('summarizeRevenue', () => {
  const orders: Array<Pick<OrderRow, 'status' | 'total_cents'>> = [
    { status: 'paid', total_cents: 5000 },
    { status: 'ready', total_cents: 3000 },
    { status: 'cancelled', total_cents: 9999 }, // payée=non, mais compte dans totalOrderCount
    { status: 'error', total_cents: 1234 }, // idem
    { status: 'completed', total_cents: 1000 },
  ];

  it('totalise les revenus uniquement sur les commandes payées (isOrderPaid)', () => {
    const summary = summarizeRevenue(orders);
    expect(summary.totalRevenueCents).toBe(9000); // 5000+3000+1000
    expect(summary.paidOrderCount).toBe(3);
  });

  it('"commandes totales" compte TOUTES les commandes, tous statuts confondus', () => {
    const summary = summarizeRevenue(orders);
    expect(summary.totalOrderCount).toBe(5);
  });

  it('panier moyen arrondi, calculé uniquement sur les commandes payées', () => {
    const summary = summarizeRevenue(orders);
    expect(summary.averageBasketCents).toBe(3000); // 9000/3
  });

  it('renvoie 0 pour le panier moyen et les revenus sans aucune commande payée', () => {
    const summary = summarizeRevenue([{ status: 'cancelled', total_cents: 500 }]);
    expect(summary.totalRevenueCents).toBe(0);
    expect(summary.paidOrderCount).toBe(0);
    expect(summary.averageBasketCents).toBe(0);
    expect(summary.totalOrderCount).toBe(1);
  });

  it('tableau vide : tout à 0, aucune erreur', () => {
    expect(summarizeRevenue([])).toEqual({
      totalRevenueCents: 0,
      paidOrderCount: 0,
      totalOrderCount: 0,
      averageBasketCents: 0,
    });
  });
});

describe('computeGrossMargin', () => {
  it('renvoie toujours "non disponible" en V1 (aucune colonne de coût)', () => {
    const result = computeGrossMargin();
    expect(result.availableCents).toBeNull();
    expect(result.reason).toBeTruthy();
  });
});

describe('summarizeCreditsDue', () => {
  it('crédits dus = somme des crédits actifs par bénéficiaire, hors `pending`', () => {
    const credits = [
      makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 10000, status: 'active' }),
      makeCredit({ id: 'c2', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 5000, status: 'pending' }), // exclu
      makeCredit({ id: 'c3', beneficiary_type: 'team', beneficiary_id: 't1', amount_cents: 2000, status: 'active' }),
    ];
    const summary = summarizeCreditsDue(credits, []);
    expect(summary.dueCents).toBe(12000); // 10000 + 2000, PAS les 5000 pending
    expect(summary.paidCents).toBe(0);
  });

  it('« crédits dus » diminue quand un versement passe à `paid` (critère d\'acceptation explicite)', () => {
    const credits = [makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 10000, status: 'active' })];

    const beforePayout = summarizeCreditsDue(credits, [
      makePayout({ id: 'p1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 10000, status: 'calculated' }),
    ]);
    expect(beforePayout.dueCents).toBe(10000); // versement pas encore payé : toujours dû

    const afterPayout = summarizeCreditsDue(credits, [
      makePayout({ id: 'p1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 10000, status: 'paid' }),
    ]);
    expect(afterPayout.dueCents).toBe(0); // versement payé : plus rien dû
    expect(afterPayout.paidCents).toBe(10000);
  });

  it('un versement payé partiel laisse un solde dû positif pour ce bénéficiaire', () => {
    const credits = [makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 10000, status: 'active' })];
    const payouts = [makePayout({ id: 'p1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 4000, status: 'paid' })];
    expect(summarizeCreditsDue(credits, payouts).dueCents).toBe(6000);
  });

  it('ne devient jamais négatif même si le versement payé dépasse le crédit actif (défensif)', () => {
    const credits = [makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 1000, status: 'active' })];
    const payouts = [makePayout({ id: 'p1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 5000, status: 'paid' })];
    expect(summarizeCreditsDue(credits, payouts).dueCents).toBe(0);
  });

  it('`paidCents` somme TOUS les versements payés, même sans crédit actif correspondant', () => {
    const payouts = [
      makePayout({ id: 'p1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 3000, status: 'paid' }),
      makePayout({ id: 'p2', beneficiary_type: 'team', beneficiary_id: 't1', amount_cents: 7000, status: 'paid' }),
      makePayout({ id: 'p3', beneficiary_type: 'team', beneficiary_id: 't2', amount_cents: 1000, status: 'in_validation' }), // exclu
    ];
    expect(summarizeCreditsDue([], payouts).paidCents).toBe(10000);
  });

  it('aucune donnée : tout à 0', () => {
    expect(summarizeCreditsDue([], [])).toEqual({ dueCents: 0, paidCents: 0 });
  });
});

describe('countActiveCampaigns', () => {
  it('ne compte que le statut `active`', () => {
    const campaigns: Array<{ status: CampaignStatus }> = [
      { status: 'active' },
      { status: 'active' },
      { status: 'ended' },
      { status: 'draft' },
    ];
    expect(countActiveCampaigns(campaigns)).toBe(2);
  });
});

describe('computeRaisedCentsByCampaign', () => {
  it('regroupe les crédits actifs/pending par campagne, ignore les autres statuts', () => {
    const credits = [
      makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 1000, status: 'active', campaign_id: 'camp-1' }),
      makeCredit({ id: 'c2', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 500, status: 'pending', campaign_id: 'camp-1' }),
      makeCredit({ id: 'c3', beneficiary_type: 'athlete', beneficiary_id: 'a2', amount_cents: 9999, status: 'expired', campaign_id: 'camp-1' }), // exclu
      makeCredit({ id: 'c4', beneficiary_type: 'athlete', beneficiary_id: 'a3', amount_cents: 2000, status: 'active', campaign_id: 'camp-2' }),
      makeCredit({ id: 'c5', beneficiary_type: 'athlete', beneficiary_id: 'a4', amount_cents: 100, status: 'active', campaign_id: null }), // sans campagne, ignoré
    ];
    const totals = computeRaisedCentsByCampaign(credits);
    expect(totals.get('camp-1')).toBe(1500);
    expect(totals.get('camp-2')).toBe(2000);
    expect(totals.has('camp-3')).toBe(false);
  });
});

describe('findAtRiskCampaigns', () => {
  const now = new Date('2026-06-01T00:00:00Z');

  it('seuils exacts : 14 jours et 50% (constantes exportées, documentées dans DECISIONS.md)', () => {
    expect(AT_RISK_DAYS_THRESHOLD).toBe(14);
    expect(AT_RISK_PROGRESS_RATIO_THRESHOLD).toBe(0.5);
  });

  it('active, proche de la fin (<=14j), loin de l\'objectif (<50%) : À RISQUE', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-06-10T00:00:00Z', goal_cents: 100000 }),
    ];
    const raised = new Map([['camp-1', 30000]]); // 30%
    const result = findAtRiskCampaigns(campaigns, raised, now);
    expect(result).toHaveLength(1);
    expect(result[0]?.campaignId).toBe('camp-1');
    expect(result[0]?.progressRatio).toBeCloseTo(0.3);
  });

  it('pile à 50% d\'objectif : PAS à risque (seuil exclusif, >= n\'est pas < 50%)', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-06-10T00:00:00Z', goal_cents: 100000 }),
    ];
    const raised = new Map([['camp-1', 50000]]); // exactement 50%
    expect(findAtRiskCampaigns(campaigns, raised, now)).toHaveLength(0);
  });

  it('pile à 14 jours : À RISQUE (borne inclusive)', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-06-15T00:00:00Z', goal_cents: 100000 }),
    ];
    expect(findAtRiskCampaigns(campaigns, new Map([['camp-1', 0]]), now)).toHaveLength(1);
  });

  it('15 jours ou plus : PAS à risque (hors seuil)', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-06-16T00:00:00Z', goal_cents: 100000 }),
    ];
    expect(findAtRiskCampaigns(campaigns, new Map([['camp-1', 0]]), now)).toHaveLength(0);
  });

  it('campagne déjà terminée (ends_at dans le passé) : exclue, pas "à risque" mais "terminée"', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-05-01T00:00:00Z', goal_cents: 100000 }),
    ];
    expect(findAtRiskCampaigns(campaigns, new Map([['camp-1', 0]]), now)).toHaveLength(0);
  });

  it('campagne non active (ex. `ended`/`draft`) : jamais à risque même si elle matcherait sinon', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'ended', ends_at: '2026-06-10T00:00:00Z', goal_cents: 100000 }),
    ];
    expect(findAtRiskCampaigns(campaigns, new Map([['camp-1', 0]]), now)).toHaveLength(0);
  });

  it('sans `ends_at` ou sans `goal_cents` : exclue (impossible à évaluer), pas une erreur', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-1', name: 'Sans échéance', status: 'active', ends_at: null, goal_cents: 100000 }),
      makeCampaign({ id: 'camp-2', name: 'Sans objectif', status: 'active', ends_at: '2026-06-05T00:00:00Z', goal_cents: null }),
    ];
    expect(findAtRiskCampaigns(campaigns, new Map(), now)).toHaveLength(0);
  });

  it('triée par urgence croissante (moins de jours restants en premier)', () => {
    const campaigns = [
      makeCampaign({ id: 'camp-far', name: 'Loin', status: 'active', ends_at: '2026-06-14T00:00:00Z', goal_cents: 100000 }),
      makeCampaign({ id: 'camp-near', name: 'Proche', status: 'active', ends_at: '2026-06-02T00:00:00Z', goal_cents: 100000 }),
    ];
    const result = findAtRiskCampaigns(campaigns, new Map(), now);
    expect(result.map((c) => c.campaignId)).toEqual(['camp-near', 'camp-far']);
  });
});

describe('summarizePopularProducts', () => {
  const orderStatusById = new Map<string, OrderStatus>([
    ['o1', 'paid'],
    ['o2', 'cancelled'], // exclue
    ['o3', 'completed'],
  ]);
  const items = [
    makeOrderItem({ id: 'i1', order_id: 'o1', product_id: 'p1', product_name: 'Chandail', quantity: 2, line_total_cents: 6000 }),
    makeOrderItem({ id: 'i2', order_id: 'o3', product_id: 'p1', product_name: 'Chandail', quantity: 1, line_total_cents: 3000 }),
    makeOrderItem({ id: 'i3', order_id: 'o1', product_id: 'p2', product_name: 'Casquette', quantity: 5, line_total_cents: 5000 }),
    makeOrderItem({ id: 'i4', order_id: 'o2', product_id: 'p3', product_name: 'Bouteille', quantity: 99, line_total_cents: 99000 }), // exclue (commande annulée)
  ];

  it('agrège unités/revenu par produit, uniquement sur commandes payées', () => {
    const result = summarizePopularProducts(items, orderStatusById);
    const byId = new Map(result.map((p) => [p.productId, p]));
    expect(byId.get('p1')).toEqual({ productId: 'p1', productName: 'Chandail', unitsSold: 3, revenueCents: 9000 });
    expect(byId.get('p2')).toEqual({ productId: 'p2', productName: 'Casquette', unitsSold: 5, revenueCents: 5000 });
    expect(byId.has('p3')).toBe(false); // commande annulée, jamais comptée
  });

  it('trie par revenu décroissant', () => {
    const result = summarizePopularProducts(items, orderStatusById);
    expect(result.map((p) => p.productId)).toEqual(['p1', 'p2']);
  });

  it('respecte la limite (top N)', () => {
    const result = summarizePopularProducts(items, orderStatusById, 1);
    expect(result).toHaveLength(1);
    expect(result[0]?.productId).toBe('p1');
  });

  it('aucune ligne : tableau vide', () => {
    expect(summarizePopularProducts([], new Map())).toEqual([]);
  });
});

describe('summarizeFailedPayments', () => {
  it('ne compte que le statut `error`', () => {
    const orders: Array<Pick<OrderRow, 'status' | 'total_cents'>> = [
      { status: 'error', total_cents: 1000 },
      { status: 'error', total_cents: 2000 },
      { status: 'payment_pending', total_cents: 5000 }, // pas un échec, juste pas confirmé
      { status: 'paid', total_cents: 3000 },
    ];
    expect(summarizeFailedPayments(orders)).toEqual({ count: 2, attemptedTotalCents: 3000 });
  });

  it('aucun échec : 0/0', () => {
    expect(summarizeFailedPayments([{ status: 'paid', total_cents: 100 }])).toEqual({ count: 0, attemptedTotalCents: 0 });
  });
});

describe('summarizeRefunds', () => {
  it('compte `refunded` ET `partially_refunded`', () => {
    const orders: Array<Pick<OrderRow, 'status' | 'total_cents'>> = [
      { status: 'refunded', total_cents: 5000 },
      { status: 'partially_refunded', total_cents: 3000 },
      { status: 'paid', total_cents: 9999 }, // exclu
    ];
    expect(summarizeRefunds(orders)).toEqual({ count: 2, totalCents: 8000 });
  });
});

describe('canViewAdminDashboard', () => {
  it('autorise uniquement `platform_admin`', () => {
    expect(canViewAdminDashboard('platform_admin')).toBe(true);
  });
  it('refuse tous les autres rôles', () => {
    expect(canViewAdminDashboard('client')).toBe(false);
    expect(canViewAdminDashboard('team_manager')).toBe(false);
    expect(canViewAdminDashboard('accounting')).toBe(false);
  });
  it('refuse null/undefined (visiteur)', () => {
    expect(canViewAdminDashboard(null)).toBe(false);
    expect(canViewAdminDashboard(undefined)).toBe(false);
  });
});

describe('buildAdminDashboard (assemblage complet, données connues)', () => {
  it('assemble toutes les sections de façon cohérente', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const dashboard = buildAdminDashboard({
      orders: [
        makeOrder({ id: 'o1', status: 'paid', total_cents: 5000 }),
        makeOrder({ id: 'o2', status: 'error', total_cents: 1000 }),
        makeOrder({ id: 'o3', status: 'refunded', total_cents: 2000 }),
      ],
      orderItems: [makeOrderItem({ id: 'i1', order_id: 'o1', product_id: 'p1', product_name: 'Chandail', quantity: 1, line_total_cents: 5000 })],
      credits: [makeCredit({ id: 'c1', beneficiary_type: 'athlete', beneficiary_id: 'a1', amount_cents: 4000, status: 'active', campaign_id: 'camp-1' })],
      payouts: [],
      campaigns: [makeCampaign({ id: 'camp-1', name: 'Campagne A', status: 'active', ends_at: '2026-06-05T00:00:00Z', goal_cents: 100000 })],
      now,
    });

    expect(dashboard.revenue.totalRevenueCents).toBe(5000);
    expect(dashboard.revenue.totalOrderCount).toBe(3);
    expect(dashboard.grossMargin.availableCents).toBeNull();
    expect(dashboard.creditsDue.dueCents).toBe(4000);
    expect(dashboard.activeCampaignsCount).toBe(1);
    expect(dashboard.atRiskCampaigns).toHaveLength(1); // 4j restants, 4% de l'objectif
    expect(dashboard.popularProducts).toHaveLength(1);
    expect(dashboard.failedPayments).toEqual({ count: 1, attemptedTotalCents: 1000 });
    expect(dashboard.refunds).toEqual({ count: 1, totalCents: 2000 });
  });

  it('aucune donnée du tout : toutes les sections vides/zéro, pas d\'erreur', () => {
    const dashboard = buildAdminDashboard({
      orders: [],
      orderItems: [],
      credits: [],
      payouts: [],
      campaigns: [],
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(dashboard.revenue).toEqual({ totalRevenueCents: 0, paidOrderCount: 0, totalOrderCount: 0, averageBasketCents: 0 });
    expect(dashboard.creditsDue).toEqual({ dueCents: 0, paidCents: 0 });
    expect(dashboard.activeCampaignsCount).toBe(0);
    expect(dashboard.atRiskCampaigns).toEqual([]);
    expect(dashboard.popularProducts).toEqual([]);
    expect(dashboard.failedPayments).toEqual({ count: 0, attemptedTotalCents: 0 });
    expect(dashboard.refunds).toEqual({ count: 0, totalCents: 0 });
  });
});
