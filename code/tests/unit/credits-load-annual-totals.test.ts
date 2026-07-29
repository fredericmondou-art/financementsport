/**
 * Test unitaire de `currentCalendarYearBoundsUtc` (lib/credits/
 * load-annual-totals.ts) -- seule partie PURE de ce module (le reste est de
 * l'I/O Supabase, non testé unitairement, même convention que
 * lib/cart/credit-context.ts). Vérifie la décision autonome documentée dans
 * docs/DECISIONS.md : « année civile » = 1er janvier 00:00:00.000 UTC au 31
 * décembre 23:59:59.999 UTC de l'année courante.
 */
import { describe, expect, it } from 'vitest';
import { currentCalendarYearBoundsUtc } from '@/lib/credits/load-annual-totals';

describe('currentCalendarYearBoundsUtc', () => {
  it('retourne le 1er janvier 00:00:00.000 UTC comme borne de début', () => {
    const { startIso } = currentCalendarYearBoundsUtc(new Date('2026-07-10T15:30:00.000Z'));
    expect(startIso).toBe('2026-01-01T00:00:00.000Z');
  });

  it('retourne le 31 décembre 23:59:59.999 UTC comme borne de fin', () => {
    const { endIso } = currentCalendarYearBoundsUtc(new Date('2026-07-10T15:30:00.000Z'));
    expect(endIso).toBe('2026-12-31T23:59:59.999Z');
  });

  it('utilise l’année de `now` telle que fournie, pas l’année système', () => {
    const { startIso, endIso } = currentCalendarYearBoundsUtc(new Date('2030-01-01T00:00:00.000Z'));
    expect(startIso).toBe('2030-01-01T00:00:00.000Z');
    expect(endIso).toBe('2030-12-31T23:59:59.999Z');
  });

  it('une date au tout début (1er janvier UTC) reste dans l’année civile courante, pas la précédente', () => {
    const { startIso } = currentCalendarYearBoundsUtc(new Date('2026-01-01T00:00:00.001Z'));
    expect(startIso).toBe('2026-01-01T00:00:00.000Z');
  });

  it('une date au tout dernier instant (31 décembre 23:59:59.999 UTC) reste dans l’année civile courante', () => {
    const { endIso } = currentCalendarYearBoundsUtc(new Date('2026-12-31T23:59:59.999Z'));
    expect(endIso).toBe('2026-12-31T23:59:59.999Z');
  });
});
