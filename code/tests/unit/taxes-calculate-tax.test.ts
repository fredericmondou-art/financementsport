/**
 * Tests unitaires de `calculateTaxCents` (Tâche 1.5). CLAUDE.md section 8 :
 * couvrir les cas limites d'une fonction qui touche l'argent (montant 0,
 * arrondi, entrée négative). Taux QC réel (1498 bps = TPS 5 % + TVQ 9,975 %
 * combinées) confirmé dans `supabase/seed.sql`.
 */
import { describe, expect, it } from 'vitest';
import { calculateTaxCents } from '@/lib/taxes/calculate-tax';

const TAX_RATE_BPS_QC = 1498;

describe('calculateTaxCents', () => {
  it('calcule la TPS + TVQ combinée du Québec sur un sous-total taxable, avec arrondi', () => {
    // 12345 ¢ x 1498 bps / 10000 = 1849,281 -> arrondi à 1849.
    expect(calculateTaxCents(12345, TAX_RATE_BPS_QC)).toBe(1849);
  });

  it('ne fait aucun arrondi quand le résultat est déjà un nombre entier de centimes', () => {
    // 10000 ¢ x 1498 bps / 10000 = 1498 exactement.
    expect(calculateTaxCents(10000, TAX_RATE_BPS_QC)).toBe(1498);
  });

  it('retourne 0 sur un sous-total taxable nul', () => {
    expect(calculateTaxCents(0, TAX_RATE_BPS_QC)).toBe(0);
  });

  it('retourne 0 quand le taux est 0 bps, même avec un sous-total positif', () => {
    expect(calculateTaxCents(10000, 0)).toBe(0);
  });

  it('arrondit à la baisse quand la partie décimale est sous 0,5 centime', () => {
    // 23 ¢ x 1498 bps / 10000 = 3,4454 -> arrondi à 3.
    expect(calculateTaxCents(23, TAX_RATE_BPS_QC)).toBe(3);
  });

  it('arrondit correctement un cas pile à la moitié de centime (Math.round arrondit vers le haut)', () => {
    // 1 ¢ x 5000 bps / 10000 = 0,5 -> Math.round(0.5) = 1.
    expect(calculateTaxCents(1, 5000)).toBe(1);
  });

  it('rejette un sous-total taxable négatif', () => {
    expect(() => calculateTaxCents(-1, TAX_RATE_BPS_QC)).toThrow();
  });

  it('rejette un taux négatif', () => {
    expect(() => calculateTaxCents(10000, -1)).toThrow();
  });
});
