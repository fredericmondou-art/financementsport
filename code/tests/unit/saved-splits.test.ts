/**
 * Tests unitaires des répartitions favorites (Tâche 1.5.3,
 * docs/prompts/phase-1-5.md) : `lib/cart/saved-splits.ts`.
 *
 * Le repo Supabase réel (`createSupabaseSavedSplitsRepo`) n'est volontairement
 * PAS exercé ici -- fine couche d'accès aux données, pas de logique métier
 * (même convention que `tests/unit/campaign-draft.test.ts`, en-tête de
 * fichier : « CampaignDraftRepo n'est pas exercé... pas de logique métier à
 * tester unitairement »). Un repo en mémoire (`createInMemoryRepo` ci-dessous)
 * et un client Supabase factice (`createFakeSupabase`) suffisent à exercer
 * toute la logique pure : validation (somme = 10000, réutilisée de la Tâche
 * 1.4, jamais dupliquée), détection des bénéficiaires inactifs, et le flux
 * complet "enregistrer puis recharger" (critère d'acceptation : un client
 * enregistre une répartition 50/50 puis la réapplique à un nouveau panier).
 *
 * L'isolation RLS entre deux clients (critère d'acceptation : « un client ne
 * peut pas voir la répartition d'un autre ») est couverte séparément par
 * tests/integration/saved-splits-rls.test.ts, contre un vrai Postgres
 * embarqué -- pas reproductible avec un repo en mémoire qui ignore RLS par
 * construction.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import {
  findInactiveItems,
  listSavedSplitsForUser,
  saveSplitAsNamed,
  deleteSavedSplit,
  type SavedSplitsRepo,
  type SavedSplitRow,
  type SavedSplitItemRow,
} from '@/lib/cart/saved-splits';
import type { BeneficiarySplitInput } from '@/lib/cart/beneficiaries';
import { BusinessRuleError, NotFoundError } from '@/lib/entities/errors';

const USER_A = randomUUID();
const USER_B = randomUUID();
const ATHLETE_ALICE = randomUUID();
const ATHLETE_BOB = randomUUID();

/** Repo en mémoire -- même contrat que `SavedSplitsRepo`, isolé par `userId`
 * comme le ferait RLS, pour exercer la logique pure de saved-splits.ts sans
 * DB réelle. */
function createInMemoryRepo(): SavedSplitsRepo {
  const splits = new Map<string, SavedSplitRow>();
  const itemsBySplitId = new Map<string, SavedSplitItemRow[]>();
  let seq = 0;

  return {
    async listByUser(userId) {
      return [...splits.values()].filter((s) => s.user_id === userId);
    },
    async listItems(savedSplitIds) {
      return savedSplitIds.flatMap((id) => itemsBySplitId.get(id) ?? []);
    },
    async getByUserAndId(userId, savedSplitId) {
      const found = splits.get(savedSplitId);
      return found && found.user_id === userId ? found : null;
    },
    async create(userId: string, name: string, items: BeneficiarySplitInput) {
      seq += 1;
      const id = `split-${seq}`;
      const now = new Date().toISOString();
      const row: SavedSplitRow = { id, user_id: userId, name, created_at: now, updated_at: now };
      splits.set(id, row);
      itemsBySplitId.set(
        id,
        items.map((item, index) => ({
          id: `item-${seq}-${index}`,
          saved_split_id: id,
          beneficiary_type: item.beneficiaryType,
          beneficiary_id: item.beneficiaryId,
          campaign_id: item.campaignId ?? null,
          share_bps: item.shareBps,
        })),
      );
      return row;
    },
    async remove(userId, savedSplitId) {
      const found = splits.get(savedSplitId);
      if (found && found.user_id === userId) {
        splits.delete(savedSplitId);
        itemsBySplitId.delete(savedSplitId);
      }
    },
  };
}

/** Client Supabase factice -- couvre uniquement le motif
 * `.from(table).select(cols).in('id', ids)` utilisé par
 * `loadBeneficiaryLabels`/`loadBeneficiaryActiveStatus`
 * (lib/cart/beneficiary-labels.ts). */
