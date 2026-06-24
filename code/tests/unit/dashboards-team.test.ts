/**
 * Tests unitaires du dashboard équipe (Tâche 1.5.6, docs/prompts/
 * phase-1-5.md) : `lib/dashboards/team.ts`.
 *
 * Comme pour `tests/unit/distribution-build-list.test.ts`/
 * `tests/unit/orders-status.test.ts`, le repo Supabase réel
 * (`createSupabaseTeamDashboardRepo`) n'est volontairement PAS exercé ici --
 * fine couche de requêtes, pas de logique métier. Seules les fonctions PURES
 * sont testées, sur un jeu de données CONNU (cahier : « unitaire (exactitude
 * des agrégations sur un jeu de données connu) »).
 */
import { describe, expect, it } from 'vitest';
import {
  buildAthleteCreditBreakdown,
  buildTeamDashboard,
  buildWeeklyProgression,
  computeCollectiveGoalCents,
  isoWeekStart,
  listOrdersToDistribute,
  payoutStatusLabelFr,
  summarizeOrderSales,
  summarizePayouts,
  type OrderCreditRow,
  type OrderRow,
  type PayoutRow,
} from '@/lib/dashboards/team';
import type { CampaignStatus, CreditStatus, OrderStatus, PayoutStatus } from '@/lib/db/types';

