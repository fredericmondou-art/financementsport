/**
 * Tests unitaires de la hiérarchie de résolution (Tâche 1.3). Une branche
 * par niveau de spécificité + les cas limites (campagne inactive, aucune
 * règle, égalité de priorité).
 */
import { describe, expect, it } from 'vitest';
import { resolveRule, type CreditRuleRow } from '@/lib/credits/resolve-rule';

let nextId = 1;
function makeRule(overrides: Partial<CreditRuleRow> = {}): CreditRuleRow {
  const id = overrides.id ?? `rule-${nextId++}`;
  return {
    campaign_id: null,
    product_id: null,
    scope: 'default',
    percent_bps: 500,
    flat_cents: null,
    min_basket_cents: null,
    bonus_percent_bps: null,
    priority: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
    id,
  };
}

const PRODUCT_A = 'product-a';
const CAMPAIGN_X = 'campaign-x';

describe('resolveRule() — hiérarchie (CLAUDE.md / 01-schema-base-de-donnees.sql)', () => {
  it('niveau 1 : crédit fixe produit court-circuite tout, même avec des règles plus spécifiques en présence', () => {
    const rules = [
      makeRule({ campaign_id: CAMPAIGN_X, product_id: PRODUCT_A, percent_bps: 9999 }),
    ];
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: 1800,
      campaignId: CAMPAIGN_X,
      isCampaignActive: true,
      rules,
    });
    expect(basis).toMatchObject({ mode: 'fixed_product', unitCreditCents: 1800, appliedRuleId: null });
  });

  it('niveau 2 : règle (campagne + produit) prime sur campagne seule et produit seul', () => {
    const campaignAndProduct = makeRule({ campaign_id: CAMPAIGN_X, product_id: PRODUCT_A, percent_bps: 2000 });
    const rules = [
      makeRule({ campaign_id: CAMPAIGN_X, product_id: null, percent_bps: 1500 }),
      makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000 }),
      campaignAndProduct,
    ];
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: CAMPAIGN_X,
      isCampaignActive: true,
      rules,
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: campaignAndProduct.id });
  });

  it('niveau 3 : règle (campagne) utilisée si aucune règle (campagne + produit) ne correspond', () => {
    const campaignOnly = makeRule({ campaign_id: CAMPAIGN_X, product_id: null, percent_bps: 1500 });
    const rules = [
      makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000 }),
      campaignOnly,
    ];
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: CAMPAIGN_X,
      isCampaignActive: true,
      rules,
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: campaignOnly.id });
  });

  it('niveau 4 : règle (produit) utilisée hors contexte de campagne', () => {
    const productOnly = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000 });
    const global = makeRule({ campaign_id: null, product_id: null, scope: 'permanent', percent_bps: 500 });
    const rules = [global, productOnly];
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules,
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: productOnly.id });
  });

  it('niveau 5 : règle globale (scope permanent) en dernier recours', () => {
    const global = makeRule({ campaign_id: null, product_id: null, scope: 'permanent', percent_bps: 500 });
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules: [global],
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: global.id, rule: { scope: 'permanent' } });
  });

  it('campagne inactive : les règles campagne+produit et campagne sont ignorées, retombe sur la règle produit', () => {
    const campaignAndProduct = makeRule({ campaign_id: CAMPAIGN_X, product_id: PRODUCT_A, percent_bps: 2000 });
    const campaignOnly = makeRule({ campaign_id: CAMPAIGN_X, product_id: null, percent_bps: 1500 });
    const productOnly = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000 });
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: CAMPAIGN_X,
      isCampaignActive: false,
      rules: [campaignAndProduct, campaignOnly, productOnly],
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: productOnly.id });
  });

  it('aucune règle ne correspond et pas de crédit fixe : mode "none" (crédit 0, pas une erreur)', () => {
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules: [],
    });
    expect(basis).toMatchObject({ mode: 'none', appliedRuleId: null });
  });

  it('une règle inactive (is_active = false) est ignorée, même la plus spécifique', () => {
    const inactiveCampaignAndProduct = makeRule({
      campaign_id: CAMPAIGN_X,
      product_id: PRODUCT_A,
      percent_bps: 2000,
      is_active: false,
    });
    const global = makeRule({ campaign_id: null, product_id: null, scope: 'permanent', percent_bps: 500 });
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: CAMPAIGN_X,
      isCampaignActive: true,
      rules: [inactiveCampaignAndProduct, global],
    });
    expect(basis).toMatchObject({ mode: 'rule', appliedRuleId: global.id });
  });

  it('égalité de priority entre deux règles de même spécificité : choix déterministe (la première du tableau)', () => {
    const first = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000, priority: 5 });
    const second = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 2000, priority: 5 });
    const basisAB = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules: [first, second],
    });
    const basisBA = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules: [second, first],
    });
    expect(basisAB).toMatchObject({ appliedRuleId: first.id });
    expect(basisBA).toMatchObject({ appliedRuleId: second.id });
  });

  it('priority plus élevée gagne entre deux règles de même spécificité', () => {
    const lowPriority = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 1000, priority: 1 });
    const highPriority = makeRule({ campaign_id: null, product_id: PRODUCT_A, percent_bps: 2000, priority: 10 });
    const basis = resolveRule({
      productId: PRODUCT_A,
      fixedCreditCents: null,
      campaignId: null,
      isCampaignActive: false,
      rules: [lowPriority, highPriority],
    });
    expect(basis).toMatchObject({ appliedRuleId: highPriority.id });
  });
});