function createFakeSupabase(seed: {
  athletes?: Array<{ id: string; first_name: string; last_name: string; hide_last_name: boolean; is_active: boolean }>;
  teams?: Array<{ id: string; name: string; is_active: boolean }>;
  clubs?: Array<{ id: string; name: string; is_active: boolean }>;
}): SupabaseClient {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    athletes: seed.athletes ?? [],
    teams: seed.teams ?? [],
    clubs: seed.clubs ?? [],
  };
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            in(_column: string, ids: string[]) {
              const rows = (tables[table] ?? []).filter((row) => ids.includes(row.id as string));
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('saveSplitAsNamed — réutilise assertSplitTotals10000 / beneficiarySplitInputSchema (Tâche 1.4)', () => {
  it('enregistre une répartition valide totalisant 10000 bps', async () => {
    const repo = createInMemoryRepo();
    const saved = await saveSplitAsNamed(
      USER_A,
      {
        name: 'Thomas et Emma',
        items: [
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 5000 },
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_BOB, shareBps: 5000 },
        ],
      },
      repo,
    );
    expect(saved.name).toBe('Thomas et Emma');
    expect(saved.user_id).toBe(USER_A);
  });

  it('lève BusinessRuleError quand la somme des parts n’est pas 10000 (validation 1.4 réutilisée, pas dupliquée)', async () => {
    const repo = createInMemoryRepo();
    await expect(
      saveSplitAsNamed(
        USER_A,
        {
          name: 'Répartition invalide',
          items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 6000 }],
        },
        repo,
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejette un nom vide', async () => {
    const repo = createInMemoryRepo();
    await expect(
      saveSplitAsNamed(
        USER_A,
        { name: '', items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 10000 }] },
        repo,
      ),
    ).rejects.toThrow(ZodError);
  });

  it('rejette un tableau de bénéficiaires vide (beneficiarySplitInputSchema réutilisé)', async () => {
    const repo = createInMemoryRepo();
    await expect(saveSplitAsNamed(USER_A, { name: 'Vide', items: [] }, repo)).rejects.toThrow(ZodError);
  });
});

describe('deleteSavedSplit — propriété vérifiée explicitement (défense en profondeur en plus de RLS)', () => {
  it('lève NotFoundError si la répartition n’existe pas ou n’appartient pas à userId', async () => {
    const repo = createInMemoryRepo();
    const saved = await saveSplitAsNamed(
      USER_A,
      { name: '50/50', items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 10000 }] },
      repo,
    );

    await expect(deleteSavedSplit(USER_B, saved.id, repo)).rejects.toThrow(NotFoundError);
    // La répartition de USER_A n'a pas été affectée par la tentative de USER_B.
    expect(await repo.getByUserAndId(USER_A, saved.id)).not.toBeNull();
  });

  it('supprime la répartition quand elle appartient bien à userId', async () => {
    const repo = createInMemoryRepo();
    const saved = await saveSplitAsNamed(
      USER_A,
      { name: '50/50', items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 10000 }] },
      repo,
    );

    await deleteSavedSplit(USER_A, saved.id, repo);
    expect(await repo.getByUserAndId(USER_A, saved.id)).toBeNull();
  });
});

