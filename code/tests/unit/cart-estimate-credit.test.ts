/**
 * Tests unitaires du crédit estimé du panier (Tâche 1.4) : `estimateCartCredit`
 * (mapping panier -> moteur de crédit Tâche 1.3, sans arithmétique propre) et
 * `formatCreditMessage` (gabarit de message exigé par le cahier). Le calcul
 * de crédit lui-même est déjà testé dans `tests/credits/*.test.ts` -- on ne
 * le re-teste pas ici, seulement que ce module assemble correctement les
 * entrées et délègue à `calculateOrderCredits`.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { estimateCartCredit, formatCreditMessage, type CartItemCreditInfo } from '@/lib/cart/estimate-credit';
import { formatCents } from '@/lib/format-cents';
import type { CartItemRow } from '@/lib/cart/items';
import type { CartBeneficiaryRow } from '@/lib/cart/beneficiaries';

function makeCartItem(overrides: Partial<CartItemRow>): CartItemRow {
  return {
    id: overrides.id ?? randomUUID(),
    cart_id: overrides.cart_id ?? randomUUID(),
    product_id: overrides.product_id ?? randomUUID(),
    quantity: overrides.quantity ?? 1,
    unit_price_cents: overrides.unit_price_cents ?? 1000,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

function makeBeneficiary(overrides: Partial<CartBeneficiaryRow>): CartBeneficiaryRow {
  return {
    id: overrides.id ?? randomUUID(),
    cart_id: overrides.cart_id ?? randomUUID(),
    beneficiary_type: overrides.beneficiary_type ?? 'athlete',
    beneficiary_id: overrides.beneficiary_id ?? randomUUID(),
    campaign_id: overrides.campaign_id ?? null,
    share_bps: overrides.share_bps ?? 10000,
  };
}

describe('estimateCartCredit', () => {
  it('répartit le crédit fixe d’un produit entre deux bénéficiaires selon leur share_bps', () => {
    const productId = randomUUID();
    const cartId = randomUUID();
    const items = [
      makeCartItem({ cart_id: cartId, product_id: productId, quantity: 2, unit_price_cents: 5000 }),
    ];
    const productCreditInfoById = new Map<string, CartItemCreditInfo>([
      [productId, { fixedCreditCents: 300 }],
    ]);
    const athleteId = randomUUID();
    const teamId = randomUUID();
    const beneficiaries = [
      makeBeneficiary({ cart_id: cartId, beneficiary_type: 'athlete', beneficiary_id: athleteId, share_bps: 7000 }),
      makeBeneficiary({ cart_id: cartId, beneficiary_type: 'team', beneficiary_id: teamId, share_bps: 3000 }),
    ];

    const result = estimateCartCredit({
      items,
      productCreditInfoById,
      beneficiaries,
      campaignId: null,
      isCampaignActive: false,
      rules: [],
    });

    // 300 ¢ x 2 unités = 600 ¢ de crédit total (mode fixed_product).
    expect(result.totalCreditCents).toBe(600);
    expect(result.beneficiaryCredits).toEqual([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 7000, amountCents: 420 },
      { beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 3000, amountCents: 180 },
    ]);
  });

  it('traite un produit absent de productCreditInfoById comme n’ayant aucun crédit fixe (fallback null, pas une erreur)', () => {
    const productId = randomUUID();
    const items = [makeCartItem({ product_id: productId, quantity: 1, unit_price_cents: 2000 })];
    const beneficiaries = [makeBeneficiary({ share_bps: 10000 })];

    const result = estimateCartCredit({
      items,
      productCreditInfoById: new Map(),
      beneficiaries,
      campaignId: null,
      isCampaignActive: false,
      rules: [],
    });

    // Aucune règle, aucun crédit fixe -> mode "none", crédit nul.
    expect(result.totalCreditCents).toBe(0);
    expect(result.beneficiaryCredits[0]?.amountCents).toBe(0);
  });

  it('panier sans bénéficiaire choisi -> beneficiaryCredits vide même si le crédit total est positif', () => {
    const productId = randomUUID();
    const items = [makeCartItem({ product_id: productId, quantity: 1, unit_price_cents: 1000 })];
    const productCreditInfoById = new Map<string, CartItemCreditInfo>([
      [productId, { fixedCreditCents: 200 }],
    ]);

    const result = estimateCartCredit({
      items,
      productCreditInfoById,
      beneficiaries: [],
      campaignId: null,
      isCampaignActive: false,
      rules: [],
    });

    expect(result.totalCreditCents).toBe(200);
    expect(result.beneficiaryCredits).toEqual([]);
  });
});

describe('formatCreditMessage — gabarit exigé par le cahier ("Votre achat générera X $ pour [bénéficiaire].")', () => {
  it('insère le montant formaté en CAD et le nom du bénéficiaire dans le message', () => {
    const message = formatCreditMessage(1234, 'Corsaires');
    expect(message).toBe(`Votre achat générera ${formatCents(1234)} pour Corsaires.`);
  });

  it('gère un crédit nul (0 ¢) sans lever d’erreur', () => {
    const message = formatCreditMessage(0, 'Corsaires');
    expect(message).toBe(`Votre achat générera ${formatCents(0)} pour Corsaires.`);
  });

  it('évite le double point final quand le libellé se termine déjà par un point (ex. nom de famille masqué "Thomas T.")', () => {
    const message = formatCreditMessage(1234, 'Thomas T.');
    expect(message).toBe(`Votre achat générera ${formatCents(1234)} pour Thomas T.`);
    expect(message.endsWith('..')).toBe(false);
  });
});
