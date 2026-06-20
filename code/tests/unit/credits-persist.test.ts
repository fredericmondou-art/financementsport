/**
 * Tests unitaires de `lib/credits/persist.ts` (Tâche 1.5) : décision du
 * statut du crédit ('active' vs 'pending') et agrégation de la traçabilité
 * (`applied_rule_id`/`computation_note`) entre l'écriture par ligne (Tâche
 * 1.3) et l'écriture par bénéficiaire (`order_credits`). CLAUDE.md section 8 :
 * « transitions de statut » explicitement visées par les tests obligatoires.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildOrderCreditInserts, decideCreditStatus } from '@/lib/credits/persist';
import type { BeneficiaryCreditResult, LineCreditResult } from '@/lib/credits/calculate';

describe('decideCreditStatus', () => {
  it('retourne "active" quand la commande n’a aucune campagne de contexte (achat boutique permanent)', () => {
    expect(decideCreditStatus(null, false)).toBe('active');
    expect(decideCreditStatus(null, true)).toBe('active');
  });

  it('retourne "active" quand la campagne de contexte est active', () => {
    expect(decideCreditStatus(randomUUID(), true)).toBe('active');
  });

  it('retourne "pending" quand la campagne de contexte n’est pas encore active', () => {
    expect(decideCreditStatus(randomUUID(), false)).toBe('pending');
  });
});

describe('buildOrderCreditInserts', () => {
  const athleteId = randomUUID();
  const teamId = randomUUID();
  const productId1 = randomUUID();
  const productId2 = randomUUID();

  function makeBeneficiaryCredit(overrides: Partial<BeneficiaryCreditResult>): BeneficiaryCreditResult {
    return {
      beneficiaryType: overrides.beneficiaryType ?? 'athlete',
      beneficiaryId: overrides.beneficiaryId ?? athleteId,
      shareBps: overrides.shareBps ?? 10000,
      amountCents: overrides.amountCents ?? 0,
    };
  }

  it('cite directement applied_rule_id quand toutes les lignes ont résolu la même règle', () => {
    const ruleId = randomUUID();
    const lineCredits: LineCreditResult[] = [
      { productId: productId1, creditCents: 100, appliedRuleId: ruleId, computationNote: 'ligne 1' },
      { productId: productId2, creditCents: 200, appliedRuleId: ruleId, computationNote: 'ligne 2' },
    ];
    const beneficiaryCredits = [makeBeneficiaryCredit({ amountCents: 300 })];

    const inserts = buildOrderCreditInserts(lineCredits, beneficiaryCredits, null, false);

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      beneficiary_type: 'athlete',
      beneficiary_id: athleteId,
      campaign_id: null,
      amount_cents: 300,
      status: 'active',
      applied_rule_id: ruleId,
    });
    expect(inserts[0]?.computation_note).toBe('ligne 1 ; ligne 2');
  });

  it('laisse applied_rule_id à null quand les lignes ont résolu des règles distinctes (panier mixte)', () => {
    const ruleA = randomUUID();
    const ruleB = randomUUID();
    const lineCredits: LineCreditResult[] = [
      { productId: productId1, creditCents: 100, appliedRuleId: ruleA, computationNote: 'pack fixe' },
      { productId: productId2, creditCents: 50, appliedRuleId: ruleB, computationNote: 'règle pourcentage' },
    ];
    const beneficiaryCredits = [makeBeneficiaryCredit({ amountCents: 150 })];

    const inserts = buildOrderCreditInserts(lineCredits, beneficiaryCredits, null, false);

    expect(inserts[0]?.applied_rule_id).toBeNull();
    expect(inserts[0]?.computation_note).toBe('pack fixe ; règle pourcentage');
  });

  it('laisse applied_rule_id à null quand aucune ligne n’a de règle (mode "none" partout)', () => {
    const lineCredits: LineCreditResult[] = [
      { productId: productId1, creditCents: 0, appliedRuleId: null, computationNote: 'aucune règle' },
    ];
    const beneficiaryCredits = [makeBeneficiaryCredit({ amountCents: 0 })];

    const inserts = buildOrderCreditInserts(lineCredits, beneficiaryCredits, null, false);

    expect(inserts[0]?.applied_rule_id).toBeNull();
  });

  it('gère une commande sans lignes ("Aucune ligne.")', () => {
    const beneficiaryCredits = [makeBeneficiaryCredit({ amountCents: 0 })];
    const inserts = buildOrderCreditInserts([], beneficiaryCredits, null, false);
    expect(inserts[0]?.computation_note).toBe('Aucune ligne.');
    expect(inserts[0]?.applied_rule_id).toBeNull();
  });

  it('produit une ligne order_credits par bénéficiaire, avec le même statut/traçabilité partagés', () => {
    const ruleId = randomUUID();
    const campaignId = randomUUID();
    const lineCredits: LineCreditResult[] = [
      { productId: productId1, creditCents: 1000, appliedRuleId: ruleId, computationNote: 'ligne unique' },
    ];
    const beneficiaryCredits = [
      makeBeneficiaryCredit({ beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 7000, amountCents: 700 }),
      makeBeneficiaryCredit({ beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 3000, amountCents: 300 }),
    ];

    const inserts = buildOrderCreditInserts(lineCredits, beneficiaryCredits, campaignId, true);

    expect(inserts).toHaveLength(2);
    expect(inserts.every((insert) => insert.status === 'active')).toBe(true);
    expect(inserts.every((insert) => insert.campaign_id === campaignId)).toBe(true);
    expect(inserts.every((insert) => insert.applied_rule_id === ruleId)).toBe(true);
    expect(inserts.map((insert) => insert.amount_cents)).toEqual([700, 300]);
  });

  it('statut "pending" propagé à toutes les lignes order_credits quand la campagne n’est pas active', () => {
    const campaignId = randomUUID();
    const lineCredits: LineCreditResult[] = [
      { productId: productId1, creditCents: 500, appliedRuleId: null, computationNote: 'note' },
    ];
    const beneficiaryCredits = [makeBeneficiaryCredit({ amountCents: 500 })];

    const inserts = buildOrderCreditInserts(lineCredits, beneficiaryCredits, campaignId, false);

    expect(inserts[0]?.status).toBe('pending');
  });
});
