/**
 * Tests unitaires de `lib/checkout/prepare-checkout.ts` (Tâche 1.5) :
 * validation des lignes (panier vide, produit retiré, stock insuffisant) et
 * calcul des totaux (taxe uniquement sur les lignes taxables). CLAUDE.md
 * section 7 : cas limites explicitement exigés ("stock épuisé", produit
 * retiré, panier vide).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeCheckoutTotals,
  validateCheckoutLines,
  type CheckoutLineInput,
} from '@/lib/checkout/prepare-checkout';
import { BusinessRuleError } from '@/lib/entities/errors';

function makeLine(overrides: Partial<CheckoutLineInput> = {}): CheckoutLineInput {
  return {
    productId: overrides.productId ?? randomUUID(),
    productName: overrides.productName ?? 'Chandail',
    quantity: overrides.quantity ?? 1,
    unitPriceCents: overrides.unitPriceCents ?? 1000,
    isTaxable: overrides.isTaxable ?? true,
    isActive: overrides.isActive ?? true,
    stockQuantity: overrides.stockQuantity ?? 10,
  };
}

describe('validateCheckoutLines', () => {
  it('rejette un panier vide', () => {
    expect(() => validateCheckoutLines([])).toThrow(BusinessRuleError);
    expect(() => validateCheckoutLines([])).toThrow('Votre panier est vide.');
  });

  it('rejette une ligne dont le produit a été retiré du catalogue (isActive=false)', () => {
    const lines = [makeLine({ productName: 'Pack VIP', isActive: false })];
    expect(() => validateCheckoutLines(lines)).toThrow(BusinessRuleError);
    expect(() => validateCheckoutLines(lines)).toThrow(/Pack VIP/);
  });

  it('rejette une ligne dont la quantité dépasse le stock désormais disponible', () => {
    const lines = [makeLine({ productName: 'Casquette', quantity: 5, stockQuantity: 2 })];
    expect(() => validateCheckoutLines(lines)).toThrow(BusinessRuleError);
    expect(() => validateCheckoutLines(lines)).toThrow(/Casquette/);
  });

  it('accepte une quantité exactement égale au stock disponible (limite, pas un dépassement)', () => {
    const lines = [makeLine({ quantity: 2, stockQuantity: 2 })];
    expect(() => validateCheckoutLines(lines)).not.toThrow();
  });

  it('accepte plusieurs lignes valides sans lever d’erreur', () => {
    const lines = [makeLine(), makeLine({ quantity: 3, stockQuantity: 3 })];
    expect(() => validateCheckoutLines(lines)).not.toThrow();
  });
});

describe('computeCheckoutTotals', () => {
  // Taux QC réel (TPS 5 % + TVQ 9,975 % combinées), confirmé dans
  // supabase/seed.sql.
  const TAX_RATE_BPS_QC = 1498;

  it('calcule la taxe seulement sur les lignes taxables, pas sur les lignes non taxables', () => {
    const lines = [
      makeLine({ unitPriceCents: 10000, quantity: 1, isTaxable: true }),
      makeLine({ unitPriceCents: 5000, quantity: 1, isTaxable: false }),
    ];

    const totals = computeCheckoutTotals(lines, TAX_RATE_BPS_QC);

    expect(totals.subtotalCents).toBe(15000);
    expect(totals.taxableSubtotalCents).toBe(10000);
    expect(totals.taxCents).toBe(1498); // 10000 x 1498 / 10000 = 1498 exactement
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(15000 + 1498 + 0);
  });

  it('ne facture aucune taxe quand toutes les lignes sont non taxables', () => {
    const lines = [makeLine({ unitPriceCents: 2000, quantity: 1, isTaxable: false })];
    const totals = computeCheckoutTotals(lines, TAX_RATE_BPS_QC);
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(2000);
  });

  it('multiplie correctement prix unitaire x quantité sur plusieurs unités d’une même ligne', () => {
    const lines = [makeLine({ unitPriceCents: 1500, quantity: 4, isTaxable: false })];
    const totals = computeCheckoutTotals(lines, TAX_RATE_BPS_QC);
    expect(totals.subtotalCents).toBe(6000);
  });

  it('retourne des totaux nuls pour une liste de lignes vide (défense en profondeur)', () => {
    const totals = computeCheckoutTotals([], TAX_RATE_BPS_QC);
    expect(totals).toEqual({
      subtotalCents: 0,
      taxableSubtotalCents: 0,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 0,
    });
  });
});
