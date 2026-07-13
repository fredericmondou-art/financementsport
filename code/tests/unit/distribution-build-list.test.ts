/**
 * Tests unitaires du regroupement/tri de la liste de distribution (Tâche
 * 1.5.4, docs/prompts/phase-1-5.md) : `lib/distribution/build-list.ts`.
 *
 * Le repo Supabase réel (`createSupabaseDistributionRepo`) n'est
 * volontairement PAS exercé ici -- fine couche d'accès aux données, pas de
 * logique métier (même convention que `tests/unit/saved-splits.test.ts`).
 * Seule la fonction PURE `buildDistributionGroups` (et ses aides
 * `isOrderPaid`/`orderStatusLabelFr`/`resolveBuyerIdentity`) est testée ici,
 * sur un jeu de commandes simulé -- exactement le test "Unitaire" demandé
 * par le cahier ("logique de regroupement et de tri sur un jeu de commandes
 * simulé").
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildDistributionGroups,
  isOrderPaid,
  orderStatusLabelFr,
  resolveBuyerIdentity,
  UNASSIGNED_GROUP_KEY,
  type OrderRow,
  type OrderItemRow,
  type OrderCreditRow,
} from '@/lib/distribution/build-list';
import { beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';

const CAMPAIGN_ID = randomUUID();
const ATHLETE_ALICE = randomUUID(); // nom de famille "Zaharie" -- trié en dernier
const ATHLETE_BOB = randomUUID(); // nom de famille "Allard" -- trié en premier
const USER_FAMILLE_TREMBLAY = randomUUID();
const USER_FAMILLE_BOUCHARD = randomUUID();

function makeOrder(overrides: Partial<OrderRow> & { id: string }): OrderRow {
  return {
    order_number: `CMD-${overrides.id.slice(0, 8)}`,
    user_id: null,
    guest_email: null,
    status: 'paid',
    subtotal_cents: 1000,
    tax_cents: 150,
    shipping_cents: 0,
    total_cents: 1150,
    credit_total_cents: 200,
    shipping_address_id: null,
    primary_campaign_id: CAMPAIGN_ID,
    team_id: null,
    stripe_payment_intent_id: null,
    notes_internal: null,
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeItem(orderId: string, overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: randomUUID(),
    order_id: orderId,
    product_id: randomUUID(),
    product_name: 'Chocolat',
    quantity: 1,
    unit_price_cents: 1000,
    line_total_cents: 1000,
    ...overrides,
  };
}

function makeCredit(orderId: string, beneficiaryId: string, overrides: Partial<OrderCreditRow> = {}): OrderCreditRow {
  return {
    id: randomUUID(),
    order_id: orderId,
    beneficiary_type: 'athlete',
    beneficiary_id: beneficiaryId,
    campaign_id: CAMPAIGN_ID,
    amount_cents: 200,
    status: 'active',
    applied_rule_id: null,
    computation_note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const beneficiaryLabels = new Map<string, string>([
  [beneficiaryLabelKey('athlete', ATHLETE_ALICE), 'Alice Zaharie'],
  [beneficiaryLabelKey('athlete', ATHLETE_BOB), 'Bob Allard'],
]);
const buyerNames = new Map<string, string>([
  [USER_FAMILLE_TREMBLAY, 'Julie Tremblay'],
  [USER_FAMILLE_BOUCHARD, 'Marc Bouchard'],
]);

describe('isOrderPaid', () => {
  it("considère 'paid'/'preparing'/'ready'/'delivered_to_team'/'distributed'/'completed'/'partially_refunded' comme payés", () => {
    expect(isOrderPaid('paid')).toBe(true);
    expect(isOrderPaid('preparing')).toBe(true);
    expect(isOrderPaid('ready')).toBe(true);
    expect(isOrderPaid('delivered_to_team')).toBe(true);
    expect(isOrderPaid('distributed')).toBe(true);
    expect(isOrderPaid('completed')).toBe(true);
    expect(isOrderPaid('partially_refunded')).toBe(true);
  });

  it("considère 'payment_pending'/'cancelled'/'refunded'/'error' comme non payés", () => {
    expect(isOrderPaid('payment_pending')).toBe(false);
    expect(isOrderPaid('cancelled')).toBe(false);
    expect(isOrderPaid('refunded')).toBe(false);
    expect(isOrderPaid('error')).toBe(false);
  });
});

describe('orderStatusLabelFr', () => {
  it('traduit chaque statut en français', () => {
    expect(orderStatusLabelFr('payment_pending')).toBe('Paiement en attente');
    expect(orderStatusLabelFr('paid')).toBe('Payée');
  });
});

describe('resolveBuyerIdentity', () => {
  it('utilise le nom complet du profil pour un client avec compte, trié par nom de famille', () => {
    const identity = resolveBuyerIdentity({ user_id: USER_FAMILLE_TREMBLAY, guest_email: null }, buyerNames);
    expect(identity.displayName).toBe('Julie Tremblay');
    expect(identity.sortKey).toBe('Tremblay');
  });

  it("utilise le courriel d'invité quand il n'y a pas de compte, trié par le courriel lui-même", () => {
    const identity = resolveBuyerIdentity({ user_id: null, guest_email: 'famille@example.com' }, buyerNames);
    expect(identity.displayName).toBe('famille@example.com (invité)');
    expect(identity.sortKey).toBe('famille@example.com');
  });

  it("retombe sur le courriel d'invité si le user_id n'a pas de nom chargé (profil sans full_name)", () => {
    const identity = resolveBuyerIdentity(
      { user_id: randomUUID(), guest_email: 'sans-nom@example.com' },
      buyerNames,
    );
    expect(identity.displayName).toBe('sans-nom@example.com (invité)');
  });
});

describe('buildDistributionGroups', () => {
  it('regroupe les commandes par athlète puis par client, triées par nom de famille (athlète puis client)', () => {
    const orderTremblayForAlice = makeOrder({ id: randomUUID(), user_id: USER_FAMILLE_TREMBLAY });
    const orderBouchardForAlice = makeOrder({ id: randomUUID(), user_id: USER_FAMILLE_BOUCHARD });
    const orderForBob = makeOrder({ id: randomUUID(), user_id: USER_FAMILLE_TREMBLAY });

    const groups = buildDistributionGroups({
      orders: [orderTremblayForAlice, orderBouchardForAlice, orderForBob],
      items: [
        ...orderTremblayForAlice ? [makeItem(orderTremblayForAlice.id)] : [],
        ...orderBouchardForAlice ? [makeItem(orderBouchardForAlice.id)] : [],
        ...orderForBob ? [makeItem(orderForBob.id)] : [],
      ],
      credits: [
        makeCredit(orderTremblayForAlice.id, ATHLETE_ALICE),
        makeCredit(orderBouchardForAlice.id, ATHLETE_ALICE),
        makeCredit(orderForBob.id, ATHLETE_BOB),
      ],
      beneficiaryLabels,
      buyerNames,
    });

    // Bob Allard (famille "Allard") trié avant Alice Zaharie (famille "Zaharie").
    expect(groups.map((g) => g.beneficiaryLabel)).toEqual(['Bob Allard', 'Alice Zaharie']);

    const aliceGroup = groups.find((g) => g.beneficiaryLabel === 'Alice Zaharie')!;
    // Bouchard avant Tremblay (ordre alphabétique des noms de famille).
    expect(aliceGroup.orders.map((o) => o.buyerDisplayName)).toEqual(['Marc Bouchard', 'Julie Tremblay']);
  });

  it('inclut une commande non payée avec son statut correct, sans la masquer', () => {
    const unpaidOrder = makeOrder({
      id: randomUUID(),
      status: 'payment_pending',
      user_id: USER_FAMILLE_TREMBLAY,
    });

    const groups = buildDistributionGroups({
      orders: [unpaidOrder],
      items: [makeItem(unpaidOrder.id)],
      credits: [makeCredit(unpaidOrder.id, ATHLETE_ALICE)],
      beneficiaryLabels,
      buyerNames,
    });

    expect(groups).toHaveLength(1);
    const entry = groups[0]!.orders[0]!;
    expect(entry.isPaid).toBe(false);
    expect(entry.statusLabel).toBe('Paiement en attente');
  });

  it('place une commande sans aucun crédit dans un groupe de repli plutôt que de la faire disparaître', () => {
    const orphanOrder = makeOrder({ id: randomUUID() });

    const groups = buildDistributionGroups({
      orders: [orphanOrder],
      items: [makeItem(orphanOrder.id)],
      credits: [],
      beneficiaryLabels,
      buyerNames,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.beneficiaryType).toBeNull();
    expect(groups[0]!.orders).toHaveLength(1);
    expect(groups[0]!.orders[0]!.orderId).toBe(orphanOrder.id);
  });

  it('fait apparaître une commande répartie entre deux athlètes dans les DEUX groupes (distribution physique, pas la ventilation monétaire)', () => {
    const splitOrder = makeOrder({ id: randomUUID(), user_id: USER_FAMILLE_TREMBLAY });

    const groups = buildDistributionGroups({
      orders: [splitOrder],
      items: [makeItem(splitOrder.id)],
      credits: [
        makeCredit(splitOrder.id, ATHLETE_ALICE, { amount_cents: 100 }),
        makeCredit(splitOrder.id, ATHLETE_BOB, { amount_cents: 100 }),
      ],
      beneficiaryLabels,
      buyerNames,
    });

    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.orders.map((o) => o.orderId)).toEqual([splitOrder.id]);
    }
  });

  it('UNASSIGNED_GROUP_KEY reste une clé interne stable (utilisée par buildDistributionGroups)', () => {
    expect(UNASSIGNED_GROUP_KEY).toBe('unassigned');
  });
});