describe('listSavedSplitsForUser — enrichissement libellé + statut actif', () => {
  it('retourne un tableau vide quand le client n’a aucune répartition favorite', async () => {
    const repo = createInMemoryRepo();
    const supabase = createFakeSupabase({});
    expect(await listSavedSplitsForUser(USER_A, repo, supabase)).toEqual([]);
  });

  /** Critère d'acceptation (docs/prompts/phase-1-5.md) : « le client enregistre
   * une répartition 50/50 puis la réapplique à un nouveau panier » -- ce test
   * couvre le cycle complet enregistrement -> relecture, prêt pour
   * réapplication (la réapplication elle-même est un remplacement d'état
   * purement client, voir tests/unit/beneficiary-split.test.tsx). */
  it('un client enregistre une répartition 50/50 puis la retrouve intacte au rechargement', async () => {
    const repo = createInMemoryRepo();
    const supabase = createFakeSupabase({
      athletes: [
        { id: ATHLETE_ALICE, first_name: 'Alice', last_name: 'Tremblay', hide_last_name: false, is_active: true },
        { id: ATHLETE_BOB, first_name: 'Bob', last_name: 'Gagnon', hide_last_name: false, is_active: true },
      ],
    });

    await saveSplitAsNamed(
      USER_A,
      {
        name: '50/50',
        items: [
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 5000 },
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_BOB, shareBps: 5000 },
        ],
      },
      repo,
    );

    const result = await listSavedSplitsForUser(USER_A, repo, supabase);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('50/50');
    expect(result[0]?.items).toEqual([
      {
        beneficiaryType: 'athlete',
        beneficiaryId: ATHLETE_ALICE,
        campaignId: null,
        shareBps: 5000,
        label: 'Alice Tremblay',
        isActive: true,
      },
      {
        beneficiaryType: 'athlete',
        beneficiaryId: ATHLETE_BOB,
        campaignId: null,
        shareBps: 5000,
        label: 'Bob Gagnon',
        isActive: true,
      },
    ]);
  });

  /** Critère d'acceptation : « une répartition référençant un bénéficiaire
   * désormais inactif est signalée à l'application » -- jamais bloquée,
   * jamais masquée silencieusement. */
  it('marque un bénéficiaire devenu inactif (is_active = false)', async () => {
    const repo = createInMemoryRepo();
    const supabase = createFakeSupabase({
      athletes: [
        { id: ATHLETE_ALICE, first_name: 'Alice', last_name: 'Tremblay', hide_last_name: false, is_active: true },
        { id: ATHLETE_BOB, first_name: 'Bob', last_name: 'Gagnon', hide_last_name: false, is_active: false },
      ],
    });

    await saveSplitAsNamed(
      USER_A,
      {
        name: 'Avec inactif',
        items: [
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 5000 },
          { beneficiaryType: 'athlete', beneficiaryId: ATHLETE_BOB, shareBps: 5000 },
        ],
      },
      repo,
    );

    const [savedSplit] = await listSavedSplitsForUser(USER_A, repo, supabase);
    expect(savedSplit?.items.find((item) => item.beneficiaryId === ATHLETE_ALICE)?.isActive).toBe(true);
    expect(savedSplit?.items.find((item) => item.beneficiaryId === ATHLETE_BOB)?.isActive).toBe(false);

    expect(findInactiveItems(savedSplit!)).toHaveLength(1);
    expect(findInactiveItems(savedSplit!)[0]?.beneficiaryId).toBe(ATHLETE_BOB);
  });

  /** Un bénéficiaire complètement SUPPRIMÉ (absent de la table, pas seulement
   * `is_active = false`) doit être traité comme inactif, jamais comme une
   * absence de donnée ignorée silencieusement -- voir le commentaire de
   * `loadBeneficiaryActiveStatus` (lib/cart/beneficiary-labels.ts). */
  it('traite un bénéficiaire supprimé (absent de la table) comme inactif', async () => {
    const repo = createInMemoryRepo();
    const supabase = createFakeSupabase({ athletes: [] });

    await saveSplitAsNamed(
      USER_A,
      { name: 'Bénéficiaire supprimé', items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 10000 }] },
      repo,
    );

    const [savedSplit] = await listSavedSplitsForUser(USER_A, repo, supabase);
    expect(savedSplit?.items[0]?.isActive).toBe(false);
    expect(savedSplit?.items[0]?.label).toBe('Bénéficiaire introuvable');
  });

  it('ne mélange jamais les répartitions de deux clients différents (isolation applicative en plus de RLS)', async () => {
    const repo = createInMemoryRepo();
    const supabase = createFakeSupabase({
      athletes: [{ id: ATHLETE_ALICE, first_name: 'Alice', last_name: 'Tremblay', hide_last_name: false, is_active: true }],
    });

    await saveSplitAsNamed(
      USER_A,
      { name: 'Répartition de A', items: [{ beneficiaryType: 'athlete', beneficiaryId: ATHLETE_ALICE, shareBps: 10000 }] },
      repo,
    );

    const resultForB = await listSavedSplitsForUser(USER_B, repo, supabase);
    expect(resultForB).toEqual([]);
  });
});
