/**
 * Tests unitaires (Tâche 1.6) : sélection des packs "recommandés" sur une
 * page publique. Logique pure, aucune DB — voir
 * `lib/public/recommended-products.ts`.
 */
import { describe, expect, it } from 'vitest';
import { selectRecommendedProducts } from '@/lib/public/recommended-products';
import type { ProductRow } from '@/lib/catalog/products';

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

describe('selectRecommendedProducts', () => {
  const low = makeProduct({ id: 'low', fixed_credit_cents: 100 });
  const mid = makeProduct({ id: 'mid', fixed_credit_cents: 500 });
  const high = makeProduct({ id: 'high', fixed_credit_cents: 1000 });

  it('retombe sur le catalogue actif complet quand la campagne n’a aucune curation', () => {
    const result = selectRecommendedProducts([low, mid, high], []);
    expect(result.map((p) => p.id)).toEqual(['high', 'mid', 'low']);
  });

  it('se limite aux produits curés par la campagne quand campaignProductIds n’est pas vide', () => {
    const result = selectRecommendedProducts([low, mid, high], ['low', 'high']);
    expect(result.map((p) => p.id)).toEqual(['high', 'low']);
  });

  it('trie toujours par crédit indicatif décroissant (sortProducts credit_desc)', () => {
    const result = selectRecommendedProducts([mid, low, high], ['low', 'mid', 'high']);
    expect(result.map((p) => p.id)).toEqual(['high', 'mid', 'low']);
  });

  it('respecte la limite par défaut de 4', () => {
    const products = Array.from({ length: 6 }, (_, i) =>
      makeProduct({ id: `p${i}`, fixed_credit_cents: i * 100 }),
    );
    const result = selectRecommendedProducts(products, []);
    expect(result).toHaveLength(4);
  });

  it('respecte une limite explicite plus petite que le catalogue', () => {
    const result = selectRecommendedProducts([low, mid, high], [], 2);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['high', 'mid']);
  });

  it('retourne une liste vide si le catalogue actif est vide (jamais d’erreur, voir docs/DECISIONS.md)', () => {
    expect(selectRecommendedProducts([], [])).toEqual([]);
  });

  it('ignore les ids curés qui ne correspondent à aucun produit actif fourni', () => {
    const result = selectRecommendedProducts([low, mid], ['inexistant', 'low']);
    expect(result.map((p) => p.id)).toEqual(['low']);
  });
});
