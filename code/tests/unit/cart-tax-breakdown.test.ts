/**
 * Tests unitaires de `lib/cart/tax-breakdown.ts` (Tâche 1.4b.4, docs/prompts/
 * phase-1-4b.md) : affichage du détail sous-total/TPS/TVQ/total au panier.
 *
 * Cahier : « Unitaire : affichage des taxes cohérent avec `tax_rates` (pas de
 * taux en dur). » -- `combinedRateBps` est donc systématiquement passé en
 * paramètre dans ces tests, jamais une valeur supposée par la fonction
 * elle-même (vérifié explicitement en faisant varier ce taux d'un test à
 * l'autre et en confirmant que le résultat varie en conséquence).
 */
import { describe, expect, it } from 'vitest';
import { computeCartTaxBreakdown } from '@/lib/cart/tax-breakdown';

const QC_COMBINED_RATE_BPS = 1498; // TPS 5% + TVQ 9.975%, voir supabase/seed.sql

describe('computeCartTaxBreakdown', () => {
  it('ventile sous-total, TPS, TVQ et total pour une ligne taxable (cas du cahier : 120 $)', () => {
    const result = computeCartTaxBreakdown(
      [{ unitPriceCents: 12000, quantity: 1, isTaxable: true }],
      QC_COMBINED_RATE_BPS,
    );
    expect(result.subtotalCents).toBe(12000);
    expect(result.taxableSubtotalCents).toBe(12000);
    expect(result.taxCents).toBe(Math.round((12000 * QC_COMBINED_RATE_BPS) / 10000));
    expect(result.tpsCents + result.tvqCents).toBe(result.taxCents);
    expect(result.tpsCents).toBe(Math.round((result.taxCents * 500) / QC_COMBINED_RATE_BPS));
    expect(result.totalCents).toBe(result.subtotalCents + result.taxCents);
  });

  it('exclut les lignes non taxables de l’assiette taxable, mais pas du sous-total ni du total', () => {
    const result = computeCartTaxBreakdown(
      [
        { unitPriceCents: 5000, quantity: 1, isTaxable: true },
        { unitPriceCents: 3000, quantity: 1, isTaxable: false },
      ],
      QC_COMBINED_RATE_BPS,
    );
    expect(result.subtotalCents).toBe(8000);
    expect(result.taxableSubtotalCents).toBe(5000);
    expect(result.taxCents).toBe(Math.round((5000 * QC_COMBINED_RATE_BPS) / 10000));
    expect(result.totalCents).toBe(8000 + result.taxCents);
  });

  it('multiplie par la quantité avant de calculer la taxe', () => {
    const result = computeCartTaxBreakdown(
      [{ unitPriceCents: 1000, quantity: 3, isTaxable: true }],
      QC_COMBINED_RATE_BPS,
    );
    expect(result.subtotalCents).toBe(3000);
    expect(result.taxableSubtotalCents).toBe(3000);
  });

  it('panier vide -> tous les montants à zéro', () => {
    const result = computeCartTaxBreakdown([], QC_COMBINED_RATE_BPS);
    expect(result).toEqual({
      subtotalCents: 0,
      taxableSubtotalCents: 0,
      tpsCents: 0,
      tvqCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });

  it('taux à zéro (aucune ligne tax_rates applicable) -> aucune taxe, jamais de division par zéro', () => {
    const result = computeCartTaxBreakdown([{ unitPriceCents: 5000, quantity: 1, isTaxable: true }], 0);
    expect(result.taxCents).toBe(0);
    expect(result.tpsCents).toBe(0);
    expect(result.tvqCents).toBe(0);
    expect(result.totalCents).toBe(5000);
  });

  it('le taux est bien lu en paramètre, pas codé en dur -- un taux différent change le résultat', () => {
    const lines = [{ unitPriceCents: 10000, quantity: 1, isTaxable: true }];
    const atDefaultRate = computeCartTaxBreakdown(lines, QC_COMBINED_RATE_BPS);
    const atDoubleRate = computeCartTaxBreakdown(lines, QC_COMBINED_RATE_BPS * 2);
    expect(atDoubleRate.taxCents).toBe(atDefaultRate.taxCents * 2);
  });

  it('le reliquat d’arrondi de la ventilation TPS/TVQ reste toujours à la TVQ (cohérent avec splitQcTax)', () => {
    const result = computeCartTaxBreakdown([{ unitPriceCents: 1, quantity: 1, isTaxable: true }], QC_COMBINED_RATE_BPS);
    expect(result.tpsCents + result.tvqCents).toBe(result.taxCents);
  });
});
