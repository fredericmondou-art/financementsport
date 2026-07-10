/**
 * Tests unitaires de l'assistant de création de campagne (Tâche 1.7 + P.3) :
 * `createCampaign` (logique métier pure + permissions + règles R1/R2/R3/R5/R7
 * de SPEC-PARAMETRES-PLATEFORME.md), avec un `CampaignRepo` entièrement
 * simulé (pas de DB) — voir `tests/integration/create-campaign.test.ts` pour
 * le flux complet contre une vraie transaction Postgres
 * (`create_campaign_with_details`, migrations 0008 + 0024).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  createCampaign,
  SELF_SERVICE_FLAT_CENTS_CAP,
  SELF_SERVICE_PERCENT_BPS_CAP,
  type CampaignRepo,
  type CreatedCampaignResult,
} from '@/lib/campaigns/create-campaign';
import type { AuthUser } from '@/lib/auth/permissions';
import { BusinessRuleError, PermissionError } from '@/lib/entities/errors';
import { PARAMETRES_DEFAUT } from '@/lib/parametres';

const TEAM_ID = randomUUID();
const CLUB_ID = randomUUID();
const OTHER_TEAM_ID = randomUUID();
const ATHLETE_OTHER_TEAM_ID = randomUUID();
const INACTIVE_PRODUCT_ID = randomUUID();

// Bassins d'ids connus, assez grands pour tester les bornes R3 (30 par
// défaut) et R5 (6 par défaut) sans dépendre de la valeur exacte du défaut
// (les tests de bornes ci-dessous utilisent PARAMETRES_DEFAUT directement).
const TEAM_ATHLETE_POOL: string[] = Array.from({ length: PARAMETRES_DEFAUT.campagne_athletes_max + 5 }, () => randomUUID());
const PRODUCT_POOL: string[] = Array.from({ length: PARAMETRES_DEFAUT.campagne_produits_max + 5 }, () => randomUUID());

const ATHLETE_IN_TEAM_ID = TEAM_ATHLETE_POOL[0]!;
const PRODUCT_ID_1 = PRODUCT_POOL[0]!;
const PRODUCT_ID_2 = PRODUCT_POOL[1]!;

function teamManager(teamId: string = TEAM_ID): AuthUser {
  return {
    id: randomUUID(),
    role: 'team_manager',
    memberships: [{ role: 'team_manager', teamId, clubId: null }],
  };
}

function clientUser(): AuthUser {
  return { id: randomUUID(), role: 'client', memberships: [] };
}

/** Repo simulé : athlètes du bassin `TEAM_ATHLETE_POOL` appartiennent à
 * `TEAM_ID` (sauf `ATHLETE_OTHER_TEAM_ID`, qui appartient à
 * `OTHER_TEAM_ID`) ; le bassin `PRODUCT_POOL` est actif,
 * `INACTIVE_PRODUCT_ID` ne l'est pas (absent de `getActiveProductIds`, même
 * contrat que `lib/catalog/products.ts`). `getParametres` retourne
 * `PARAMETRES_DEFAUT` par défaut (P.3) ; `countTeamCampaignsSince` retourne 0
 * par défaut (bien sous n'importe quel plafond raisonnable) — les deux sont
 * surchargeables via `overrides` pour les tests de bornes R1/R2/R3/R5/R7. */
function fakeRepo(overrides: Partial<CampaignRepo> = {}): CampaignRepo {
  return {
    isSlugTaken: async () => false,
    isQrCodeTaken: async () => false,
    getAthletesScope: async (ids) => {
      const known: Record<string, { id: string; teamId: string | null; clubId: string | null }> = {
        [ATHLETE_OTHER_TEAM_ID]: { id: ATHLETE_OTHER_TEAM_ID, teamId: OTHER_TEAM_ID, clubId: null },
      };
      for (const id of TEAM_ATHLETE_POOL) {
        known[id] = { id, teamId: TEAM_ID, clubId: CLUB_ID };
      }
      return ids.filter((id) => id in known).map((id) => known[id]!);
    },
    getActiveProductIds: async (ids) => ids.filter((id) => PRODUCT_POOL.includes(id)),
    getParametres: async () => PARAMETRES_DEFAUT,
    countTeamCampaignsSince: async () => 0,
    createCampaignWithDetails: async (args): Promise<CreatedCampaignResult> => ({
      campaign: {
        id: randomUUID(),
        type: args.type,
        status: args.status,
        name: args.name,
        slug: args.slug,
        public_message: args.publicMessage,
        beneficiary_type: args.beneficiaryType,
        beneficiary_id: args.beneficiaryId,
        club_id: args.clubId,
        team_id: args.teamId,
        goal_cents: args.goalCents,
        starts_at: args.startsAt,
        ends_at: args.endsAt,
        delivery_date: args.deliveryDate,
        created_by: null,
        approved_at: null,
        closed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } satisfies CreatedCampaignResult['campaign'],
      participantAthleteIds: args.participantAthleteIds,
      productIds: args.productIds,
      creditRuleId: args.creditRule ? randomUUID() : null,
      qrCodes: args.qrCodes.map((qr) => ({ targetType: qr.targetType, code: qr.code })),
    }),
    ...overrides,
  };
}

