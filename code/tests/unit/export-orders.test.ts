/**
 * Tests unitaires -- Tâche 1.5.11 (docs/prompts/phase-1-5.md) :
 * `lib/export/orders.ts`.
 *
 * Couvre, conformément aux "Tests attendus" de la spec :
 *   - "application des filtres" : `matchesOrderExportFilters`/
 *     `applyOrderExportFilters` (campagne, équipe, statut, période), et
 *     `parseOrderExportFilters` (conversion searchParams -> filtres, y
 *     compris les cas limites : valeur absente, statut invalide).
 *   - "exactitude des montants convertis" : `buildOrderExportRows` produit
 *     des montants en dollars (via `formatCents`), avec ventilation TPS/TVQ
 *     identique à `splitQcTax`/`findApplicableTaxRateBps` (Tâche 1.5.9) --
 *     preuve directe que l'export peut se réconcilier avec le rapport de
 *     campagne (la réconciliation bout-en-bout est testée en intégration).
 *   - `canExportOrders` : seuls `platform_admin`/`accounting` passent.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  applyOrderExportFilters,
  buildOrderExportCsv,
  buildOrderExportRows,
  canExportOrders,
  dayEndIso,
  dayStartIso,
  EMPTY_ORDER_EXPORT_FILTERS,
  matchesOrderExportFilters,
  ORDER_EXPORT_HEADERS,
  parseOrderExportFilters,
  type OrderCreditRow,
  type OrderExportFilters,
  type OrderRow,
} from '@/lib/export/orders';
import { formatCents } from '@/lib/format-cents';
import { splitQcTax } from '@/lib/reports/campaign';

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: randomUUID(),
    order_number: 'CMD-0001',
    user_id: null,
    guest_email: 'parent@example.com',
    status: 'paid',
    subtotal_cents: 10000,
    tax_cents: 1497,
    shipping_cents: 0,
    total_cents: 11497,
    credit_total_cents: 4000,
    shipping_address_id: null,
    primary_campaign_id: null,
    team_id: null,
    stripe_payment_intent_id: null,
    notes_internal: null,
    created_at: '2026-05-01T12:00:00.000Z',
    paid_at: '2026-05-01T12:05:00.000Z',
    updated_at: '2026-05-01T12:05:00.000Z',
    ...overrides,
  };
}

function makeCredit(overrides: Partial<OrderCreditRow> = {}): OrderCreditRow {
  return {
    id: randomUUID(),
    order_id: randomUUID(),
    beneficiary_type: 'athlete',
    beneficiary_id: randomUUID(),
    campaign_id: null,
    amount_cents: 4000,
    status: 'active',
    applied_rule_id: null,
    computation_note: null,
    created_at: '2026-05-01T12:05:00.000Z',
    updated_at: '2026-05-01T12:05:00.000Z',
    ...overrides,
  };
}

describe('canExportOrders', () => {
  it('autorise platform_admin et accounting', () => {
    expect(canExportOrders('platform_admin')).toBe(true);
    expect(canExportOrders('accounting')).toBe(true);
  });

  it("refuse tout autre rôle, y compris support/logistics qui ont pourtant accès en lecture aux commandes via la RLS", () => {
    expect(canExportOrders('support')).toBe(false);
    expect(canExportOrders('logistics')).toBe(false);
    expect(canExportOrders('team_manager')).toBe(false);
    expect(canExportOrders('client')).toBe(false);
    expect(canExportOrders(null)).toBe(false);
    expect(canExportOrders(undefined)).toBe(false);
  });
});

describe('dayStartIso / dayEndIso', () => {
  it('encadrent une journée complète en UTC', () => {
    expect(dayStartIso('2026-05-01')).toBe('2026-05-01T00:00:00.000Z');
    expect(dayEndIso('2026-05-01')).toBe('2026-05-01T23:59:59.999Z');
  });
});

describe('parseOrderExportFilters', () => {
  it('searchParams vides -> EMPTY_ORDER_EXPORT_FILTERS', () => {
    expect(parseOrderExportFilters({})).toEqual(EMPTY_ORDER_EXPORT_FILTERS);
  });

  it('convertit tous les paramètres fournis', () => {
    const campaignId = randomUUID();
    const teamId = randomUUID();
    expect(
      parseOrderExportFilters({
        campaignId,
        teamId,
        status: 'paid',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      }),
    ).toEqual({
      campaignId,
      teamId,
      status: 'paid',
      periodStartIso: '2026-05-01T00:00:00.000Z',
      periodEndIso: '2026-05-31T23:59:59.999Z',
    });
  });

  it("un statut INVALIDE (paramètre trafiqué) est traité comme absent, jamais comme une erreur qui élargirait le résultat", () => {
    const filters = parseOrderExportFilters({ status: 'statut-qui-n-existe-pas' });
    expect(filters.status).toBeNull();
  });

  it('chaînes vides traitées comme absentes', () => {
    expect(parseOrderExportFilters({ campaignId: '', status: '' })).toEqual(EMPTY_ORDER_EXPORT_FILTERS);
  });
});

describe('matchesOrderExportFilters / applyOrderExportFilters', () => {
  const campaignA = randomUUID();
  const campaignB = randomUUID();
  const teamA = randomUUID();
  const teamB = randomUUID();

  const orderA = makeOrder({ primary_campaign_id: campaignA, team_id: teamA, status: 'paid', created_at: '2026-05-10T00:00:00.000Z' });
  const orderB = makeOrder({ primary_campaign_id: campaignB, team_id: teamB, status: 'payment_pending', created_at: '2026-06-10T00:00:00.000Z' });

  it('aucun filtre -> tout passe', () => {
    expect(matchesOrderExportFilters(orderA, EMPTY_ORDER_EXPORT_FILTERS)).toBe(true);
    expect(matchesOrderExportFilters(orderB, EMPTY_ORDER_EXPORT_FILTERS)).toBe(true);
  });

  it('filtre par campagne', () => {
    const filters: OrderExportFilters = { ...EMPTY_ORDER_EXPORT_FILTERS, campaignId: campaignA };
    expect(matchesOrderExportFilters(orderA, filters)).toBe(true);
    expect(matchesOrderExportFilters(orderB, filters)).toBe(false);
  });

  it('filtre par équipe', () => {
    const filters: OrderExportFilters = { ...EMPTY_ORDER_EXPORT_FILTERS, teamId: teamB };
    expect(matchesOrderExportFilters(orderA, filters)).toBe(false);
    expect(matchesOrderExportFilters(orderB, filters)).toBe(true);
  });

  it('filtre par statut', () => {
    const filters: OrderExportFilters = { ...EMPTY_ORDER_EXPORT_FILTERS, status: 'paid' };
    expect(matchesOrderExportFilters(orderA, filters)).toBe(true);
    expect(matchesOrderExportFilters(orderB, filters)).toBe(false);
  });

  it('filtre par période (bornes incluses)', () => {
    const filters: OrderExportFilters = {
      ...EMPTY_ORDER_EXPORT_FILTERS,
      periodStartIso: dayStartIso('2026-05-10'),
      periodEndIso: dayEndIso('2026-05-10'),
    };
    expect(matchesOrderExportFilters(orderA, filters)).toBe(true);
    expect(matchesOrderExportFilters(orderB, filters)).toBe(false);
  });

  it('filtres combinables -- une commande doit satisfaire TOUS les filtres actifs', () => {
    const filters: OrderExportFilters = { ...EMPTY_ORDER_EXPORT_FILTERS, campaignId: campaignA, status: 'payment_pending' };
    // orderA correspond à la campagne mais pas au statut -> exclue.
    expect(matchesOrderExportFilters(orderA, filters)).toBe(false);
  });

  it('applyOrderExportFilters ne garde que les commandes correspondantes, dans le même ordre', () => {
    const filtered = applyOrderExportFilters([orderA, orderB], { ...EMPTY_ORDER_EXPORT_FILTERS, campaignId: campaignA });
    expect(filtered).toEqual([orderA]);
  });

  it('liste vide -> liste vide', () => {
    expect(applyOrderExportFilters([], EMPTY_ORDER_EXPORT_FILTERS)).toEqual([]);
  });
});

describe('buildOrderExportRows', () => {
  it('produit une ligne par commande avec montants en dollars et ventilation TPS/TVQ correcte', () => {
    const campaignId = randomUUID();
    const teamId = randomUUID();
    const order = makeOrder({
      primary_campaign_id: campaignId,
      team_id: teamId,
      subtotal_cents: 10000,
      tax_cents: 1497,
      shipping_cents: 500,
      total_cents: 11997,
      credit_total_cents: 4000,
    });
    const credit = makeCredit({ order_id: order.id, amount_cents: 4000, status: 'active' });
    const beneficiaryKey = `athlete:${credit.beneficiary_id}`;

    const rows = buildOrderExportRows({
      orders: [order],
      credits: [credit],
      taxRates: [{ province: 'QC', rate_bps: 1497, effective_at: '2020-01-01T00:00:00.000Z' }],
      beneficiaryLabels: new Map([[beneficiaryKey, 'Alice Zaharie']]),
      campaignNames: new Map([[campaignId, 'Campagne Printemps']]),
      teamNames: new Map([[teamId, 'Équipe A']]),
    });

    expect(rows).toHaveLength(1);
    const [row] = rows;

    // Mêmes constantes que `lib/reports/campaign.ts` -- preuve que la
    // ventilation TPS/TVQ de l'export concorde avec celle du rapport.
    const { tpsCents, tvqCents } = splitQcTax(1497, 1497);

    expect(row).toEqual([
      'CMD-0001',
      new Date(order.created_at).toLocaleDateString('fr-CA'),
      new Date(order.paid_at!).toLocaleDateString('fr-CA'),
      'Campagne Printemps',
      'Équipe A',
      'Payée',
      'Oui',
      formatCents(10000),
      formatCents(tpsCents),
      formatCents(tvqCents),
      formatCents(500),
      formatCents(11997),
      formatCents(4000),
      `Alice Zaharie ${formatCents(4000)}`,
    ]);
  });

  it("commande sans campagne/équipe/crédit -> colonnes vides, pas d'erreur", () => {
    const order = makeOrder({ primary_campaign_id: null, team_id: null, credit_total_cents: 0 });
    const rows = buildOrderExportRows({
      orders: [order],
      credits: [],
      taxRates: [],
      beneficiaryLabels: new Map(),
      campaignNames: new Map(),
      teamNames: new Map(),
    });
    expect(rows[0]![3]).toBe('');
    expect(rows[0]![4]).toBe('');
    expect(rows[0]![13]).toBe('');
  });

  it("commande non payée -> 'Payée' = Non, date de paiement = '--'", () => {
    const order = makeOrder({ status: 'payment_pending', paid_at: null });
    const rows = buildOrderExportRows({
      orders: [order],
      credits: [],
      taxRates: [],
      beneficiaryLabels: new Map(),
      campaignNames: new Map(),
      teamNames: new Map(),
    });
    expect(rows[0]![2]).toBe('--');
    expect(rows[0]![6]).toBe('Non');
  });

  it('un crédit non actif est listé quand même, suffixé de son statut -- traçabilité complète, contrairement au solde dû', () => {
    const order = makeOrder({ credit_total_cents: 0 });
    const credit = makeCredit({ order_id: order.id, amount_cents: 1500, status: 'cancelled' });
    const beneficiaryKey = `athlete:${credit.beneficiary_id}`;
    const rows = buildOrderExportRows({
      orders: [order],
      credits: [credit],
      taxRates: [],
      beneficiaryLabels: new Map([[beneficiaryKey, 'Bob Allard']]),
      campaignNames: new Map(),
      teamNames: new Map(),
    });
    expect(rows[0]![13]).toBe(`Bob Allard ${formatCents(1500)} (cancelled)`);
  });

  it('bénéficiaire inconnu (libellé non chargé) -> texte de repli, pas une exception', () => {
    const order = makeOrder();
    const credit = makeCredit({ order_id: order.id });
    const rows = buildOrderExportRows({
      orders: [order],
      credits: [credit],
      taxRates: [],
      beneficiaryLabels: new Map(),
      campaignNames: new Map(),
      teamNames: new Map(),
    });
    expect(rows[0]![13]).toContain('Bénéficiaire inconnu');
  });

  it('liste de commandes vide -> liste de lignes vide', () => {
    expect(
      buildOrderExportRows({ orders: [], credits: [], taxRates: [], beneficiaryLabels: new Map(), campaignNames: new Map(), teamNames: new Map() }),
    ).toEqual([]);
  });
});

describe('buildOrderExportCsv', () => {
  it("commence par l'en-tête ORDER_EXPORT_HEADERS et un BOM UTF-8 (compatibilité Excel FR, CLAUDE.md section 2)", () => {
    const order = makeOrder();
    const csv = buildOrderExportCsv({
      orders: [order],
      credits: [],
      taxRates: [],
      beneficiaryLabels: new Map(),
      campaignNames: new Map(),
      teamNames: new Map(),
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const withoutBom = csv.replace(/^﻿/u, '');
    const firstLine = withoutBom.split('\r\n')[0];
    expect(firstLine).toBe(ORDER_EXPORT_HEADERS.join(','));
  });
})