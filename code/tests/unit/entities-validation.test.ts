/**
 * Tests unitaires de validation zod pour les entités club/équipe/athlète
 * (Tâche 1.1). Pas de DB ni de permission ici — uniquement la forme des
 * entrées, voir `tests/integration/entities.test.ts` pour le flux complet.
 */
import { describe, expect, it } from 'vitest';
import { athleteInputSchema, athleteUpdateSchema } from '@/lib/entities/athletes';
import { clubInputSchema } from '@/lib/entities/clubs';
import { teamInputSchema } from '@/lib/entities/teams';

describe('clubInputSchema', () => {
  it('accepte un club minimal (nom seul)', () => {
    const result = clubInputSchema.safeParse({ name: 'Corsaires' });
    expect(result.success).toBe(true);
  });

  it('refuse un nom vide', () => {
    const result = clubInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('refuse une province qui n’a pas exactement 2 caractères', () => {
    const result = clubInputSchema.safeParse({ name: 'Corsaires', province: 'Québec' });
    expect(result.success).toBe(false);
  });

  it('refuse une URL de logo invalide', () => {
    const result = clubInputSchema.safeParse({ name: 'Corsaires', logoUrl: 'pas-une-url' });
    expect(result.success).toBe(false);
  });
});

describe('teamInputSchema', () => {
  it('accepte une équipe sans club (indépendante)', () => {
    const result = teamInputSchema.safeParse({ name: 'U11', clubId: null });
    expect(result.success).toBe(true);
  });

  it('refuse un clubId qui n’est pas un UUID', () => {
    const result = teamInputSchema.safeParse({ name: 'U11', clubId: 'pas-un-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('athleteInputSchema — règle "mineur exige guardianId"', () => {
  it('refuse un athlète mineur sans guardianId (défaut isMinor = true)', () => {
    const result = athleteInputSchema.safeParse({ firstName: 'Thomas', lastName: 'Tremblay' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('guardianId'))).toBe(true);
    }
  });

  it('accepte un athlète mineur avec guardianId', () => {
    const result = athleteInputSchema.safeParse({
      firstName: 'Thomas',
      lastName: 'Tremblay',
      guardianId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('accepte un athlète explicitement majeur sans guardianId', () => {
    const result = athleteInputSchema.safeParse({
      firstName: 'Marie',
      lastName: 'Roy',
      isMinor: false,
    });
    expect(result.success).toBe(true);
  });

  it('refuse un prénom vide', () => {
    const result = athleteInputSchema.safeParse({
      firstName: '',
      lastName: 'Tremblay',
      isMinor: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('athleteUpdateSchema — exclut volontairement guardianId/userId/isMinor', () => {
  it('ignore un champ guardianId fourni en trop (strip silencieux, pas une erreur)', () => {
    const result = athleteUpdateSchema.safeParse({
      firstName: 'Thomas',
      guardianId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('guardianId' in result.data).toBe(false);
    }
  });

  it('accepte une mise à jour partielle des champs hide_*', () => {
    const result = athleteUpdateSchema.safeParse({ hideLastName: true });
    expect(result.success).toBe(true);
  });
});