/** Dates par défaut cohérentes avec R1/R2 (durée = defaut = 14 jours,
 * livraison 7 jours après clôture, bien sous le max = 21 jours) — tout test
 * qui ne teste PAS spécifiquement R1/R2 doit passer ces règles sans y penser. */
function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    type: 'team',
    name: 'Campagne hiver 2026',
    beneficiaryType: 'team',
    beneficiaryId: TEAM_ID,
    teamId: TEAM_ID,
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-07-15T00:00:00.000Z', // +14 jours = defaut de campagne_duree_jours
    deliveryDate: '2026-07-22T00:00:00.000Z', // +7 jours après la clôture
    participantAthleteIds: [ATHLETE_IN_TEAM_ID],
    productIds: [PRODUCT_ID_1],
    ...overrides,
  };
}

describe('createCampaign — refus (cas limites obligatoires, CLAUDE.md section 8)', () => {
  it('refuse des dates incohérentes (fin avant début)', async () => {
    const input = baseInput({
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-07-01T00:00:00.000Z',
    });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse une date de livraison antérieure à la clôture', async () => {
    const input = baseInput({
      endsAt: '2026-07-15T00:00:00.000Z',
      deliveryDate: '2026-07-14T00:00:00.000Z',
    });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse une date de fin absente (requise depuis P.3, R1)', async () => {
    const input = baseInput({ endsAt: undefined });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse une date de livraison absente (requise depuis P.3, R2)', async () => {
    const input = baseInput({ deliveryDate: undefined });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it("refuse l'absence de pack (au moins un requis)", async () => {
    const input = baseInput({ productIds: [] });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse un pack introuvable ou inactif', async () => {
    const input = baseInput({ productIds: [INACTIVE_PRODUCT_ID] });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
  });

  it("refuse un athlète participant hors du périmètre (équipe d'une autre campagne)", async () => {
    const input = baseInput({ participantAthleteIds: [ATHLETE_OTHER_TEAM_ID] });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
  });

  it('refuse un bénéficiaire équipe différent de l’équipe rattachée', async () => {
    const input = baseInput({ beneficiaryId: OTHER_TEAM_ID });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
  });

  it("refuse une campagne sans équipe ni club rattaché", async () => {
    const input = baseInput({ teamId: null, beneficiaryType: 'athlete', beneficiaryId: ATHLETE_IN_TEAM_ID });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse un taux de crédit dépassant le plafond self-service (50 %)', async () => {
    const input = baseInput({
      creditRule: { percentBps: SELF_SERVICE_PERCENT_BPS_CAP + 1 },
    });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it('refuse un montant fixe dépassant le plafond self-service (100 $)', async () => {
    const input = baseInput({
      creditRule: { flatCents: SELF_SERVICE_FLAT_CENTS_CAP + 1 },
    });
    await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(ZodError);
  });

  it("refuse un utilisateur sans droit sur l'équipe/club de la campagne", async () => {
    const input = baseInput();
    await expect(createCampaign(teamManager(OTHER_TEAM_ID), input, fakeRepo())).rejects.toThrow(
      PermissionError,
    );
  });

  it('refuse un client (rôle sans droit de création de campagne)', async () => {
    const input = baseInput();
    await expect(createCampaign(clientUser(), input, fakeRepo())).rejects.toThrow(PermissionError);
  });
});

describe('createCampaign — création réussie', () => {
  it('crée une campagne active d’équipe avec plusieurs athlètes et plusieurs packs', async () => {
    const input = baseInput({
      participantAthleteIds: [ATHLETE_IN_TEAM_ID],
      productIds: [PRODUCT_ID_1, PRODUCT_ID_2],
    });
    const result = await createCampaign(teamManager(), input, fakeRepo());

    expect(result.campaign.status).toBe('active');
    expect(result.campaign.slug).toBeTruthy();
    expect(result.productIds).toEqual([PRODUCT_ID_1, PRODUCT_ID_2]);
    expect(result.participantAthleteIds).toEqual([ATHLETE_IN_TEAM_ID]);
    // Un QR « campagne » + un QR par participant (acceptation Tâche 1.7).
    expect(result.qrCodes).toHaveLength(2);
    expect(result.qrCodes.some((qr) => qr.targetType === 'campaign')).toBe(true);
  });

  it('accepte une règle de crédit dans les plafonds self-service', async () => {
    const input = baseInput({ creditRule: { percentBps: SELF_SERVICE_PERCENT_BPS_CAP } });
    const result = await createCampaign(teamManager(), input, fakeRepo());
    expect(result.creditRuleId).not.toBeNull();
  });

  it('déduplique les athlètes participants et les packs', async () => {
    const input = baseInput({
      participantAthleteIds: [ATHLETE_IN_TEAM_ID, ATHLETE_IN_TEAM_ID],
      productIds: [PRODUCT_ID_1, PRODUCT_ID_1, PRODUCT_ID_2],
    });
    const result = await createCampaign(teamManager(), input, fakeRepo());
    expect(result.participantAthleteIds).toEqual([ATHLETE_IN_TEAM_ID]);
    expect(result.productIds).toEqual([PRODUCT_ID_1, PRODUCT_ID_2]);
  });
});

describe('createCampaign — P.3, règles de paramètres de plateforme (SPEC-PARAMETRES-PLATEFORME.md §4)', () => {
  describe('R1 — durée de campagne (campagne_duree_jours)', () => {
    it('accepte une durée EXACTEMENT égale au minimum (7 jours)', async () => {
      const input = baseInput({
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2026-07-08T00:00:00.000Z',
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).resolves.toBeDefined();
    });

    it('refuse une durée inférieure au minimum (min - 1 jour)', async () => {
      const input = baseInput({
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2026-07-07T00:00:00.000Z',
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
    });

    it('accepte une durée EXACTEMENT égale au maximum (21 jours)', async () => {
      const input = baseInput({
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2026-07-22T00:00:00.000Z',
        deliveryDate: '2026-07-29T00:00:00.000Z',
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).resolves.toBeDefined();
    });

    it('refuse une durée supérieure au maximum (max + 1 jour)', async () => {
      const input = baseInput({
        startsAt: '2026-07-01T00:00:00.000Z',
        endsAt: '2026-07-23T00:00:00.000Z',
        deliveryDate: '2026-07-30T00:00:00.000Z',
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('R2 — délai de livraison après clôture (campagne_delai_livraison_jours_max)', () => {
    it('accepte un délai EXACTEMENT égal au maximum (21 jours après la clôture)', async () => {
      const input = baseInput({
        endsAt: '2026-07-15T00:00:00.000Z',
        deliveryDate: '2026-08-05T00:00:00.000Z', // +21 jours
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).resolves.toBeDefined();
    });

    it('refuse un délai supérieur au maximum (max + 1 jour)', async () => {
      const input = baseInput({
        endsAt: '2026-07-15T00:00:00.000Z',
        deliveryDate: '2026-08-06T00:00:00.000Z', // +22 jours
      });
      await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('R3 — nombre maximum d’athlètes participants (campagne_athletes_max)', () => {
    it('accepte EXACTEMENT le maximum (30 athlètes)', async () => {
      const max = PARAMETRES_DEFAUT.campagne_athletes_max;
      const input = baseInput({ participantAthleteIds: TEAM_ATHLETE_POOL.slice(0, max) });
      await expect(createCampaign(teamManager(), input, fakeRepo())).resolves.toBeDefined();
    });

    it('refuse max + 1 athlètes', async () => {
      const max = PARAMETRES_DEFAUT.campagne_athletes_max;
      const input = baseInput({ participantAthleteIds: TEAM_ATHLETE_POOL.slice(0, max + 1) });
      await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('R5 — nombre maximum de produits distincts (campagne_produits_max)', () => {
    it('accepte EXACTEMENT le maximum (6 produits)', async () => {
      const max = PARAMETRES_DEFAUT.campagne_produits_max;
      const input = baseInput({ productIds: PRODUCT_POOL.slice(0, max) });
      await expect(createCampaign(teamManager(), input, fakeRepo())).resolves.toBeDefined();
    });

    it('refuse max + 1 produits', async () => {
      const max = PARAMETRES_DEFAUT.campagne_produits_max;
      const input = baseInput({ productIds: PRODUCT_POOL.slice(0, max + 1) });
      await expect(createCampaign(teamManager(), input, fakeRepo())).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('R7 — campagnes par équipe par année glissante (equipe_campagnes_par_an_max)', () => {
    it('accepte quand le compteur est SOUS le maximum (max - 1)', async () => {
      const max = PARAMETRES_DEFAUT.equipe_campagnes_par_an_max;
      const repo = fakeRepo({ countTeamCampaignsSince: async () => max - 1 });
      await expect(createCampaign(teamManager(), baseInput(), repo)).resolves.toBeDefined();
    });

    it('refuse quand le compteur ATTEINT déjà le maximum', async () => {
      const max = PARAMETRES_DEFAUT.equipe_campagnes_par_an_max;
      const repo = fakeRepo({ countTeamCampaignsSince: async () => max });
      await expect(createCampaign(teamManager(), baseInput(), repo)).rejects.toThrow(BusinessRuleError);
    });

    it("n'appelle pas countTeamCampaignsSince pour une campagne sans équipe (club pur)", async () => {
      let called = false;
      const repo = fakeRepo({
        countTeamCampaignsSince: async () => {
          called = true;
          return 0;
        },
      });
      const input = baseInput({
        teamId: null,
        clubId: CLUB_ID,
        beneficiaryType: 'club',
        beneficiaryId: CLUB_ID,
        participantAthleteIds: [],
      });
      function clubAdmin(): AuthUser {
        return {
          id: randomUUID(),
          role: 'club_admin',
          memberships: [{ role: 'club_admin', teamId: null, clubId: CLUB_ID }],
        };
      }
      await createCampaign(clubAdmin(), input, repo);
      expect(called).toBe(false);
    });
  });
});
