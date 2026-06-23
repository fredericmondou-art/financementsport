/**
 * Résolution de la hiérarchie de règles de crédit (Tâche 1.3 — CŒUR).
 *
 * Fonction PURE : aucune I/O. Les `rules` pertinentes sont chargées par
 * l'appelant (Tâche 1.5 fera la requête DB) ; cette fonction se contente
 * d'appliquer la hiérarchie exactement comme documentée dans
 * `docs/schema-reference.sql` (table `credit_rules`) :
 *
 *   1. `products.fixed_credit_cents` (crédit fixe sur le produit/pack)
 *   2. `credit_rules` ciblant (campaign_id + product_id)
 *   3. `credit_rules` ciblant (campaign_id)            -> taux de la campagne
 *   4. `credit_rules` ciblant (product_id)
 *   5. `credit_rules` globale (scope = 'permanent' / 'subscription' / défaut)
 *
 * Les règles 2 et 3 (scope campagne) ne s'appliquent QUE si la campagne est
 * active (`isCampaignActive`) — une campagne `draft`/`ended`/`closed`/etc. ne
 * doit pas faire bénéficier son taux préférentiel ; le calcul retombe alors
 * sur la règle produit, puis la règle globale (boutique permanente).
 */
import type { CreditRulesTable } from '@/lib/db/types';

export type CreditRuleRow = CreditRulesTable['Row'];

export interface ResolveRuleInput {
  productId: string;
  /** `products.fixed_credit_cents` pour ce produit ; `null` si le crédit
   * dépend d'une règle `credit_rules` (la plupart des produits hors pack). */
  fixedCreditCents: number | null;
  /** Campagne dans le contexte de cet achat, le cas échéant. */
  campaignId: string | null;
  /** Statut de la campagne : `false` si `campaignId` n'est pas `null` mais que
   * la campagne n'est pas active (brouillon, terminée, fermée...). Ignoré si
   * `campaignId` est `null`. */
  isCampaignActive: boolean;
  /** Toutes les règles potentiellement pertinentes (filtrage `is_active`
   * fait par cette fonction, pas besoin de pré-filtrer). */
  rules: CreditRuleRow[];
  /** Portée de la règle globale à privilégier en l'absence de campagne
   * active (`'permanent'` pour la boutique, `'subscription'` pour un
   * abonnement). Par défaut `'permanent'`. */
  globalScope?: string;
}

export type ResolvedCreditBasis =
  | {
      mode: 'fixed_product';
      unitCreditCents: number;
      appliedRuleId: null;
      computationNote: string;
    }
  | {
      mode: 'rule';
      rule: CreditRuleRow;
      appliedRuleId: string;
      computationNote: string;
    }
  | {
      mode: 'none';
      appliedRuleId: null;
      computationNote: string;
    };

/**
 * En cas d'égalité de `priority` entre plusieurs règles de même spécificité,
 * la première règle du tableau d'entrée gagne (ordre stable, déterministe).
 * Le départage par priorité explicite (`credit_rules.priority`) reste le
 * mécanisme attendu pour des cas réels ; ce choix ne fait que garantir
 * qu'aucune égalité résiduelle ne produise un résultat non déterministe.
 */
function pickHighestPriority(rules: CreditRuleRow[]): CreditRuleRow | null {
  if (rules.length === 0) return null;
  return rules.reduce((best, candidate) =>
    candidate.priority > best.priority ? candidate : best,
  );
}

export function resolveRule(input: ResolveRuleInput): ResolvedCreditBasis {
  // 1. Crédit fixe produit — la plus spécifique, court-circuite tout le reste.
  if (input.fixedCreditCents !== null) {
    return {
      mode: 'fixed_product',
      unitCreditCents: input.fixedCreditCents,
      appliedRuleId: null,
      computationNote: 'Crédit fixe défini sur le produit',
    };
  }

  const activeRules = input.rules.filter((rule) => rule.is_active);

  if (input.campaignId !== null && input.isCampaignActive) {
    // 2. Règle (campagne + produit).
    const campaignAndProduct = pickHighestPriority(
      activeRules.filter(
        (rule) => rule.campaign_id === input.campaignId && rule.product_id === input.productId,
      ),
    );
    if (campaignAndProduct) {
      return {
        mode: 'rule',
        rule: campaignAndProduct,
        appliedRuleId: campaignAndProduct.id,
        computationNote: 'Règle campagne + produit',
      };
    }

    // 3. Règle (campagne) — taux de la campagne.
    const campaignOnly = pickHighestPriority(
      activeRules.filter(
        (rule) => rule.campaign_id === input.campaignId && rule.product_id === null,
      ),
    );
    if (campaignOnly) {
      return {
        mode: 'rule',
        rule: campaignOnly,
        appliedRuleId: campaignOnly.id,
        computationNote: 'Règle campagne',
      };
    }
  }

  // 4. Règle (produit), hors contexte de campagne (ou campagne inactive).
  const productOnly = pickHighestPriority(
    activeRules.filter((rule) => rule.campaign_id === null && rule.product_id === input.productId),
  );
  if (productOnly) {
    return {
      mode: 'rule',
      rule: productOnly,
      appliedRuleId: productOnly.id,
      computationNote: 'Règle produit',
    };
  }

  // 5. Règle globale (scope demandé en priorité, sinon n'importe quelle
  // règle globale active — mieux qu'aucun crédit du tout).
  const globalScope = input.globalScope ?? 'permanent';
  const globalCandidates = activeRules.filter(
    (rule) => rule.campaign_id === null && rule.product_id === null,
  );
  const global =
    pickHighestPriority(globalCandidates.filter((rule) => rule.scope === globalScope)) ??
    pickHighestPriority(globalCandidates);
  if (global) {
    return {
      mode: 'rule',
      rule: global,
      appliedRuleId: global.id,
      computationNote: `Règle globale (${global.scope})`,
    };
  }

  return {
    mode: 'none',
    appliedRuleId: null,
    computationNote: 'Aucune règle de crédit applicable',
  };
}
