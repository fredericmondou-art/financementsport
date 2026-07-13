/**
 * Tests unitaires de l'agrégation pure des commandes (Tâche 1.6.A3) :
 * `groupOrderDetails` et `summarizeImpactByBeneficiary` (lib/orders/
 * list-orders.ts) -- aucune base de données réelle, données construites à la
 * main (même esprit que tests/unit/catalog-products.test.ts).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  groupOrderDetails,
  summarizeImpactByBeneficiary,
  type OrderCreditRow,
  type OrderItemRow,
  type OrderRow,
} from '@/lib/orders/list-orders';

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: randomUUID(),
    order_number: 'CMD-TEST',
    user_id: randomUUID(),
    guest_email: null,
    status: 'paid',
    subtotal_cents: 1000,
    tax_cents: 150,
    shipping_cents: 0,
    total_cents: 1150,
    credit_total_cents: 500,
    shipping_address_id: null,
    primary_campaign_id: null,
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
    product_name: 'Produit test',
    quantity: 1,
    unit_price_cents: 1000,
    line_total_cents: 1000,
    ...overrides,
  };
}

function makeCredit(orderId: string, overrides: Partial<OrderCreditRow> = {}): OrderCreditRow {
  return {
    id: randomUUID(),
    order_id: orderId,
    beneficiary_type: 'athlete',
    beneficiary_id: randomUUID(),
    campaign_id: null,
    amount_cents: 500,
    status: 'active',
    applied_rule_id: null,
    computation_note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupOrderDetails', () => {
  it('regroupe les lignes et crédits sous la bonne commande, dans le même ordre que `orders`', () => {
    const orderA = makeOrder({ order_number: 'CMD-A' });
    const orderB = makeOrder({ order_number: 'CMD-B' });
    const itemA = makeItem(orderA.id);
    const itemB1 = makeItem(orderB.id);
    const itemB2 = makeItem(orderB.id);
    const creditA = makeCredit(orderA.id);

    const result = groupOrderDetails([orderA, orderB], [itemA, itemB1, itemB2], [creditA]);

    expect(result).toHaveLength(2);
    // Longueur vérifiée ci-dessus -- assertions non-null légitimes (pas de
    // `noUncheckedIndexedAccess` à contourner autrement ici).
    expect(result[0]!.order).toBe(orderA);
    expect(result[0]!.items).toEqual([itemA]);
    expect(result[0]!.credits).toEqual([creditA]);
    expect(result[1]!.order).toBe(orderB);
    expect(result[1]!.items).toEqual([itemB1, itemB2]);
    expect(result[1]!.credits).toEqual([]);
  });

  it('retourne des tableaux vides pour une commande sans lignes ni crédits (pas une erreur)', () => {
    const order = makeOrder();
    const result = groupOrderDetails([order], [], []);
    expect(result).toEqual([{ order, items: [], credits: [] }]);
  });
});

describe('summarizeImpactByBeneficiary', () => {
  it('additionne le crédit `active`/`pending` du même bénéficiaire sur plusieurs commandes', () => {
    const athleteId = randomUUID();
    const orderA = makeOrder();
    const orderB = makeOrder();
    const details = groupOrderDetails(
      [orderA, orderB],
      [],
      [
        makeCredit(orderA.id, { beneficiary_type: 'athlete', beneficiary_id: athleteId, amount_cents: 500, status: 'active' }),
        makeCredit(orderB.id, { beneficiary_type: 'athlete', beneficiary_id: athleteId, amount_cents: 300, status: 'pending' }),
      ],
    );

    const impact = summarizeImpactByBeneficiary(details);

    expect(impact).toEqual([{ beneficiaryType: 'athlete', beneficiaryId: athleteId, totalAmountCents: 800 }]);
  });

  it('exclut les crédits `cancelled`/`refunded`/`expired` -- jamais un impact réel', () => {
    const athleteId = randomUUID();
    const order = makeOrder();
    const details = groupOrderDetails(
      [order],
      [],
      [
        makeCredit(order.id, { beneficiary_id: athleteId, amount_cents: 500, status: 'cancelled' }),
        makeCredit(order.id, { beneficiary_id: athleteId, amount_cents: 200, status: 'refunded' }),
        makeCredit(order.id, { beneficiary_id: athleteId, amount_cents: 100, status: 'expired' }),
      ],
    );

    expect(summarizeImpactByBeneficiary(details)).toEqual([]);
  });

  it('trie du plus grand au plus petit impact', () => {
    const order = makeOrder();
    const small = randomUUID();
    const big = randomUUID();
    const details = groupOrderDetails(
      [order],
      [],
      [
        makeCredit(order.id, { beneficiary_id: small, amount_cents: 100 }),
        makeCredit(order.id, { beneficiary_id: big, amount_cents: 900 }),
      ],
    );

    const impact = summarizeImpactByBeneficiary(details);
    expect(impact.map((line) => line.beneficiaryId)).toEqual([big, small]);
  });
});
