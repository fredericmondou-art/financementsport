/**
 * Charge le total déjà attribué cette année civile par athlète (R8,
 * lib/credits/annual-cap.ts) -- I/O pure, non testée unitairement, comme
 * `lib/cart/credit-context.ts` (couverte indirectement par les tests
 * d'intégration/e2e du webhook Stripe).
 *
 * « Année civile » = 1er janvier 00:00 UTC au 31 décembre 23:59:59.999 UTC
 * de l'année courante (décision autonome, docs/DECISIONS.md -- distincte de
 * la fenêtre « 12 mois glissants » de R7, qui elle utilise `since`
 * relatif à `now()`).
 *
 * Ne compte que les crédits réellement « attribués » au sens de la spec :
 * `active`, ou `pending` uniquement parce que la campagne n'est pas encore
 * active (`pending_reason = 'campagne_inactive'`) -- jamais un excédent déjà
 * mis en attente pour `plafond_annuel` (voir le commentaire détaillé dans
 * lib/credits/annual-cap.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnnualCreditTotalsByAthlete } from './annual-cap';

export function currentCalendarYearBoundsUtc(now: Date = new Date()): { startIso: string; endIso: string } {
  const year = now.getUTCFullYear();
  const startIso = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString();
  return { startIso, endIso };
}

export async function loadAthleteAnnualCreditTotals(
  supabase: SupabaseClient,
  athleteIds: string[],
  now: Date = new Date(),
): Promise<AnnualCreditTotalsByAthlete> {
  const uniqueAthleteIds = [...new Set(athleteIds)];
  const totals = new Map<string, number>();
  if (uniqueAthleteIds.length === 0) {
    return totals;
  }

  const { startIso, endIso } = currentCalendarYearBoundsUtc(now);

  const { data, error } = await supabase
    .from('order_credits')
    .select('beneficiary_id, amount_cents')
    .eq('beneficiary_type', 'athlete')
    .in('beneficiary_id', uniqueAthleteIds)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .or('status.eq.active,and(status.eq.pending,pending_reason.eq.campagne_inactive)');
  if (error) throw error;

  for (const row of (data as Array<{ beneficiary_id: string; amount_cents: number }>) ?? []) {
    totals.set(row.beneficiary_id, (totals.get(row.beneficiary_id) ?? 0) + row.amount_cents);
  }

  return totals;
}
