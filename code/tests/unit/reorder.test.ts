/**
 * Tests unitaires des fonctions pures du rachat (Tâche 1.6.A3) :
 * `buildReorderPlan` (revalidation contre le catalogue actuel) et
 * `deriveBeneficiarySplitFromCredits` (reconstruction du `share_bps` à partir
 * des `order_credits` figés, arrondi -- centimes au premier bénéficiaire,
 * même règle que `splitCreditAmongBeneficiaries` dans lib/credits/
 * calculate.ts, voir CLAUDE.md section 4).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildReorderPlan,
  deriveBeneficiarySplitFromCredits,
  type CurrentProductInfo,
  type ReorderBeneficiaryCredit,
  type ReorderSourceItem,
} from '@/lib/reorder/reorder';

function product(overrides: Partial<CurrentProductInfo> = {}): CurrentProductInfo {
  return { id: randomUUID(), priceCents: 1000, isActive: true, stockQuantity: 10, ...overrides };
}

describe('buildReorderPlan', () => {
  it('reconduit une ligne disponible telle quelle', () => {
    const p = product({ stockQuantity: 5 });
    const items: ReorderSourceItem[] = [{ productId: p.id, productName: 'Maillot', quantity: 2 }];
    const plan = buildReorderPlan(items, new Map([[p.id, p]]));

    expect(plan.linesToAdd).toEqual([{ productId: p.id, quantity: 2 }]);
    expect(plan.unavailable).toEqual([]);
  });

  it("écarte un produit retiré du catalogue (n'existe plus dans la map actuelle)", () => {
    const items: ReorderSourceItem[] = [{ productId: randomUUID(), productName: 'Vieux produit', quantity: 1 }];
    const plan = buildReorderPlan(items, new Map());

    expect(plan.linesToAdd).toEqual([]);
    expect(plan.unavailable).toEqual([
      { productName: 'Vieux produit', reason: "Ce produit n'est plus disponible au catalogue." },
    ]);
  });

  it('écarte un produit désactivé (isActive=false)', () => {
    const p = product({ isActive: false });
    const items: ReorderSourceItem[] = [{ productId: p.id, productName: 'Casquette', quantity: 1 }];
    const plan = buildReorderPlan(items, new Map([[p.id, p]]));

    expect(plan.linesToAdd).toEqual([]);
    expect(plan.unavailable[0]!.reason).toMatch(/plus disponible/);
  });

  it('écarte un produit en rupture de stock totale (stockQuantity=0)', () => {
    const p = product({ stockQuantity: 0 });
    const items: ReorderSourceItem[] = [{ productId: p.id, productName: 'Ballon', quantity: 3 }];
    const plan = buildReorderPlan(items, new Map([[p.id, p]]));

    expect(plan.linesToAdd).toEqual([]);
    expect(plan.unavailable[0]!.reason).toMatch(/rupture de stock/);
  });

  it('réduit la quantité au stock disponible et signale la réduction', () => {
    const p = product({ stockQuantity: 2 });
    const items: ReorderSourceItem[] = [{ productId: p.id, productName: 'Chandail', quantity: 5 }];
    const plan = buildReorderPlan(items, new Map([[p.id, p]]));

    expect(plan.linesToAdd).toEqual([{ productId: p.id, quantity: 2 }]);
    expect(plan.unavailable).toEqual([
      { productName: 'Chandail', reason: 'Quantité réduite à 2 (stock insuffisant pour 5).' },
    ]);
  });
});

describe('deriveBeneficiarySplitFromCredits', () => {
  it('retourne un tableau vide si aucun crédit', () => {
    expect(deriveBeneficiarySplitFromCredits([])).toEqual([]);
  });

  it('répartit 50/50 exactement quand les montants sont égaux', () => {
    const credits: ReorderBeneficiaryCredit[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a', amountCents: 500 },
      { beneficiaryType: 'athlete', beneficiaryId: 'b', amountCents: 500 },
    ];
    const split = deriveBeneficiarySplitFromCredits(credits);

    expect(split).toEqual([
      { beneficiaryType: 'athlete', beneficiaryId: 'a', shareBps: 5000 },
      { beneficiaryType: 'athlete', beneficiaryId: 'b', shareBps: 5000 },
    ]);
  });

  it('attribue le reliquat d\'arrondi au premier bénéficiaire (somme toujours = 10000)', () => {
    // 1/3, 1/3, 1/3 -> 3333 + 3333 + 3333 = 9999, reliquat de 1 bps au premier.
    const credits: ReorderBeneficiaryCredit[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a', amountCents: 100 },
      { beneficiaryType: 'athlete', beneficiaryId: 'b', amountCents: 100 },
      { beneficiaryType: 'athlete', beneficiaryId: 'c', amountCents: 100 },
    ];
    const split = deriveBeneficiarySplitFromCredits(credits);

    expect(split.reduce((sum, line) => sum + line.shareBps, 0)).toBe(10000);
    expect(split[0]!.shareBps).toBe(3334);
    expect(split[1]!.shareBps).toBe(3333);
    expect(split[2]!.shareBps).toBe(3333);
  });

  it('retourne un tableau vide si le total des crédits est nul', () => {
    const credits: ReorderBeneficiaryCredit[] = [
      { beneficiaryType: 'athlete', beneficiaryId: 'a', amountCents: 0 },
    ];
    expect(deriveBeneficiarySplitFromCredits(credits)).toEqual([]);
  });
});
