/**
 * Tests unitaires du calcul des versements (Tâche 1.5.10, docs/prompts/
 * phase-1-5.md -- « tâche financière sensible ») : `lib/payouts/calculate.ts`.
 *
 * Le repo Supabase réel (`createSupabasePayoutCalculationRepo`) n'est
 * volontairement PAS exercé ici -- fine couche d'accès aux données, pas de
 * logique métier (même convention que `tests/unit/campaigns-close.test.ts`).
 * Seules les fonctions PURES + l'orchestration (avec un repo simulé) sont
 * testées ici ; la RLS réelle et la fonction Postgres gardée
 * `advance_payout_status` sont couvertes par
 * `tests/integration/payout-status-transitions-rls.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  CampaignNotClosedError,
  CampaignNotFoundError,
  computeActiveCreditsDueByBeneficiary,
  computeNetPayableCents,
  planPayoutRecalculation,
  recalculatePayoutsForCampaign,
  type CampaignRow,
  type OrderCreditRow,
  type PayoutCalculationRepo,
  type PayoutRow,
} from '@/lib/payouts/calculate';

const CAMPAIGN_ID = 'campaign-1';
const OTHER_CAMPAIGN_ID = 'campaign-2';

function credit(overrides: Partial<OrderCreditRow> = {}): OrderCreditRow {
  return {
    id: 'credit-x',
    order_id: 'order-x',
    beneficiary_type: 'athlete',
    beneficiary_id: 'athlete-1',
    campaign_id: CAMPAIGN_ID,
    amount_cents: 1000,
    status: 'active',
    applied_rule_id: null,
    computation_note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function payout(overrides: Partial<PayoutRow> = {}): PayoutRow {
  return {
    id: 'payout-x',
    campaign_id: CAMPAIGN_ID,
    beneficiary_type: 'athlete',
    beneficiary_id: 'athlete-1',
    amount_cents: 1000,
    fee_held_cents: 0,
    status: 'calculated',
    approved_by: null,
    paid_at: null,
    proof_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeActiveCreditsDueByBeneficiary', () => {
  it('somme les crédits actifs par bénéficiaire, pour la campagne donnée seulement', () => {
    const credits: OrderCreditRow[] = [
      credit({ beneficiary_id: 'athlete-1', amount_cents: 1000 }),
      credit({ beneficiary_id: 'athlete-1', amount_cents: 500 }),
      credit({ beneficiary_id: 'athlete-2', amount_cents: 2000 }),
      // Autre campagne -- ignoré.
      credit({ beneficiary_id: 'athlete-1', amount_cents: 9999, campaign_id: OTHER_CAMPAIGN_ID }),
    ];

    const result = computeActiveCreditsDueByBeneficiary(credits, CAMPAIGN_ID);
    const athlete1 = result.find((r) => r.beneficiaryId === 'athlete-1');
    const athlete2 = result.find((r) => r.beneficiaryId === 'athlete-2');

    expect(athlete1?.dueCents).toBe(1500);
    expect(athlete2?.dueCents).toBe(2000);
    expect(result).toHaveLength(2);
  });

  it('exclut les crédits non "active" (pending/expired/cancelled/refunded)', () => {
    const credits: OrderCreditRow[] = [
      credit({ status: 'active', amount_cents: 1000 }),
      credit({ status: 'pending', amount_cents: 5000 }),
      credit({ status: 'expired', amount_cents: 5000 }),
      credit({ status: 'cancelled', amount_cents: 5000 }),
      credit({ status: 'refunded', amount_cents: 5000 }),
    ];

    const result = computeActiveCreditsDueByBeneficiary(credits, CAMPAIGN_ID);
    expect(result).toEqual([{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', dueCents: 1000 }]);
  });

  it('retourne un tableau vide si aucun crédit actif pour cette campagne', () => {
    expect(computeActiveCreditsDueByBeneficiary([], CAMPAIGN_ID)).toEqual([]);
  });

  it('gère plusieurs types de bénéficiaires (athlète, équipe, club) indépendamment', () => {
    const credits: OrderCreditRow[] = [
      credit({ beneficiary_type: 'athlete', beneficiary_id: 'x', amount_cents: 100 }),
      credit({ beneficiary_type: 'team', beneficiary_id: 'x', amount_cents: 200 }),
      credit({ beneficiary_type: 'club', beneficiary_id: 'x', amount_cents: 300 }),
    ];
    const result = computeActiveCreditsDueByBeneficiary(credits, CAMPAIGN_ID);
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.beneficiaryType === 'athlete')?.dueCents).toBe(100);
    expect(result.find((r) => r.beneficiaryType === 'team')?.dueCents).toBe(200);
    expect(result.find((r) => r.beneficiaryType === 'club')?.dueCents).toBe(300);
  });
});

describe('computeNetPayableCents', () => {
  it('soustrait la retenue de frais du montant brut', () => {
    expect(computeNetPayableCents(payout({ amount_cents: 10000, fee_held_cents: 1500 }))).toBe(8500);
  });

  it('ne retourne jamais un montant négatif (retenue > montant brut)', () => {
    expect(computeNetPayableCents(payout({ amount_cents: 1000, fee_held_cents: 5000 }))).toBe(0);
  });

  it('retourne le montant brut si aucune retenue', () => {
    expect(computeNetPayableCents(payout({ amount_cents: 10000, fee_held_cents: 0 }))).toBe(10000);
  });
});

describe('planPayoutRecalculation', () => {
  it("insère un nouveau versement pour un bénéficiaire sans versement existant", () => {
    const plan = planPayoutRecalculation(
      [{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', dueCents: 5000 }],
      [],
    );
    expect(plan).toEqual([
      { type: 'insert', beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', amountCents: 5000 },
    ]);
  });

  it('met à jour un versement existant "calculated" si le montant dû a changé', () => {
    const plan = planPayoutRecalculation(
      [{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', dueCents: 7000 }],
      [payout({ id: 'p1', amount_cents: 5000, status: 'calculated' })],
    );
    expect(plan).toEqual([
      {
        type: 'update',
        payoutId: 'p1',
        beneficiaryType: 'athlete',
        beneficiaryId: 'athlete-1',
        amountCents: 7000,
        previousAmountCents: 5000,
      },
    ]);
  });

  it('met à jour un versement existant "in_validation" (encore ouvert au recalcul)', () => {
    const plan = planPayoutRecalculation(
      [{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', dueCents: 7000 }],
      [payout({ id: 'p1', amount_cents: 5000, status: 'in_validation' })],
    );
    expect(plan[0]).toMatchObject({ type: 'update', amountCents: 7000 });
  });

  it('ramène à 0 un versement encore ouvert dont les crédits actifs ont disparu (ex. remboursement)', () => {
    const plan = planPayoutRecalculation(
      [],
      [payout({ id: 'p1', amount_cents: 5000, status: 'calculated' })],
    );
    expect(plan).toEqual([
      {
        type: 'update',
        payoutId: 'p1',
        beneficiaryType: 'athlete',
        beneficiaryId: 'athlete-1',
        amountCents: 0,
        previousAmountCents: 5000,
      },
    ]);
  });

  it.each(['approved', 'paid', 'adjusted', 'disputed', 'closed'] as const)(
    'ignore (skip_locked) un versement déjà "%s" -- jamais modifié par un recalcul automatique',
    (status) => {
      const plan = planPayoutRecalculation(
        [{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', dueCents: 9999 }],
        [payout({ id: 'p1', amount_cents: 5000, status })],
      );
      expect(plan).toEqual([
        {
          type: 'skip_locked',
          payoutId: 'p1',
          beneficiaryType: 'athlete',
          beneficiaryId: 'athlete-1',
          status,
          computedAmountCents: 9999,
        },
      ]);
    },
  );

  it('traite plusieurs bénéficiaires indépendamment dans le même recalcul (idempotence multi-bénéficiaires)', () => {
    const plan = planPayoutRecalculation(
      [
        { beneficiaryType: 'athlete', beneficiaryId: 'a1', dueCents: 1000 },
        { beneficiaryType: 'athlete', beneficiaryId: 'a2', dueCents: 2000 },
      ],
      [payout({ id: 'p1', beneficiary_id: 'a1', amount_cents: 1000, status: 'paid' })],
    );
    expect(plan).toHaveLength(2);
    expect(plan.find((a) => a.type === 'skip_locked')).toMatchObject({ payoutId: 'p1' });
    expect(plan.find((a) => a.type === 'insert')).toMatchObject({ beneficiaryId: 'a2', amountCents: 2000 });
  });

  it('ne produit aucune action si rien à recalculer (aucun crédit, aucun versement)', () => {
    expect(planPayoutRecalculation([], [])).toEqual([]);
  });

  it('relancer le même plan deux fois de suite ne change rien (idempotence -- recalculer un état déjà à jour)', () => {
    const dueAmounts = [{ beneficiaryType: 'athlete' as const, beneficiaryId: 'athlete-1', dueCents: 5000 }];
    const existing = [payout({ id: 'p1', amount_cents: 5000, status: 'calculated' })];
    const plan = planPayoutRecalculation(dueAmounts, existing);
    // Le montant dû == le montant déjà enregistré -- on PEUT toujours décider
    // un "update" (même valeur), c'est à l'orchestration (pas au plan pur)
    // de ne pas réécrire si la valeur est identique -- voir
    // `recalculatePayoutsForCampaign` ci-dessous.
    expect(plan).toEqual([
      {
        type: 'update',
        payoutId: 'p1',
        beneficiaryType: 'athlete',
        beneficiaryId: 'athlete-1',
        amountCents: 5000,
        previousAmountCents: 5000,
      },
    ]);
  });
});

describe('recalculatePayoutsForCampaign (orchestration avec un repo simulé)', () => {
  function makeRepo(overrides: {
    campaign?: CampaignRow | null;
    credits?: OrderCreditRow[];
    payouts?: PayoutRow[];
  }): {
    repo: PayoutCalculationRepo;
    insertCalls: Array<{ beneficiaryType: string; beneficiaryId: string; amountCents: number }>;
    updateCalls: Array<{ payoutId: string; amountCents: number }>;
  } {
    const insertCalls: Array<{ beneficiaryType: string; beneficiaryId: string; amountCents: number }> = [];
    const updateCalls: Array<{ payoutId: string; amountCents: number }> = [];
    const repo: PayoutCalculationRepo = {
      async getCampaign() {
        // Attention : `overrides.campaign` peut être explicitement `null`
        // (campagne introuvable) -- ne pas utiliser `??` ici, qui traiterait
        // `null` comme "non fourni" et masquerait ce cas de test.
        return 'campaign' in overrides ? (overrides.campaign as CampaignRow | null) : ({ id: CAMPAIGN_ID, status: 'closed' } as CampaignRow);
      },
      async listActiveCreditsForCampaign() {
        return overrides.credits ?? [];
      },
      async listPayoutsForCampaign() {
        return overrides.payouts ?? [];
      },
      async insertPayout(_campaignId, beneficiaryType, beneficiaryId, amountCents) {
        insertCalls.push({ beneficiaryType, beneficiaryId, amountCents });
        return payout({ beneficiary_type: beneficiaryType, beneficiary_id: beneficiaryId, amount_cents: amountCents });
      },
      async updatePayoutAmount(payoutId, amountCents) {
        updateCalls.push({ payoutId, amountCents });
        return payout({ id: payoutId, amount_cents: amountCents });
      },
    };
    return { repo, insertCalls, updateCalls };
  }

  it('lève CampaignNotFoundError si la campagne est introuvable', async () => {
    const { repo } = makeRepo({ campaign: null });
    await expect(recalculatePayoutsForCampaign(repo, CAMPAIGN_ID)).rejects.toThrow(CampaignNotFoundError);
  });

  it.each(['draft', 'pending_approval', 'scheduled', 'active', 'ended', 'cancelled', 'archived'] as const)(
    'lève CampaignNotClosedError si le statut de la campagne est "%s"',
    async (status) => {
      const { repo } = makeRepo({ campaign: { id: CAMPAIGN_ID, status } as CampaignRow });
      await expect(recalculatePayoutsForCampaign(repo, CAMPAIGN_ID)).rejects.toThrow(CampaignNotClosedError);
    },
  );

  it.each(['closed', 'paid'] as const)('autorise le calcul pour une campagne "%s"', async (status) => {
    const { repo, insertCalls } = makeRepo({
      campaign: { id: CAMPAIGN_ID, status } as CampaignRow,
      credits: [credit({ amount_cents: 4200 })],
    });
    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(insertCalls).toEqual([{ beneficiaryType: 'athlete', beneficiaryId: 'athlete-1', amountCents: 4200 }]);
  });

  it("insère un versement pour chaque bénéficiaire avec des crédits actifs", async () => {
    const { repo, insertCalls } = makeRepo({
      credits: [
        credit({ beneficiary_id: 'a1', amount_cents: 1000 }),
        credit({ beneficiary_id: 'a2', amount_cents: 2000 }),
      ],
    });
    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(insertCalls).toHaveLength(2);
  });

  it('met à jour un versement existant ouvert si le montant dû a changé', async () => {
    const { repo, updateCalls } = makeRepo({
      credits: [credit({ beneficiary_id: 'a1', amount_cents: 8000 })],
      payouts: [payout({ id: 'p1', beneficiary_id: 'a1', amount_cents: 5000, status: 'calculated' })],
    });
    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(updateCalls).toEqual([{ payoutId: 'p1', amountCents: 8000 }]);
  });

  it("n'appelle PAS updatePayoutAmount si le montant dû n'a pas changé (idempotence -- pas d'écriture inutile)", async () => {
    const { repo, updateCalls } = makeRepo({
      credits: [credit({ beneficiary_id: 'a1', amount_cents: 5000 })],
      payouts: [payout({ id: 'p1', beneficiary_id: 'a1', amount_cents: 5000, status: 'calculated' })],
    });
    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(updateCalls).toHaveLength(0);
  });

  it("n'appelle ni insertPayout ni updatePayoutAmount pour un versement déjà validé/payé (skip_locked)", async () => {
    const { repo, insertCalls, updateCalls } = makeRepo({
      credits: [credit({ beneficiary_id: 'a1', amount_cents: 9999 })],
      payouts: [payout({ id: 'p1', beneficiary_id: 'a1', amount_cents: 5000, status: 'paid' })],
    });
    const plan = await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(plan).toEqual([
      {
        type: 'skip_locked',
        payoutId: 'p1',
        beneficiaryType: 'athlete',
        beneficiaryId: 'a1',
        status: 'paid',
        computedAmountCents: 9999,
      },
    ]);
  });

  it('un recalcul répété (idempotence de bout en bout) ne duplique aucun versement', async () => {
    let payouts: PayoutRow[] = [];
    const credits = [credit({ beneficiary_id: 'a1', amount_cents: 5000 })];
    const repo: PayoutCalculationRepo = {
      async getCampaign() {
        return { id: CAMPAIGN_ID, status: 'closed' } as CampaignRow;
      },
      async listActiveCreditsForCampaign() {
        return credits;
      },
      async listPayoutsForCampaign() {
        return payouts;
      },
      async insertPayout(_campaignId, beneficiaryType, beneficiaryId, amountCents) {
        const created = payout({
          id: `generated-${payouts.length + 1}`,
          beneficiary_type: beneficiaryType,
          beneficiary_id: beneficiaryId,
          amount_cents: amountCents,
        });
        payouts = [...payouts, created];
        return created;
      },
      async updatePayoutAmount(payoutId, amountCents) {
        payouts = payouts.map((p) => (p.id === payoutId ? { ...p, amount_cents: amountCents } : p));
        return payouts.find((p) => p.id === payoutId)!;
      },
    };

    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(payouts).toHaveLength(1);

    await recalculatePayoutsForCampaign(repo, CAMPAIGN_ID);
    expect(payouts).toHaveLength(1); // toujours un seul versement, pas un doublon.
  });
});
