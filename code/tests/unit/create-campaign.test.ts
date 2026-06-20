/**
 * Tests unitaires de l'assistant de création de campagne (Tâche 1.7) :
 * `createCampaign` (logique métier pure + permissions), avec un `CampaignRepo`
 * entièrement simulé (pas de DB) — voir `tests/integration/create-campaign.test.ts`
 * pour le flux complet contre une vraie transaction Postgres
 * (`create_campaign_with_details`, migration 0008).
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

const TEAM_ID = randomUUID();
const CLUB_ID = randomUUID();
const OTHER_TEAM_ID = randomUUID();
const ATHLETE_IN_TEAM_ID = randomUUID();
const ATHLETE_OTHER_TEAM_ID = randomUUID();
const PRODUCT_ID_1 = randomUUID();
const PRODUCT_ID_2 = randomUUID();
const INACTIVE_PRODUCT_ID = randomUUID();

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

/** Repo simulé : athlètes connus appartiennent à `TEAM_ID` (sauf
 * `ATHLETE_OTHER_TEAM_ID`, qui appartient à `OTHER_TEAM_ID`) ; `PRODUCT_ID_1`/
 * `PRODUCT_ID_2` sont actifs, `INACTIVE_PRODUCT_ID` ne l'est pas (absent de
 * `getActiveProductIds`, même contrat que `lib/catalog/products.ts`). */
function fakeRepo(overrides: Partial<CampaignRepo> = {}): CampaignRepo {
  return {
    isSlugTaken: async () => false,
    isQrCodeTaken: async () => false,
    getAthletesScope: async (ids) => {
      const known: Record<string, { id: string; teamId: string | null; clubId: string | null }> = {
        [ATHLETE_IN_TEAM_ID]: { id: ATHLETE_IN_TEAM_ID, teamId: TEAM_ID, clubId: CLUB_ID },
        [ATHLETE_OTHER_TEAM_ID]: { id: ATHLETE_OTHER_TEAM_ID, teamId: OTHER_TEAM_ID, clubId: null },
      };
      return ids.filter((id) => id in known).map((id) => known[id]!);
    },
    getActiveProductIds: async (ids) => ids.filter((id) => id === PRODUCT_ID_1 || id === PRODUCT_ID_2),
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

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    type: 'team',
    name: 'Campagne hiver 2026',
    beneficiaryType: 'team',
    beneficiaryId: TEAM_ID,
    teamId: TEAM_ID,
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-08-01T00:00:00.000Z',
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