function makeOrder(overrides: Partial<OrderRow> & Pick<OrderRow, 'id' | 'order_number' | 'status' | 'total_cents'>): OrderRow {
  return {
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

function makeCredit(
  overrides: Partial<OrderCreditRow> &
    Pick<OrderCreditRow, 'id' | 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status' | 'created_at'>,
): OrderCreditRow {
  return {
    order_id: 'order-x',
    campaign_id: null,
    applied_rule_id: null,
    computation_note: null,
    updated_at: overrides.created_at,
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

describe('isoWeekStart', () => {
  // 2024-01-01 est un lundi (fait connu, vérifiable indépendamment).
  it('renvoie la même date pour un lundi', () => {
    expect(isoWeekStart('2024-01-01T10:00:00Z')).toBe('2024-01-01');
  });
  it('renvoie le lundi de la semaine pour un mercredi', () => {
    expect(isoWeekStart('2024-01-03T00:00:00Z')).toBe('2024-01-01');
  });
  it('renvoie le lundi de la semaine pour un dimanche (fin de semaine ISO)', () => {
    expect(isoWeekStart('2024-01-07T23:59:00Z')).toBe('2024-01-01');
  });
  it('bascule à la semaine suivante le lundi suivant', () => {
    expect(isoWeekStart('2024-01-08T00:00:00Z')).toBe('2024-01-08');
  });
});

describe('computeCollectiveGoalCents', () => {
  it('ne somme que les campagnes ACTIVES', () => {
    const campaigns: Array<{ status: CampaignStatus; goal_cents: number | null }> = [
      { status: 'active', goal_cents: 100000 },
      { status: 'ended', goal_cents: 50000 },
      { status: 'draft', goal_cents: 20000 },
    ];
    expect(computeCollectiveGoalCents(campaigns)).toBe(100000);
  });
  it('traite goal_cents=null comme 0, et renvoie 0 sans campagne active', () => {
    expect(computeCollectiveGoalCents([{ status: 'active', goal_cents: null }])).toBe(0);
    expect(computeCollectiveGoalCents([{ status: 'closed', goal_cents: 50000 }])).toBe(0);
    expect(computeCollectiveGoalCents([])).toBe(0);
  });
  it('somme plusieurs campagnes actives simultanées (équipe + athlètes)', () => {
    const campaigns: Array<{ status: CampaignStatus; goal_cents: number | null }> = [
      { status: 'active', goal_cents: 100000 },
      { status: 'active', goal_cents: 25000 },
    ];
    expect(computeCollectiveGoalCents(campaigns)).toBe(125000);
  });
});

describe('summarizeOrderSales', () => {
  const orders: Array<{ status: OrderStatus; total_cents: number }> = [
    { status: 'paid', total_cents: 5000 },
    { status: 'ready', total_cents: 3000 },
    { status: 'cancelled', total_cents: 9999 }, // exclue
    { status: 'delivered_to_team', total_cents: 2000 },
    { status: 'completed', total_cents: 1000 },
    { status: 'payment_pending', total_cents: 7777 }, // exclue
  ];

  it('ne compte que les commandes payées (isOrderPaid), totalise et compte', () => {
    const summary = summarizeOrderSales(orders);
    expect(summary.totalSalesCents).toBe(11000); // 5000+3000+2000+1000
    expect(summary.orderCount).toBe(4);
  });

  it('calcule le panier moyen, arrondi à l\'entier', () => {
    const summary = summarizeOrderSales(orders);
    expect(summary.averageOrderCents).toBe(2750); // 11000/4
  });

  it('renvoie 0/0/0 sans aucune commande payée', () => {
    const summary = summarizeOrderSales([{ status: 'cancelled', total_cents: 100 }]);
    expect(summary).toEqual({ totalSalesCents: 0, orderCount: 0, averageOrderCents: 0 });
  });

  it('arrondit le panier moyen au centime le plus proche (cas non entier)', () => {
    const summary = summarizeOrderSales([
      { status: 'paid', total_cents: 1000 },
      { status: 'paid', total_cents: 1001 },
      { status: 'paid', total_cents: 1001 },
    ]);
    // 3002 / 3 = 1000.666... -> 1001
    expect(summary.averageOrderCents).toBe(1001);
  });
});

describe('buildAthleteCreditBreakdown', () => {
  const credits: Array<Pick<OrderCreditRow, 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>> = [
    { beneficiary_type: 'athlete', beneficiary_id: 'athlete-1', amount_cents: 4000, status: 'active' },
    { beneficiary_type: 'athlete', beneficiary_id: 'athlete-1', amount_cents: 1000, status: 'pending' },
    { beneficiary_type: 'athlete', beneficiary_id: 'athlete-2', amount_cents: 2000, status: 'active' },
    { beneficiary_type: 'team', beneficiary_id: 'team-1', amount_cents: 1500, status: 'active' },
    { beneficiary_type: 'athlete', beneficiary_id: 'athlete-1', amount_cents: 500, status: 'expired' }, // exclu
  ];
  const athletes = [
    { id: 'athlete-1', displayName: 'Alice Untel' },
    { id: 'athlete-2', displayName: 'Bob Untel' },
    { id: 'athlete-3', displayName: 'Zoé Untel' }, // aucun crédit -- doit apparaître à 0
  ];

  it('totalise par athlète (actif + pending, jamais expired/cancelled/refunded)', () => {
    const breakdown = buildAthleteCreditBreakdown({ teamId: 'team-1', athletes, credits });
    const byId = new Map(breakdown.byAthlete.map((entry) => [entry.athleteId, entry.creditCents]));
    expect(byId.get('athlete-1')).toBe(5000); // 4000 + 1000, PAS les 500 expired
    expect(byId.get('athlete-2')).toBe(2000);
    expect(byId.get('athlete-3')).toBe(0); // effectif complet, même sans crédit
  });

  it('isole les crédits attribués directement à l\'équipe (non ventilés par athlète)', () => {
    const breakdown = buildAthleteCreditBreakdown({ teamId: 'team-1', athletes, credits });
    expect(breakdown.unassignedToAthleteCents).toBe(1500);
  });

  it('critère d\'acceptation : les ventes par athlète totalisent les ventes de l\'équipe (invariant exact)', () => {
    const breakdown = buildAthleteCreditBreakdown({ teamId: 'team-1', athletes, credits });
    const sumByAthlete = breakdown.byAthlete.reduce((sum, entry) => sum + entry.creditCents, 0);
    expect(sumByAthlete + breakdown.unassignedToAthleteCents).toBe(breakdown.totalCents);
    expect(breakdown.totalCents).toBe(8500); // 4000+1000+2000+1500
  });

  it('trie du plus généreux au moins généreux, alphabétique en cas d\'égalité', () => {
    const breakdown = buildAthleteCreditBreakdown({ teamId: 'team-1', athletes, credits });
    expect(breakdown.byAthlete.map((entry) => entry.athleteId)).toEqual(['athlete-1', 'athlete-2', 'athlete-3']);
  });

  it('ignore un crédit dont le bénéficiaire \'team\' ne correspond pas à cette équipe (défensif)', () => {
    const breakdown = buildAthleteCreditBreakdown({
      teamId: 'team-1',
      athletes,
      credits: [{ beneficiary_type: 'team', beneficiary_id: 'autre-equipe', amount_cents: 999, status: 'active' }],
    });
    expect(breakdown.unassignedToAthleteCents).toBe(0);
    expect(breakdown.totalCents).toBe(0);
  });

  it('équipe sans aucun athlète : liste vide, total = crédits équipe directs uniquement', () => {
    const breakdown = buildAthleteCreditBreakdown({
      teamId: 'team-1',
      athletes: [],
      credits: [{ beneficiary_type: 'team', beneficiary_id: 'team-1', amount_cents: 1500, status: 'active' }],
    });
    expect(breakdown.byAthlete).toEqual([]);
    expect(breakdown.totalCents).toBe(1500);
  });
});

describe('buildWeeklyProgression', () => {
  const credits: Array<Pick<OrderCreditRow, 'amount_cents' | 'status' | 'created_at'>> = [
    { amount_cents: 3000, status: 'active', created_at: '2024-01-01T08:00:00Z' }, // semaine du 1er
    { amount_cents: 2000, status: 'pending', created_at: '2024-01-03T08:00:00Z' }, // semaine du 1er
    { amount_cents: 1500, status: 'active', created_at: '2024-01-08T08:00:00Z' }, // semaine du 8
    { amount_cents: 2000, status: 'active', created_at: '2024-01-10T08:00:00Z' }, // semaine du 8
    { amount_cents: 9999, status: 'refunded', created_at: '2024-01-08T08:00:00Z' }, // exclu
  ];

  it('regroupe par semaine ISO et cumule chronologiquement', () => {
    const progression = buildWeeklyProgression(credits);
    expect(progression).toEqual([
      { weekStart: '2024-01-01', weekTotalCents: 5000, cumulativeCents: 5000 },
      { weekStart: '2024-01-08', weekTotalCents: 3500, cumulativeCents: 8500 },
    ]);
  });

  it('renvoie un tableau vide sans aucun crédit éligible', () => {
    expect(buildWeeklyProgression([{ amount_cents: 100, status: 'cancelled', created_at: '2024-01-01T00:00:00Z' }])).toEqual(
      [],
    );
  });
});

describe('listOrdersToDistribute', () => {
  const orders: OrderRow[] = [
    makeOrder({ id: 'o1', order_number: 'CMD-002', status: 'ready', total_cents: 3000 }),
    makeOrder({ id: 'o2', order_number: 'CMD-001', status: 'delivered_to_team', total_cents: 2000 }),
    makeOrder({ id: 'o3', order_number: 'CMD-003', status: 'completed', total_cents: 1000 }), // déjà distribuée
    makeOrder({ id: 'o4', order_number: 'CMD-004', status: 'preparing', total_cents: 4000 }), // pas encore prête
  ];

  it("ne retient que 'ready'/'delivered_to_team', triées par numéro de commande", () => {
    const list = listOrdersToDistribute(orders);
    expect(list.map((o) => o.orderNumber)).toEqual(['CMD-001', 'CMD-002']);
  });
});

describe('payoutStatusLabelFr', () => {
  it('fournit un libellé français pour chacun des 7 statuts de PayoutStatus', () => {
    const statuses: PayoutStatus[] = ['calculated', 'in_validation', 'approved', 'paid', 'adjusted', 'disputed', 'closed'];
    for (const status of statuses) {
      expect(payoutStatusLabelFr(status)).toBeTruthy();
    }
  });
});

describe('summarizePayouts', () => {
  it('trie du plus récemment payé au moins récent, les jamais-payés en dernier', () => {
    const payouts: PayoutRow[] = [
      makePayout({ id: 'p1', beneficiary_type: 'team', beneficiary_id: 'team-1', amount_cents: 1500, status: 'calculated' }),
      makePayout({
        id: 'p2',
        beneficiary_type: 'athlete',
        beneficiary_id: 'athlete-1',
        amount_cents: 4000,
        status: 'paid',
        paid_at: '2024-02-01T00:00:00Z',
      }),
    ];
    const labels = new Map([
      ['team:team-1', 'Équipe Test'],
      ['athlete:athlete-1', 'Alice Untel'],
    ]);
    const summary = summarizePayouts(payouts, labels);
    expect(summary.map((p) => p.payoutId)).toEqual(['p2', 'p1']);
    expect(summary[0]?.beneficiaryLabel).toBe('Alice Untel');
    expect(summary[0]?.statusLabel).toBe('Payé');
  });

  it('utilise "Bénéficiaire inconnu" si le libellé est absent de la map', () => {
    const summary = summarizePayouts(
      [makePayout({ id: 'p1', beneficiary_type: 'team', beneficiary_id: 'team-x', amount_cents: 100, status: 'closed' })],
      new Map(),
    );
    expect(summary[0]?.beneficiaryLabel).toBe('Bénéficiaire inconnu');
  });
});

describe('buildTeamDashboard (assemblage complet, données connues)', () => {
  it('assemble toutes les sections de façon cohérente', () => {
    const dashboard = buildTeamDashboard({
      team: { id: 'team-1', name: 'Équipe Test' },
      campaigns: [{ status: 'active', goal_cents: 100000 }],
      orders: [
        makeOrder({ id: 'o1', order_number: 'CMD-001', status: 'paid', total_cents: 5000 }),
        makeOrder({ id: 'o2', order_number: 'CMD-002', status: 'ready', total_cents: 3000 }),
      ],
      credits: [
        makeCredit({
          id: 'c1',
          beneficiary_type: 'athlete',
          beneficiary_id: 'athlete-1',
          amount_cents: 4000,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
        }),
      ],
      athletes: [{ id: 'athlete-1', displayName: 'Alice Untel' }],
      payouts: [],
      beneficiaryLabels: new Map(),
    });

    expect(dashboard.team).toEqual({ id: 'team-1', name: 'Équipe Test' });
    expect(dashboard.goalCents).toBe(100000);
    expect(dashboard.sales.totalSalesCents).toBe(8000); // paid + ready
    expect(dashboard.credits.totalCents).toBe(4000);
    expect(dashboard.progression).toEqual([
      { weekStart: '2024-01-01', weekTotalCents: 4000, cumulativeCents: 4000 },
    ]);
    expect(dashboard.ordersToDistribute.map((o) => o.orderNumber)).toEqual(['CMD-002']);
    expect(dashboard.payouts).toEqual([]);
  });

  it('équipe sans campagne ni commande ni crédit : toutes les sections vides/zéro, pas d\'erreur', () => {
    const dashboard = buildTeamDashboard({
      team: { id: 'team-vide', name: 'Équipe Vide' },
      campaigns: [],
      orders: [],
      credits: [],
      athletes: [],
      payouts: [],
      beneficiaryLabels: new Map(),
    });
    expect(dashboard.goalCents).toBe(0);
    expect(dashboard.sales).toEqual({ totalSalesCents: 0, orderCount: 0, averageOrderCents: 0 });
    expect(dashboard.credits).toEqual({ byAthlete: [], unassignedToAthleteCents: 0, totalCents: 0 });
    expect(dashboard.progression).toEqual([]);
    expect(dashboard.ordersToDistribute).toEqual([]);
    expect(dashboard.payouts).toEqual([]);
  });
});

// Référencé pour satisfaire le typage des helpers ci-dessus (CreditStatus
// importé mais non utilisé directement dans une assertion -- documente le
// type couvert par les statuts littéraux employés plus haut).
const _creditStatusesCovered: CreditStatus[] = ['pending', 'active', 'expired', 'cancelled', 'refunded'];
void _creditStatusesCovered;
