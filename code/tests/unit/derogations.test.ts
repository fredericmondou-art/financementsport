/**
 * Tests unitaires du mécanisme de dérogation admin (P.7,
 * SPEC-PARAMETRES-PLATEFORME.md §2/§4/§6) : `lib/derogations/derogations.ts`.
 * `DerogationsRepo` entièrement simulé (pas de DB) — voir
 * `tests/integration/platform-parameters-rls.test.ts` pour la couverture RLS
 * réelle (migration 0027).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  createDerogation,
  isCleDerogeable,
  resolveEffectiveLimit,
  CLES_DEROGEABLES,
  ENTITES_VALIDES_PAR_CLE,
  type DerogationRow,
  type DerogationsRepo,
} from '@/lib/derogations/derogations';
import type { AuthUser } from '@/lib/auth/permissions';
import { BusinessRuleError, PermissionError } from '@/lib/entities/errors';

function platformAdmin(): AuthUser {
  return { id: randomUUID(), role: 'platform_admin', memberships: [] };
}

function teamManager(): AuthUser {
  return { id: randomUUID(), role: 'team_manager', memberships: [{ role: 'team_manager', teamId: randomUUID(), clubId: null }] };
}

function fakeRow(overrides: Partial<DerogationRow> = {}): DerogationRow {
  return {
    id: randomUUID(),
    cleParametre: 'campagne_athletes_max',
    entiteType: 'equipe',
    entiteId: randomUUID(),
    valeurAppliquee: 45,
    justification: 'Grand club, dérogation ponctuelle',
    adminId: randomUUID(),
    creeLe: new Date().toISOString(),
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<DerogationsRepo> = {}): DerogationsRepo {
  return {
    findActive: async () => null,
    create: async (row) => fakeRow({ ...row }),
    listRecent: async () => [],
    ...overrides,
  };
}

describe('isCleDerogeable', () => {
  it('accepte exactement les 5 clés R1/R3/R4/R5/R7', () => {
    expect(CLES_DEROGEABLES).toEqual([
      'campagne_duree_jours',
      'campagne_athletes_max',
      'campagne_commandes_max',
      'campagne_produits_max',
      'equipe_campagnes_par_an_max',
    ]);
    for (const cle of CLES_DEROGEABLES) {
      expect(isCleDerogeable(cle)).toBe(true);
    }
  });

  it('rejette R2 (campagne_delai_livraison_jours_max) -- obligation légale, spec §4', () => {
    expect(isCleDerogeable('campagne_delai_livraison_jours_max')).toBe(false);
    expect(isCleDerogeable('campagne_date_livraison_obligatoire')).toBe(false);
  });

  it('rejette R8 (athlete_credit_annuel_max) -- mécanisme distinct (libération manuelle)', () => {
    expect(isCleDerogeable('athlete_credit_annuel_max')).toBe(false);
  });

  it('rejette une clé totalement inconnue', () => {
    expect(isCleDerogeable('n_importe_quoi')).toBe(false);
  });
});

describe('ENTITES_VALIDES_PAR_CLE', () => {
  it('campagne_commandes_max (R4) ne se déroge que par campagne -- déjà existante au paiement', () => {
    expect(ENTITES_VALIDES_PAR_CLE.campagne_commandes_max).toEqual(['campagne']);
  });

  it('equipe_campagnes_par_an_max (R7) ne se déroge que par équipe -- aucune variante club', () => {
    expect(ENTITES_VALIDES_PAR_CLE.equipe_campagnes_par_an_max).toEqual(['equipe']);
  });

  it('campagne_duree_jours/campagne_athletes_max/campagne_produits_max (R1/R3/R5) se dérogent par équipe OU club -- validées avant que la campagne existe', () => {
    expect(ENTITES_VALIDES_PAR_CLE.campagne_duree_jours).toEqual(['equipe', 'club']);
    expect(ENTITES_VALIDES_PAR_CLE.campagne_athletes_max).toEqual(['equipe', 'club']);
    expect(ENTITES_VALIDES_PAR_CLE.campagne_produits_max).toEqual(['equipe', 'club']);
  });
});

describe('resolveEffectiveLimit', () => {
  it('retourne la limite de base si aucune dérogation', () => {
    expect(resolveEffectiveLimit(30, null)).toBe(30);
  });

  it('retourne la valeur de la dérogation si présente et valide', () => {
    expect(resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: 45 }))).toBe(45);
  });

  it('retombe sur la limite de base si valeur_appliquee est corrompue (pas un entier positif) -- défense en profondeur', () => {
    expect(resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: -5 }))).toBe(30);
    expect(resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: 'abc' }))).toBe(30);
    expect(resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: null }))).toBe(30);
    expect(resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: 12.5 }))).toBe(30);
  });

  it('ne lève jamais d’exception, quelle que soit la corruption de la donnée', () => {
    expect(() => resolveEffectiveLimit(30, fakeRow({ valeurAppliquee: { foo: 'bar' } }))).not.toThrow();
  });
});

describe('createDerogation', () => {
  it('refuse tout rôle autre que platform_admin', async () => {
    await expect(
      createDerogation(
        teamManager(),
        {
          cleParametre: 'campagne_athletes_max',
          entiteType: 'equipe',
          entiteId: randomUUID(),
          valeurAppliquee: 45,
          justification: 'Grande équipe, dérogation ponctuelle',
        },
        fakeRepo(),
      ),
    ).rejects.toThrow(PermissionError);
  });

  it('refuse R2 (aucune dérogation possible, obligation légale)', async () => {
    await expect(
      createDerogation(
        platformAdmin(),
        {
          cleParametre: 'campagne_delai_livraison_jours_max',
          entiteType: 'campagne',
          entiteId: randomUUID(),
          valeurAppliquee: 30,
          justification: 'Tentative de dérogation R2',
        },
        fakeRepo(),
      ),
    ).rejects.toThrow(ZodError);
  });

  it('refuse R8 (mécanisme distinct, pas géré ici)', async () => {
    await expect(
      createDerogation(
        platformAdmin(),
        {
          cleParametre: 'athlete_credit_annuel_max',
          entiteType: 'athlete',
          entiteId: randomUUID(),
          valeurAppliquee: 300000,
          justification: 'Tentative de dérogation R8 via ce mécanisme',
        },
        fakeRepo(),
      ),
    ).rejects.toThrow(ZodError);
  });

  it('refuse une justification trop courte (< 10 caractères)', async () => {
    await expect(
      createDerogation(
        platformAdmin(),
        {
          cleParametre: 'campagne_athletes_max',
          entiteType: 'equipe',
          entiteId: randomUUID(),
          valeurAppliquee: 45,
          justification: 'trop bref', // 9 caractères, sous le minimum de 10
        },
        fakeRepo(),
      ),
    ).rejects.toThrow(ZodError);
  });

  it('refuse une valeur non entière ou non positive', async () => {
    const base = {
      cleParametre: 'campagne_athletes_max' as const,
      entiteType: 'equipe' as const,
      entiteId: randomUUID(),
      justification: 'Justification suffisamment longue pour passer',
    };
    await expect(createDerogation(platformAdmin(), { ...base, valeurAppliquee: 0 }, fakeRepo())).rejects.toThrow(
      ZodError,
    );
    await expect(createDerogation(platformAdmin(), { ...base, valeurAppliquee: -1 }, fakeRepo())).rejects.toThrow(
      ZodError,
    );
    await expect(createDerogation(platformAdmin(), { ...base, valeurAppliquee: 4.5 }, fakeRepo())).rejects.toThrow(
      ZodError,
    );
  });

  it("refuse une portée entite_type incompatible avec la clé (ex. campagne_commandes_max par 'equipe', pas 'campagne')", async () => {
    await expect(
      createDerogation(
        platformAdmin(),
        {
          cleParametre: 'campagne_commandes_max',
          entiteType: 'equipe',
          entiteId: randomUUID(),
          valeurAppliquee: 300,
          justification: 'Portée incorrecte pour cette clé',
        },
        fakeRepo(),
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('accepte une dérogation valide et la transmet au repo avec admin_id = id de l’admin', async () => {
    const admin = platformAdmin();
    const entiteId = randomUUID();
    let received: Parameters<DerogationsRepo['create']>[0] | null = null;
    const repo = fakeRepo({
      create: async (row) => {
        received = row;
        return fakeRow({ ...row });
      },
    });

    const result = await createDerogation(
      admin,
      {
        cleParametre: 'campagne_duree_jours',
        entiteType: 'club',
        entiteId,
        valeurAppliquee: 45,
        justification: 'Campagne club annuelle, exemple spec R1',
      },
      repo,
    );

    expect(received).toEqual({
      cleParametre: 'campagne_duree_jours',
      entiteType: 'club',
      entiteId,
      valeurAppliquee: 45,
      justification: 'Campagne club annuelle, exemple spec R1',
      adminId: admin.id,
    });
    expect(result.valeurAppliquee).toBe(45);
  });
});
