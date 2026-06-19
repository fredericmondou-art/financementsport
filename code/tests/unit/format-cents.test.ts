import { describe, expect, it } from 'vitest';
import { formatCents } from '../../lib/format-cents';

/**
 * `Intl.NumberFormat` peut insérer des espaces insécables (U+202F) selon
 * l'environnement ICU. On normalise tous les espaces en espace simple avant
 * comparaison pour ne pas dépendre de ce détail d'encodage.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/\s/gu, ' ');
}

describe('formatCents', () => {
  it('formate un montant entier en centimes en devise lisible', () => {
    expect(normalizeSpaces(formatCents(150000))).toBe('1 500,00 $');
  });

  it('formate zéro correctement', () => {
    expect(normalizeSpaces(formatCents(0))).toBe('0,00 $');
  });

  it('rejette un montant non entier (jamais de float pour de l’argent)', () => {
    expect(() => formatCents(19.99)).toThrow();
  });
});
