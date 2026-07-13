/**
 * Tests unitaires du brouillon de l'assistant de campagne en étapes
 * (Tâche 1.6.B1) : validation par étape (`parseStepInput`), fusion
 * (`mergeDraftData`), assemblage final (`buildCampaignInputFromDraft`) et les
 * utilitaires de navigation (`?etape=`). Aucune DB ici — `CampaignDraftRepo`
 * n'est pas exercé (c'est une fine couche Supabase, pas de logique métier à
 * tester unitairement).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  CAMPAIGN_DRAFT_STEP_IDS,
  buildCampaignInputFromDraft,
  clampStepQueryParam,
  isValidDraftStepId,
  mergeDraftData,
  nextStepId,
  parseStepInput,
  previousStepId,
  stepIdFromIndex,
  stepIndexFromStepId,
  type CampaignDraftData,
} from '@/lib/campaigns/draft';
import { createCampaign, type CampaignRepo, type CreatedCampaignResult } from '@/lib/campaigns/create-campaign';
import type { AuthUser } from '@/lib/auth/permissions';

const TEAM_ID = randomUUID();
const ATHLETE_ID = randomUUID();
const PRODUCT_ID = randomUUID();

describe('navigation des étapes (?etape=)', () => {
  it('numérote les étapes de 1 à 6, dans l’ordre déclaré', () => {
    expect(CAMPAIGN_DRAFT_STEP_IDS).toHaveLength(6);
    CAMPAIGN_DRAFT_STEP_IDS.forEach((stepId, index) => {
      expect(stepIndexFromStepId(stepId)).toBe(index + 1);
      expect(stepIdFromIndex(index + 1)).toBe(stepId);
    });
  });

  it('clampStepQueryParam retombe sur 1 pour une valeur absente, non numérique ou hors bornes', () => {
    expect(clampStepQueryParam(undefined)).toBe(1);
    expect(clampStepQueryParam('abc')).toBe(1);
    expect(clampStepQueryParam('0')).toBe(1);
    expect(clampStepQueryParam('999')).toBe(CAMPAIGN_DRAFT_STEP_IDS.length);
    expect(clampStepQueryParam('3')).toBe(3);
    expect(clampStepQueryParam(['2', '5'])).toBe(2);
  });

  it('nextStepId/previousStepId bornent correctement aux extrémités', () => {
    expect(previousStepId('type_nom')).toBeNull();
    expect(nextStepId('recap')).toBeNull();
    expect(nextStepId('type_nom')).toBe('beneficiaire');
    expect(previousStepId('beneficiaire')).toBe('type_nom');
  });

  it('isValidDraftStepId rejette une valeur inconnue', () => {
    expect(isValidDraftStepId('beneficiaire')).toBe(true);
    expect(isValidDraftStepId('inexistante')).toBe(false);
    expect(isValidDraftStepId(undefined)).toBe(false);
  });
});

describe('parseStepInput — validation par étape (cas limites obligatoires)', () => {
  it('valide l’étape type_nom et rejette un nom vide', () => {
    const valid = parseStepInput('type_nom', { type: 'team', name: 'Campagne hiver', publicMessage: null });
    expect(valid).toEqual({ type: 'team', name: 'Campagne hiver', publicMessage: null });

    expect(() => parseStepInput('type_nom', { type: 'team', name: '' })).toThrow(ZodError);
  });

  it('valide l’étape bénéficiaire et exige au moins une équipe ou un club', () => {
    expect(() =>
      parseStepInput('beneficiaire', {
        teamId: null,
        clubId: null,
        beneficiaryType: 'athlete',
        beneficiaryId: ATHLETE_ID,
      }),
    ).toThrow(ZodError);

    const valid = parseStepInput('beneficiaire', {
      teamId: TEAM_ID,
      clubId: null,
      beneficiaryType: 'team',
      beneficiaryId: TEAM_ID,
    });
    expect(valid).toEqual({ teamId: TEAM_ID, clubId: null, beneficiaryType: 'team', beneficiaryId: TEAM_ID });
  });

  it('valide l’étape objectif_dates et rejette une fin avant le début', () => {
    expect(() =>
      parseStepInput('objectif_dates', {
        goalCents: null,
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow(ZodError);

    const valid = parseStepInput('objectif_dates', {
      goalCents: 0,
      startsAt: '2026-07-01T00:00:00.000Z',
      endsAt: null,
    });
    expect(valid).toEqual({ goalCents: 0, startsAt: '2026-07-01T00:00:00.000Z', endsAt: null });
  });

  it('valide l’étape participants (liste vide acceptée — aucun participant requis)', () => {
    expect(parseStepInput('participants', { participantAthleteIds: [] })).toEqual({
      participantAthleteIds: [],
    });
    expect(() => parseStepInput('participants', { participantAthleteIds: ['pas-un-uuid'] })).toThrow(
      ZodError,
    );
  });

  it('valide l’étape packs et rejette l’absence de pack (au moins un requis)', () => {
    expect(() => parseStepInput('packs', { productIds: [] })).toThrow(ZodError);
    expect(parseStepInput('packs', { productIds: [PRODUCT_ID] })).toEqual({ productIds: [PRODUCT_ID] });
  });

  it('l’étape recap n’a aucun champ propre à valider', () => {
    expect(parseStepInput('recap', {})).toEqual({});
  });
});

describe('mergeDraftData — fusion superficielle (retour arrière sans perte)', () => {
  it('conserve les champs déjà enregistrés par une étape précédente', () => {
    const afterStep1: CampaignDraftData = { type: 'team', name: 'Campagne hiver' };
    const afterStep2 = mergeDraftData(afterStep1, { teamId: TEAM_ID, beneficiaryType: 'team', beneficiaryId: TEAM_ID });

    expect(afterStep2).toEqual({
      type: 'team',
      name: 'Campagne hiver',
      teamId: TEAM_ID,
      beneficiaryType: 'team',
      beneficiaryId: TEAM_ID,
    });
  });

  it('une resoumission de la même étape écrase uniquement ses propres champs', () => {
    const draft: CampaignDraftData = { type: 'team', name: 'Ancien nom', teamId: TEAM_ID };
    const updated = mergeDraftData(draft, { type: 'club', name: 'Nouveau nom' });
    expect(updated).toEqual({ type: 'club', name: 'Nouveau nom', teamId: TEAM_ID });
  });
});

describe('buildCampaignInputFromDraft — Bloc B : jamais de règle de crédit', () => {
  it('force toujours creditRule: null, même si le brouillon contenait d’autres données', () => {
    const data: CampaignDraftData = {
      type: 'team',
      name: 'Campagne hiver',
      teamId: TEAM_ID,
      beneficiaryType: 'team',
      beneficiaryId: TEAM_ID,
      startsAt: '2026-07-01T00:00:00.000Z',
      participantAthleteIds: [ATHLETE_ID],
      productIds: [PRODUCT_ID],
    };
    const result = buildCampaignInputFromDraft(data) as Record<string, unknown>;
    expect(result.creditRule).toBeNull();
  });

  it('remplace les champs optionnels absents par des valeurs neutres (jamais undefined)', () => {
    const result = buildCampaignInputFromDraft({}) as Record<string, unknown>;
    expect(result.publicMessage).toBeNull();
    expect(result.clubId).toBeNull();
    expect(result.teamId).toBeNull();
    expect(result.goalCents).toBeNull();
    expect(result.endsAt).toBeNull();
    expect(result.participantAthleteIds).toEqual([]);
    expect(result.productIds).toEqual([]);
    expect(result.creditRule).toBeNull();
  });

  it('un brouillon jamais complété produit une erreur Zod à la création réelle (pas un crash)', async () => {
    function teamManager(): AuthUser {
      return {
        id: randomUUID(),
        role: 'team_manager',
        memberships: [{ role: 'team_manager', teamId: TEAM_ID, clubId: null }],
      };
    }
    function emptyRepo(): CampaignRepo {
      return {
        isSlugTaken: async () => false,
        isQrCodeTaken: async () => false,
        getAthletesScope: async () => [],
        getActiveProductIds: async () => [],
        createCampaignWithDetails: async (): Promise<CreatedCampaignResult> => {
          throw new Error('ne devrait jamais être appelé : la validation doit échouer avant');
        },
      };
    }

    const incompleteInput = buildCampaignInputFromDraft({});
    await expect(createCampaign(teamManager(), incompleteInput, emptyRepo())).rejects.toThrow(ZodError);
  });
});
