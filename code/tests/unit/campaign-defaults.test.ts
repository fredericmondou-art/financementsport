/**
 * Tests unitaires des défauts intelligents de l'assistant de campagne
 * (Tâche 1.6.B2, `lib/campaigns/defaults.ts`). Fonction pure, aucune DB ici.
 *
 * Critère d'acceptation principal vérifié mot pour mot : « Création « tout
 * par défaut » aboutit à une campagne activable » — `buildCampaignInputFromDraft`
 * (déjà testé dans `campaign-draft.test.ts`) ne doit jamais lever d'erreur de
 * validation sur le résultat de `applyCampaignDefaults` appliqué à un
 * brouillon vide.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyCampaignDefaults,
  DEFAULT_CAMPAIGN_DURATION_DAYS,
  type CampaignDefaultsOptions,
} from '@/lib/campaigns/defaults';
import { buildCampaignInputFromDraft } from '@/lib/campaigns/draft';
import { campaignInputSchema } from '@/lib/campaigns/create-campaign';

const TEAM_ID = randomUUID();
const CLUB_ID = randomUUID();
const ATHLETE_ID_1 = randomUUID();
const ATHLETE_ID_2 = randomUUID();
const PRODUCT_ID = randomUUID();

function baseOptions(overrides: Partial<CampaignDefaultsOptions> = {}): CampaignDefaultsOptions {
  return {
    teams: [],
    clubs: [],
    athletes: [],
    products: [],
    ...overrides,
  };
}

describe('applyCampaignDefaults — ne touche jamais un champ déjà présent', () => {
  it('ne remplace pas un nom déjà choisi par le gestionnaire', () => {
    const options = baseOptions({ teams: [{ id: TEAM_ID, name: 'U11', clubId: null }] });
    const result = applyCampaignDefaults({ name: 'Campagne Choisie' }, options);
    expect(result.name).toBe('Campagne Choisie');
  });

  it('ne remplace pas une liste de participants déjà choisie (même vide)', () => {
    const options = baseOptions({
      athletes: [{ id: ATHLETE_ID_1, firstName: 'Thomas', lastName: 'Tremblay', teamId: TEAM_ID }],
    });
    const result = applyCampaignDefaults({ participantAthleteIds: [] }, options);
    expect(result.participantAthleteIds).toEqual([]);
  });

  it('ne remplace pas des dates déjà choisies', () => {
    const result = applyCampaignDefaults(
      { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' },
      baseOptions(),
    );
    expect(result.startsAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.endsAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('applyCampaignDefaults — priorité équipe sur club', () => {
  it('choisit l’équipe quand le gestionnaire gère une équipe ET un club', () => {
    const options = baseOptions({
      teams: [{ id: TEAM_ID, name: 'U11', clubId: CLUB_ID }],
      clubs: [{ id: CLUB_ID, name: 'Corsaires' }],
    });
    const result = applyCampaignDefaults({}, options);
    expect(result.type).toBe('team');
    expect(result.teamId).toBe(TEAM_ID);
    expect(result.beneficiaryType).toBe('team');
    expect(result.beneficiaryId).toBe(TEAM_ID);
    // L'équipe rattache déjà son club : pas perdu, seulement pas le bénéficiaire direct.
    expect(result.clubId).toBe(CLUB_ID);
  });

  it('retombe sur le club si le gestionnaire ne gère aucune équipe', () => {
    const options = baseOptions({ clubs: [{ id: CLUB_ID, name: 'Corsaires' }] });
    const result = applyCampaignDefaults({}, options);
    expect(result.type).toBe('club');
    expect(result.beneficiaryType).toBe('club');
    expect(result.beneficiaryId).toBe(CLUB_ID);
    expect(result.teamId).toBeNull();
  });
});

describe('applyCampaignDefaults — dates et listes "tout sélectionné"', () => {
  it('défaut sur une durée de 60 jours quand aucune date n’est choisie', () => {
    const result = applyCampaignDefaults({}, baseOptions());
    expect(result.startsAt).toBeDefined();
    expect(result.endsAt).toBeDefined();
    const start = new Date(result.startsAt as string).getTime();
    const end = new Date(result.endsAt as string).getTime();
    const days = (end - start) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(DEFAULT_CAMPAIGN_DURATION_DAYS, 5);
  });

  it('sélectionne tous les athlètes et tous les produits gérés par défaut', () => {
    const options = baseOptions({
      teams: [{ id: TEAM_ID, name: 'U11', clubId: null }],
      athletes: [
        { id: ATHLETE_ID_1, firstName: 'Thomas', lastName: 'Tremblay', teamId: TEAM_ID },
        { id: ATHLETE_ID_2, firstName: 'Léa', lastName: 'Gagnon', teamId: TEAM_ID },
      ],
      products: [{ id: PRODUCT_ID, name: 'Pack Saison' }],
    });
    const result = applyCampaignDefaults({}, options);
    expect(result.participantAthleteIds).toEqual([ATHLETE_ID_1, ATHLETE_ID_2]);
    expect(result.productIds).toEqual([PRODUCT_ID]);
  });
});

describe('applyCampaignDefaults — critère d’acceptation : "tout par défaut" est activable', () => {
  it('un brouillon entièrement vide, une fois les défauts appliqués, passe la validation finale', () => {
    const options = baseOptions({
      teams: [{ id: TEAM_ID, name: 'U11', clubId: null }],
      athletes: [{ id: ATHLETE_ID_1, firstName: 'Thomas', lastName: 'Tremblay', teamId: TEAM_ID }],
      products: [{ id: PRODUCT_ID, name: 'Pack Saison' }],
    });
    const withDefaults = applyCampaignDefaults({}, options);
    const rawInput = buildCampaignInputFromDraft(withDefaults);
    // `buildCampaignInputFromDraft` force toujours creditRule: null (Bloc B) ;
    // ce test vérifie seulement que la FORME passe le schéma final, pas la
    // création réelle (qui exige une vraie DB, voir create-campaign.test.ts).
    expect(() => campaignInputSchema.parse(rawInput)).not.toThrow();
  });

  it('un gestionnaire sans équipe ni club géré ne reçoit aucun bénéficiaire par défaut (pas de campagne activable, comportement attendu)', () => {
    const result = applyCampaignDefaults({}, baseOptions());
    expect(result.teamId).toBeUndefined();
    expect(result.clubId).toBeUndefined();
    expect(result.beneficiaryId).toBeUndefined();
  });
});
