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
  equalSplitBps,
  splitBpsEqually,
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

/**
 * Tâche 1.6.A4 (docs/prompts/phase-1-6.md) : `splitBpsEqually`/`equalSplitBps`
 * sont les nouvelles fonctions pures utilisées par
 * `components/beneficiary-split.tsx` pour égaliser automatiquement la
 * répartition dès qu'on ajoute un bénéficiaire, et pour redistribuer le
 * reliquat entre les autres lignes lors d'un ajustement manuel -- même
 * convention d'arrondi (reliquat au PREMIER) que `splitCreditAmongBeneficiaries`
 * (lib/credits/calculate.ts) et `deriveBeneficiarySplitFromCredits` (lib/
 * reorder/reorder.ts).
 */
describe('splitBpsEqually / equalSplitBps', () => {
  it('retourne un tableau vide pour 0 bénéficiaire', () => {
    expect(splitBpsEqually(10000, 0)).toEqual([]);
    expect(equalSplitBps(0)).toEqual([]);
  });

  it('attribue 10000 à un seul bénéficiaire', () => {
    expect(equalSplitBps(1)).toEqual([10000]);
  });

  it('répartit exactement 50/50 pour deux bénéficiaires', () => {
    expect(equalSplitBps(2)).toEqual([5000, 5000]);
  });

  it('répartit 33/33/33 avec le reliquat au premier pour trois bénéficiaires (somme = 10000)', () => {
    const shares = equalSplitBps(3);
    expect(shares).toEqual([3334, 3333, 3333]);
    expect(shares.reduce((sum, bps) => sum + bps, 0)).toBe(10000);
  });

  it('répartit 7 bénéficiaires avec le reliquat au premier (somme = 10000)', () => {
    const shares = equalSplitBps(7);
    expect(shares.reduce((sum, bps) => sum + bps, 0)).toBe(10000);
    // Convention : chaque part = floor(10000/7) = 1428, reliquat (10000 -
    // 1428*7 = 4 bps) ajouté à la PREMIÈRE part -- pas Math.ceil(10000/7)
    // (1429), qui sous-estime un reliquat de plus d'une unité.
    const base = Math.floor(10000 / 7);
    const remainder = 10000 - base * 7;
    expect(shares[0]).toBe(base + remainder);
    expect(new Set(shares.slice(1)).size).toBe(1);
  });

  it('splitBpsEqually répartit un total arbitraire (reliquat redistribué lors d\'un ajustement manuel)', () => {
    // Ex. la ligne ajustée passe à 70 % (7000 bps) -- les 2 autres lignes se
    // partagent également les 3000 bps restants.
    expect(splitBpsEqually(3000, 2)).toEqual([1500, 1500]);
    // Reliquat impair : 1000 bps entre 3 lignes -> 334/333/333.
    expect(splitBpsEqually(1000, 3)).toEqual([334, 333, 333]);
  });
});
