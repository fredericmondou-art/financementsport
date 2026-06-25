/**
 * Tests unitaires du cycle de statut des versements (Tâche 1.5.10,
 * docs/prompts/phase-1-5.md -- « tâche financière sensible ») :
 * `lib/payouts/workflow.ts`.
 *
 * La fonction Postgres gardée `advance_payout_status` (migration 0019) et la
 * RLS associée sont couvertes par
 * `tests/integration/payout-status-transitions-rls.test.ts`. Ici, seules les
 * fonctions PURES + l'orchestration (avec un repo simulé) sont testées --
 * même convention que `tests/unit/campaigns-close.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  AdvancePayoutStatusOptions,
  InvalidPayoutStatusTransitionError,
  MissingPayoutAdjustmentAmountError,
  MissingPayoutAdjustmentReasonError,
  MissingPayoutProofError,
  PayoutWorkflowRepo,
  PayoutWorkflowRpcError,
  VALID_PAYOUT_STATUS_TRANSITIONS,
  advancePayoutStatus,
  assertValidPayoutStatusTransition,
  isPayoutOpenForRecalculation,
  isValidPayoutStatusTransition,
  payoutStatusLabelFr,
  type PayoutRow,
} from '@/lib/payouts/workflow';
import type { PayoutStatus } from '@/lib/db/types';

const ALL_STATUSES: PayoutStatus[] = [
  'calculated',
  'in_validation',
  'approved',
  'paid',
  'adjusted',
  'disputed',
  'closed',
];

function payout(overrides: Partial<PayoutRow> = {}): PayoutRow {
  return {
    id: 'payout-1',
    campaign_id: 'campaign-1',
    beneficiary_type: 'athlete',
    beneficiary_id: 'athlete-1',
    amount_cents: 5000,
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

describe('payoutStatusLabelFr', () => {
  it.each(ALL_STATUSES)('fournit un libellé français non vide pour "%s"', (status) => {
    const label = payoutStatusLabelFr(status);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('isPayoutOpenForRecalculation', () => {
  it.each(['calculated', 'in_validation'] as const)('"%s" est ouvert au recalcul automatique', (status) => {
    expect(isPayoutOpenForRecalculation(status)).toBe(true);
  });

  it.each(['approved', 'paid', 'adjusted', 'disputed', 'closed'] as const)(
    '"%s" n\'est PAS ouvert au recalcul automatique (verrouillé)',
    (status) => {
      expect(isPayoutOpenForRecalculation(status)).toBe(false);
    },
  );
});

describe('isValidPayoutStatusTransition / VALID_PAYOUT_STATUS_TRANSITIONS', () => {
  it.each(ALL_STATUSES)('le graphe définit une entrée (même vide) pour "%s"', (status) => {
    expect(VALID_PAYOUT_STATUS_TRANSITIONS[status]).toBeDefined();
    expect(Array.isArray(VALID_PAYOUT_STATUS_TRANSITIONS[status])).toBe(true);
  });

  it('"closed" est un état terminal -- aucune transition sortante', () => {
    expect(VALID_PAYOUT_STATUS_TRANSITIONS.closed).toEqual([]);
  });

  it('"paid" n\'est atteignable QUE depuis "approved" ou "adjusted" -- jamais depuis "calculated"/"in_validation" directement (règle non négociable du cahier)', () => {
    for (const status of ALL_STATUSES) {
      const canReachPaid = VALID_PAYOUT_STATUS_TRANSITIONS[status].includes('paid');
      if (status === 'approved' || status === 'adjusted') {
        expect(canReachPaid).toBe(true);
      } else {
        expect(canReachPaid).toBe(false);
      }
    }
  });

  it('"calculated" -> "approved" est valide (raccourci sans validation intermédiaire)', () => {
    expect(isValidPayoutStatusTransition('calculated', 'approved')).toBe(true);
  });

  it('"calculated" -> "paid" est INVALIDE (jamais de paiement direct sans approbation)', () => {
    expect(isValidPayoutStatusTransition('calculated', 'paid')).toBe(false);
  });

  it('"closed" -> n\'importe quoi est INVALIDE (état terminal)', () => {
    for (const next of ALL_STATUSES) {
      expect(isValidPayoutStatusTransition('closed', next)).toBe(false);
    }
  });

  it('toute transition vers soi-même est INVALIDE (pas de no-op listé)', () => {
    for (const status of ALL_STATUSES) {
      expect(isValidPayoutStatusTransition(status, status)).toBe(false);
    }
  });

  it("chaque statut non terminal a au moins une transition sortante vers 'disputed' ou 'closed' (aucun statut n'est un cul-de-sac non voulu)", () => {
    for (const status of ALL_STATUSES) {
      if (status === 'closed') continue;
      const transitions = VALID_PAYOUT_STATUS_TRANSITIONS[status];
      expect(transitions.length).toBeGreaterThan(0);
    }
  });
});

describe('assertValidPayoutStatusTransition', () => {
  it('ne lève rien pour une transition valide sans contrainte additionnelle', () => {
    expect(() => assertValidPayoutStatusTransition('calculated', 'approved', {}, null)).not.toThrow();
  });

  it('lève InvalidPayoutStatusTransitionError pour une transition absente du graphe', () => {
    expect(() => assertValidPayoutStatusTransition('calculated', 'paid', {}, null)).toThrow(
      InvalidPayoutStatusTransitionError,
    );
  });

  it("l'erreur de transition invalide porte le statut courant et le statut tenté", () => {
    try {
      assertValidPayoutStatusTransition('calculated', 'paid', {}, null);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPayoutStatusTransitionError);
      expect((error as InvalidPayoutStatusTransitionError).currentStatus).toBe('calculated');
      expect((error as InvalidPayoutStatusTransitionError).attemptedStatus).toBe('paid');
    }
  });

  describe('transition vers "paid" -- preuve de paiement obligatoire', () => {
    it('lève MissingPayoutProofError si aucune preuve (ni fournie, ni déjà présente)', () => {
      expect(() => assertValidPayoutStatusTransition('approved', 'paid', {}, null)).toThrow(MissingPayoutProofError);
    });

    it('lève MissingPayoutProofError si la preuve fournie est une chaîne vide', () => {
      expect(() => assertValidPayoutStatusTransition('approved', 'paid', { proofUrl: '   ' }, null)).toThrow(
        MissingPayoutProofError,
      );
    });

    it('accepte une preuve fournie dans les options', () => {
      expect(() =>
        assertValidPayoutStatusTransition('approved', 'paid', { proofUrl: 'https://exemple.test/recu.pdf' }, null),
      ).not.toThrow();
    });

    it('accepte une preuve déjà présente sur la ligne (existingProofUrl), sans la refournir', () => {
      expect(() =>
        assertValidPayoutStatusTransition('approved', 'paid', {}, 'https://exemple.test/recu-existant.pdf'),
      ).not.toThrow();
    });

    it('"adjusted" -> "paid" exige aussi la preuve (même règle, peu importe le statut de départ)', () => {
      expect(() => assertValidPayoutStatusTransition('adjusted', 'paid', {}, null)).toThrow(MissingPayoutProofError);
    });
  });

  describe('transition vers "adjusted" -- montant ET raison obligatoires', () => {
    it('lève MissingPayoutAdjustmentAmountError si newAmountCents est absent', () => {
      expect(() => assertValidPayoutStatusTransition('approved', 'adjusted', { note: 'Erreur de saisie' }, null)).toThrow(
        MissingPayoutAdjustmentAmountError,
      );
    });

    it('lève MissingPayoutAdjustmentAmountError si newAmountCents est négatif', () => {
      expect(() =>
        assertValidPayoutStatusTransition('approved', 'adjusted', { newAmountCents: -1, note: 'x' }, null),
      ).toThrow(MissingPayoutAdjustmentAmountError);
    });

    it('accepte newAmountCents = 0 (montant nul valide, ex. crédits totalement remboursés)', () => {
      expect(() =>
        assertValidPayoutStatusTransition('approved', 'adjusted', { newAmountCents: 0, note: 'Remboursement total' }, null),
      ).not.toThrow();
    });

    it('lève MissingPayoutAdjustmentReasonError si la note est absente (mais montant fourni)', () => {
      expect(() => assertValidPayoutStatusTransition('approved', 'adjusted', { newAmountCents: 1000 }, null)).toThrow(
        MissingPayoutAdjustmentReasonError,
      );
    });

    it('lève MissingPayoutAdjustmentReasonError si la note est une chaîne vide', () => {
      expect(() =>
        assertValidPayoutStatusTransition('approved', 'adjusted', { newAmountCents: 1000, note: '   ' }, null),
      ).toThrow(MissingPayoutAdjustmentReasonError);
    });

    it('accepte un ajustement complet (montant + raison)', () => {
      expect(() =>
        assertValidPayoutStatusTransition(
          'approved',
          'adjusted',
          { newAmountCents: 4200, note: 'Correction après remboursement partiel' },
          null,
        ),
      ).not.toThrow();
    });
  });

  it('une transition simple (ex. "calculated" -> "in_validation") ne requiert ni preuve ni raison', () => {
    expect(() => assertValidPayoutStatusTransition('calculated', 'in_validation', {}, null)).not.toThrow();
  });
});

describe('advancePayoutStatus (orchestration avec un repo simulé)', () => {
  function makeRepo(): { repo: PayoutWorkflowRepo; calls: Array<{ payoutId: string; nextStatus: PayoutStatus; options: AdvancePayoutStatusOptions }> } {
    const calls: Array<{ payoutId: string; nextStatus: PayoutStatus; options: AdvancePayoutStatusOptions }> = [];
    const repo: PayoutWorkflowRepo = {
      async advanceStatus(payoutId, nextStatus, options) {
        calls.push({ payoutId, nextStatus, options });
        return payout({ id: payoutId, status: nextStatus });
      },
    };
    return { repo, calls };
  }

  it("n'appelle PAS le repo si la validation côté TypeScript échoue (transition invalide)", async () => {
    const { repo, calls } = makeRepo();
    await expect(advancePayoutStatus(repo, 'calculated', null, 'p1', 'paid')).rejects.toThrow(
      InvalidPayoutStatusTransitionError,
    );
    expect(calls).toHaveLength(0);
  });

  it("n'appelle PAS le repo si la preuve manque pour 'paid'", async () => {
    const { repo, calls } = makeRepo();
    await expect(advancePayoutStatus(repo, 'approved', null, 'p1', 'paid')).rejects.toThrow(MissingPayoutProofError);
    expect(calls).toHaveLength(0);
  });

  it('appelle le repo avec les bons arguments pour une transition valide', async () => {
    const { repo, calls } = makeRepo();
    await advancePayoutStatus(repo, 'calculated', null, 'p1', 'approved', { note: 'Validé par l’admin' });
    expect(calls).toEqual([{ payoutId: 'p1', nextStatus: 'approved', options: { note: 'Validé par l’admin' } }]);
  });

  it('retourne la ligne mise à jour renvoyée par le repo', async () => {
    const { repo } = makeRepo();
    const result = await advancePayoutStatus(repo, 'approved', 'https://exemple.test/preuve.pdf', 'p1', 'paid');
    expect(result.status).toBe('paid');
    expect(result.id).toBe('p1');
  });

  it('propage PayoutWorkflowRpcError si le repo (la fonction Postgres) refuse la transition côté serveur', async () => {
    const repo: PayoutWorkflowRepo = {
      async advanceStatus() {
        throw new PayoutWorkflowRpcError("refusé : rôle non autorisé à modifier ce versement");
      },
    };
    await expect(advancePayoutStatus(repo, 'calculated', null, 'p1', 'approved')).rejects.toThrow(
      PayoutWorkflowRpcError,
    );
  });

  it('le cycle complet "calculated" -> "approved" -> "paid" passe la validation TypeScript à chaque étape', async () => {
    const { repo, calls } = makeRepo();
    await advancePayoutStatus(repo, 'calculated', null, 'p1', 'approved');
    await advancePayoutStatus(repo, 'approved', null, 'p1', 'paid', { proofUrl: 'https://exemple.test/recu.pdf' });
    expect(calls.map((c) => c.nextStatus)).toEqual(['approved', 'paid']);
  });
});
