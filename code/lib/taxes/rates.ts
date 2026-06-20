/**
 * Accès à `tax_rates` (Tâche 1.5). CLAUDE.md section 2 : « Taxes TPS 5 % +
 * TVQ 9,975 % via la table `tax_rates`, jamais en dur dans la logique. » Le
 * Québec stocke un taux COMBINÉ (voir supabase/seed.sql) -- ce module ne
 * fait aucune hypothèse sur le nombre de lignes par province, il prend
 * simplement la ligne `effective_at` la plus récente qui soit déjà passée
 * au moment de la commande (permet de programmer un changement de taux à
 * l'avance sans toucher au code).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaxRatesTable } from '@/lib/db/types';

export type TaxRateRow = TaxRatesTable['Row'];

export interface TaxRatesRepo {
  getApplicableRate(province: string, atIso: string): Promise<TaxRateRow | null>;
}

export function createSupabaseTaxRatesRepo(supabase: SupabaseClient): TaxRatesRepo {
  return {
    async getApplicableRate(province, atIso) {
      const { data, error } = await supabase
        .from('tax_rates')
        .select('*')
        .eq('province', province)
        .lte('effective_at', atIso)
        .order('effective_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as TaxRateRow) ?? null;
    },
  };
}
