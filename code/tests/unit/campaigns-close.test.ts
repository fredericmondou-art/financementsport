/**
 * Tests unitaires de la logique de clôture/réouverture de campagne (Tâche
 * 1.5.8, docs/prompts/phase-1-5.md) : `lib/campaigns/close.ts`.
 *
 * Le repo Supabase réel (`createSupabaseCampaignClosureRepo`) n'est
 * volontairement PAS exercé ici -- fine couche RPC, pas de logique métier
 * (même convention que `tests/unit/orders-status.test.ts`). Seules les
 * fonctions PURES sont testées ici ; l'autorisation/la traçabilité réelles
 * sont couvertes par `tests/integration/campaign-closure-rls.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  assertValidCampaignClosure,
  assertValidCampaignReopening,
  campaignStatusLabelFr,
  closeCampaign,
  CampaignClosureRpcError,
  InvalidCampaignClosureError,
  InvalidCampaignReopeningError,
  isValidCampaignClosure,
  isValidCampaignReopening,
  MissingReopenReasonError,
  reopenCampaign,
  type CampaignClosureRepo,
  type CampaignRow,
} from '@/lib/campaigns/close';
import type { CampaignStatus } from '@/lib/db/types';

const ALL_STATUSES: CampaignStatus[] = [
  'draft',
  'pending_approval',
  'scheduled',
  'active',
  'ended',
  'closed',
  'paid',
  'cancelled',
  'archived',
];

describe('isValidCampaignClosure / assertValidCampaignClosure', () => {
  it('seule "active" permet la clôture', () => {
    for (const status of ALL_STATUSES) {
      expect(isValidCampaignClosure(status)).toBe(status === 'active');
    }
  });

  it('ne lève rien pour "active"', () => {
    expect(() => assertValidCampaignClosure('active')).not.toThrow();
  });

  it.each(ALL_STATUSES.filter((s) => s !== 'active'))(
    'lève InvalidCampaignClosureError pour "%s"',
    (status) => {
      expect(() => assertValidCampaignClosure(status)).toThrow(InvalidCampaignClosureError);
    },
  );

  it('le message nomme le statut courant (en français)', () => {
    try {
      assertValidCampaignClosure('draft');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCampaignClosureError);
      expect((error as InvalidCampaignClosureError).currentStatus).toBe('draft');
      expect((error as Error).message).toContain('Brouillon');
    }
  });
});

describe('isValidCampaignReopening / assertValidCampaignReopening', () => {
  it('seule "closed" permet la réouverture', () => {
    for (const status of ALL_STATUSES) {
      expect(isValidCampaignReopening(status)).toBe(status === 'closed');
    }
  });

  it('ne lève rien pour "closed" avec une raison non vide', () => {
    expect(() => assertValidCampaignReopening('closed', 'Erreur de manipulation.')).not.toThrow();
  });

  it.each(ALL_STATUSES.filter((s) => s !== 'closed'))(
    'lève InvalidCampaignReopeningError pour "%s", même avec une raison',
    (status) => {
      expect(() => assertValidCampaignReopening(status, 'Une raison.')).toThrow(InvalidCampaignReopeningError);
    },
  );

  it('lève MissingReopenReasonError si la raison est vide (statut sinon valide)', () => {
    expect(() => assertValidCampaignReopening('closed', '')).toThrow(MissingReopenReasonError);
  });

  it('lève MissingReopenReasonError si la raison ne contient que des espaces', () => {
    expect(() => assertValidCampaignReopening('closed', '   ')).toThrow(MissingReopenReasonError);
  });

  it('un statut invalide est signalé avant une raison vide (statut prioritaire)', () => {
    expect(() => assertValidCampaignReopening('active', '')).toThrow(InvalidCampaignReopeningError);
  });
});

describe('campaignStatusLabelFr', () => {
  it('fournit un libellé français pour chacun des 9 statuts', () => {
    expect(ALL_STATUSES).toHaveLength(9);
    for (const status of ALL_STATUSES) {
      expect(campaignStatusLabelFr(status)).toBeTruthy();
    }
  });
});

describe('closeCampaign (orchestration avec un repo simulé)', () => {
  function makeFakeRepo(): {
    repo: CampaignClosureRepo;
    closeCalls: string[];
    reopenCalls: Array<{ campaignId: string; reason: string }>;
  } {
    const closeCalls: string[] = [];
    const reopenCalls: Array<{ campaignId: string; reason: string }> = [];
    const repo: CampaignClosureRepo = {
      async closeCampaign(campaignId) {
        closeCalls.push(campaignId);
        return { id: campaignId, status: 'closed' } as CampaignRow;
      },
      async reopenCampaign(campaignId, reason) {
        reopenCalls.push({ campaignId, reason });
        return { id: campaignId, status: 'active' } as CampaignRow;
      },
    };
    return { repo, closeCalls, reopenCalls };
  }

  it('valide le statut CÔTÉ TYPESCRIPT avant d\'appeler le repo (pas d\'aller-retour réseau pour un cas évidemment invalide)', async () => {
    const { repo, closeCalls } = makeFakeRepo();
    await expect(closeCampaign(repo, 'draft', 'campaign-1')).rejects.toThrow(InvalidCampaignClosureError);
    expect(closeCalls).toHaveLength(0);
  });

  it('appelle le repo (donc la fonction Postgres gardée) pour une campagne active', async () => {
    const { repo, closeCalls } = makeFakeRepo();
    const result = await closeCampaign(repo, 'active', 'campaign-1');
    expect(closeCalls).toEqual(['campaign-1']);
    expect(result.status).toBe('closed');
  });

  it('propage CampaignClosureRpcError si le repo échoue (ex. commande en attente de paiement)', async () => {
    const repo: CampaignClosureRepo = {
      async closeCampaign() {
        throw new CampaignClosureRpcError('1 commande(s) en attente de confirmation de paiement.');
      },
      async reopenCampaign() {
        throw new Error('non utilisé');
      },
    };
    await expect(closeCampaign(repo, 'active', 'campaign-1')).rejects.toThrow(CampaignClosureRpcError);
  });
});

describe('reopenCampaign (orchestration avec un repo simulé)', () => {
  function makeFakeRepo(): {
    repo: CampaignClosureRepo;
    reopenCalls: Array<{ campaignId: string; reason: string }>;
  } {
    const reopenCalls: Array<{ campaignId: string; reason: string }> = [];
    const repo: CampaignClosureRepo = {
      async closeCampaign() {
        throw new Error('non utilisé');
      },
      async reopenCampaign(campaignId, reason) {
        reopenCalls.push({ campaignId, reason });
        return { id: campaignId, status: 'active' } as CampaignRow;
      },
    };
    return { repo, reopenCalls };
  }

  it('valide le statut ET la raison CÔTÉ TYPESCRIPT avant d\'appeler le repo', async () => {
    const { repo, reopenCalls } = makeFakeRepo();
    await expect(reopenCampaign(repo, 'closed', 'campaign-1', '')).rejects.toThrow(MissingReopenReasonError);
    expect(reopenCalls).toHaveLength(0);
  });

  it('appelle le repo avec la raison pour une campagne clôturée', async () => {
    const { repo, reopenCalls } = makeFakeRepo();
    const result = await reopenCampaign(repo, 'closed', 'campaign-1', 'Erreur de manipulation.');
    expect(reopenCalls).toEqual([{ campaignId: 'campaign-1', reason: 'Erreur de manipulation.' }]);
    expect(result.status).toBe('active');
  });
});
