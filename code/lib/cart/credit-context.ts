/**
 * Charge les données externes (règles de crédit actives, statut de
 * campagne, crédit fixe des produits) nécessaires à `estimateCartCredit`
 * (Tâche 1.4). Séparé d'`estimate-credit.ts` pour que ce dernier reste une
 * fonction pure de mapping/délégation, sans accès réseau (testable sans
 * Supabase) — ce module-ci, lui, fait l'I/O et n'est PAS testé unitairement
 * (couvert indirectement par les tests d'intégration/e2e, comme les autres
 * `createSupabase*Repo` du projet).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreditRuleRow } from '@/lib/credits/resolve-rule';
import type { CartItemCreditInfo } from './estimate-credit';

export interface CartCreditContext {
  rules: CreditRuleRow[];
  isCampaignActive: boolean;
  productCreditInfoById: Map<string, CartItemCreditInfo>;
}

export async function loadCartCreditContext(
  supabase: SupabaseClient,
  productIds: string[],
  campaignId: string | null,
): Promise<CartCreditContext> {
  const { data: ruleRows, error: rulesError } = await supabase
    .from('credit_rules')
    .select('*')
    .eq('is_active', true);
  if (rulesError) throw rulesError;

  let isCampaignActive = false;
  if (campaignId !== null) {
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .maybeSingle();
    if (campaignError) throw campaignError;
    isCampaignActive = (campaign as { status: string } | null)?.status === 'active';
  }

  const productCreditInfoById = new Map<string, CartItemCreditInfo>();
  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length > 0) {
    const { data: productRows, error: productsError } = await supabase
      .from('products')
      .select('id, fixed_credit_cents')
      .in('id', uniqueProductIds);
    if (productsError) throw productsError;
    for (const row of (productRows as Array<{ id: string; fixed_credit_cents: number | null }>) ?? []) {
      productCreditInfoById.set(row.id, { fixedCreditCents: row.fixed_credit_cents });
    }
  }

  return {
    rules: (ruleRows as CreditRuleRow[]) ?? [],
    isCampaignActive,
    productCreditInfoById,
  };
}
