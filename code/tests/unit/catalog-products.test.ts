/**
 * Tests unitaires du catalogue (Tâche 1.2) : tri et validation zod. Pas de
 * DB ni de permission ici — voir `tests/integration/catalog-products.test.ts`
 * pour le flux complet (création admin, refus non-admin, lecture publique).
 */
import { describe, expect, it } from 'vitest';
import {
  productInputSchema,
  sortProducts,
  type ProductRow,
} from '@/lib/catalog/products';

function makeProduct(overrides: Partial<ProductRow>): ProductRow {
  return {
    id: overrides.id ?? 'id',
    kind: 'pack',
    category_id: null,
    name: 'Produit',
    slug: 'produit',
    description: null,
    image_url: null,
    price_cents: 0,
    fixed_credit_cents: null,
    is_taxable: true,
    stock_quantity: 0,
    lead_time_days: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('productInputSchema', () => {
  it('accepte un produit minimal (nom + prix)', () => {
    const result = productInputSchema.safeParse({ name: 'Pack Maison', priceCents: 3500 });
    expect(result.success).toBe(true);
  });

  it('refuse un nom vide', () => {
    const result = productInputSchema.safeParse({ name: '', priceCents: 3500 });
    expect(result.success).toBe(false);
  });

  it('refuse un prix négatif (CLAUDE.md section 4 : jamais de montant négatif implicite)', () => {
    const result = productInputSchema.safeParse({ name: 'Pack', priceCents: -100 });
    expect(result.success).toBe(false);
  });

  it('refuse un prix non entier (jamais de float pour de l’argent)', () => {
    const result = productInputSchema.safeParse({ name: 'Pack', priceCents: 35.5 });
    expect(result.success).toBe(false);
  });

  it('refuse un fixedCreditCents négatif', () => {
    const result = productInputSchema.safeParse({
      name: 'Pack',
      priceCents: 3500,
      fixedCreditCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepte un kind explicite parmi product/pack/subscription', () => {
    expect(productInputSchema.safeParse({ name: 'P', priceCents: 0, kind: 'pack' }).success).toBe(
      true,
    );
    expect(
      productInputSchema.safeParse({ name: 'P', priceCents: 0, kind: 'abonnement' }).success,
    ).toBe(false);
  });
});

describe('sortProducts() — critère d’acceptation Tâche 1.2 (tri prix/popularité/crédit)', () => {
  const cheap = makeProduct({ id: 'cheap', price_cents: 1000, fixed_credit_cents: 100 });
  const mid = makeProduct({ id: 'mid', price_cents: 5000, fixed_credit_cents: 900 });
  const expensive = makeProduct({ id: 'expensive', price_cents: 12000, fixed_credit_cents: 1800 });
  const noCredit = makeProduct({ id: 'no-credit', price_cents: 4500, fixed_credit_cents: null });

  it('price_asc : du moins cher au plus cher', () => {
    const sorted = sortProducts([expensive, cheap, mid], 'price_asc');
    expect(sorted.map((p) => p.id)).toEqual(['cheap', 'mid', 'expensive']);
  });

  it('price_desc : du plus cher au moins cher', () => {
    const sorted = sortProducts([cheap, expensive, mid], 'price_desc');
    expect(sorted.map((p) => p.id)).toEqual(['expensive', 'mid', 'cheap']);
  });

  it('credit_desc : du crédit fixe le plus élevé au plus faible, un produit sans crédit fixe vaut 0$', () => {
    const sorted = sortProducts([cheap, expensive, noCredit, mid], 'credit_desc');
    expect(sorted.map((p) => p.id)).toEqual(['expensive', 'mid', 'cheap', 'no-credit']);
  });

  it('popularity : trie par unités vendues (carte injectée), 0 par défaut si absent de la carte', () => {
    const unitsSold = new Map<string, number>([
      ['mid', 50],
      ['cheap', 10],
    ]);
    const sorted = sortProducts([cheap, expensive, mid], 'popularity', unitsSold);
    expect(sorted.map((p) => p.id)).toEqual(['mid', 'cheap', 'expensive']);
  });

  it('ne modifie pas le tableau original (tri sur une copie)', () => {
    const original = [expensive, cheap, mid];
    const originalOrder = original.map((p) => p.id);
    sortProducts(original, 'price_asc');
    expect(original.map((p) => p.id)).toEqual(originalOrder);
  });
});
