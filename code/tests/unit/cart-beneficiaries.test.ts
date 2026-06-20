/**
 * Tests unitaires de la répartition entre bénéficiaires (Tâche 1.4) :
 * `assertSplitTotals10000` (fonction pure) et `beneficiarySplitInputSchema`.
 * Pas de DB ni de panier ici — voir `tests/integration/cart.test.ts` pour le
 * flux complet (`setCartBeneficiarySplit`, contrôle d'accès).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertSplitTotals10000,
  beneficiarySplitInputSchema,
  type BeneficiarySplitInput,
} from '@/lib/cart/beneficiaries';
import { BusinessRuleError } from '@/lib/entities/errors';

const athleteId = randomUUID();
const teamId = randomUUID();

describe('assertSplitTotals10000 — règle "SUM(share_bps) = 10000"', () => {
  it('ne lève rien quand la somme des parts vaut exactement 10000', () => {
    const split: BeneficiarySplitInput = [
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 6000 },
      { beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 4000 },
    ];
    expect(() => assertSplitTotals10000(split)).not.toThrow();
  });

  it('lève BusinessRuleError quand la somme est inférieure à 10000', () => {
    const split: BeneficiarySplitInput = [
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 5000 },
    ];
    expect(() => assertSplitTotals10000(split)).toThrow(BusinessRuleError);
  });

  it('lève BusinessRuleError quand la somme dépasse 10000', () => {
    const split: BeneficiarySplitInput = [
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 6000 },
      { beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 5000 },
    ];
    expect(() => assertSplitTotals10000(split)).toThrow(BusinessRuleError);
  });

  it('un seul bénéficiaire à 10000 bps (100 %) est valide', () => {
    const split: BeneficiarySplitInput = [
      { beneficiaryType: 'club', beneficiaryId: randomUUID(), shareBps: 10000 },
    ];
    expect(() => assertSplitTotals10000(split)).not.toThrow();
  });
});

describe('beneficiarySplitInputSchema', () => {
  it('refuse un tableau vide (au moins un bénéficiaire requis)', () => {
    const result = beneficiarySplitInputSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('refuse une shareBps de 0 (doit être positive)', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 0 },
    ]);
    expect(result.success).toBe(false);
  });

  it('refuse une shareBps supérieure à 10000', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 10001 },
    ]);
    expect(result.success).toBe(false);
  });

  it('refuse une shareBps non entière', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 100.5 },
    ]);
    expect(result.success).toBe(false);
  });

  it('refuse un beneficiaryType hors athlete/team/club', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'sponsor', beneficiaryId: athleteId, shareBps: 10000 },
    ]);
    expect(result.success).toBe(false);
  });

  it('refuse un beneficiaryId qui n’est pas un UUID', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: 'pas-un-uuid', shareBps: 10000 },
    ]);
    expect(result.success).toBe(false);
  });

  it('accepte un campaignId absent ou explicitement null', () => {
    const sansCampagne = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 10000 },
    ]);
    expect(sansCampagne.success).toBe(true);

    const campagneNull = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, campaignId: null, shareBps: 10000 },
    ]);
    expect(campagneNull.success).toBe(true);
  });

  it('accepte une répartition multi-bénéficiaires totalisant 10000 (validation séparée de assertSplitTotals10000)', () => {
    const result = beneficiarySplitInputSchema.safeParse([
      { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 4000 },
      { beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 6000 },
    ]);
    expect(result.success).toBe(true);
  });
});
