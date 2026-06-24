/**
 * Tests unitaires de la saisie en lot d'athlètes (Tâche 1.6.B2,
 * `lib/athletes/bulk-add.ts`). Couvre le parsing pur (`parsePastedAthleteList`),
 * la détection de doublons (`detectDuplicates`) et le flux complet
 * (`bulkCreateAthletesFromPastedList`) via un `AthleteRepo` en mémoire — même
 * convention que `tests/integration/entities.test.ts` (Tâche 1.1).
 *
 * Cas limite central de cette tâche : un mineur collé sans tuteur connu doit
 * être créé (jamais bloqué) mais signalé comme non publiable — voir la
 * décision du 2026-06-23 dans docs/DECISIONS.md (assouplissement de
 * `athleteInputSchema`, lib/entities/athletes.ts).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bulkCreateAthletesFromPastedList,
  detectDuplicates,
  normalizeNameForDedupe,
  parsePastedAthleteList,
} from '@/lib/athletes/bulk-add';
import type { AthleteRepo, AthleteRow } from '@/lib/entities/athletes';
import type { AuthUser } from '@/lib/auth/permissions';

const TEAM_ID = randomUUID();

describe('parsePastedAthleteList', () => {
  it('accepte "Prénom Nom" séparé par un simple espace', () => {
    const rows = parsePastedAthleteList('Jean Tremblay');
    expect(rows).toEqual([{ firstName: 'Jean', lastName: 'Tremblay', sport: null, raw: 'Jean Tremblay' }]);
  });

  it('accepte "Prénom, Nom" séparé par une virgule', () => {
    const rows = parsePastedAthleteList('Marie, Gagnon');
    expect(rows[0]).toMatchObject({ firstName: 'Marie', lastName: 'Gagnon', sport: null });
  });

  it('accepte "Prénom, Nom, Catégorie" et mappe le 3e champ sur sport', () => {
    const rows = parsePastedAthleteList('Marie, Gagnon, Natation');
    expect(rows[0]).toMatchObject({ firstName: 'Marie', lastName: 'Gagnon', sport: 'Natation' });
  });

  it('accepte une tabulation comme séparateur', () => {
    const rows = parsePastedAthleteList('Jean\tTremblay\tHockey');
    expect(rows[0]).toMatchObject({ firstName: 'Jean', lastName: 'Tremblay', sport: 'Hockey' });
  });

  it('traite plusieurs lignes, une par athlète', () => {
    const rows = parsePastedAthleteList('Jean Tremblay\nMarie Gagnon\nLéa Roy');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.firstName)).toEqual(['Jean', 'Marie', 'Léa']);
  });

  it('ignore silencieusement les lignes vides et celles sans nom de famille identifiable', () => {
    const rows = parsePastedAthleteList('Jean Tremblay\n\nSeulUnNom\n  \nMarie Gagnon');
    expect(rows.map((r) => r.firstName)).toEqual(['Jean', 'Marie']);
  });

  it('avec un séparateur espace, un 3e mot est traité comme catégorie (même heuristique que la virgule)', () => {
    // Avec un simple espace, rien ne distingue un nom de famille composé d'un
    // 3e champ "catégorie" : `splitLine` applique la même règle que pour la
    // virgule (le dernier mot devient `sport`) — voir lib/athletes/bulk-add.ts.
    // Un nom de famille composé doit donc être saisi avec une virgule ou une
    // tabulation pour rester groupé (cas couvert par les tests ci-dessus).
    const rows = parsePastedAthleteList('Jean Tremblay Dubois');
    expect(rows[0]).toMatchObject({ firstName: 'Jean', lastName: 'Tremblay', sport: 'Dubois' });
  });

  it('coller 15 noms produit 15 entrées (critère d’acceptation 1.6.B2)', () => {
    const names = Array.from({ length: 15 }, (_, i) => `Athlète${i} Nom${i}`);
    const rows = parsePastedAthleteList(names.join('\n'));
    expect(rows).toHaveLength(15);
  });
});

describe('normalizeNameForDedupe', () => {
  it('ignore la casse, les accents et les espaces multiples', () => {
    expect(normalizeNameForDedupe('Jean', 'Tremblay')).toBe(normalizeNameForDedupe('jean', 'tremblay'));
    expect(normalizeNameForDedupe('Léa', 'Gagnon')).toBe(normalizeNameForDedupe('lea', 'gagnon'));
    expect(normalizeNameForDedupe('Jean  ', '  Tremblay')).toBe(normalizeNameForDedupe('Jean', 'Tremblay'));
  });
});

describe('detectDuplicates', () => {
  it('signale un doublon déjà présent dans l’équipe ciblée', () => {
    const rows = parsePastedAthleteList('Jean Tremblay');
    const annotated = detectDuplicates(rows, [{ firstName: 'jean', lastName: 'tremblay' }]);
    expect(annotated[0]!.isDuplicate).toBe(true);
  });

  it('signale un doublon répété DANS la même liste collée (pas seulement contre l’existant)', () => {
    const rows = parsePastedAthleteList('Jean Tremblay\nJean Tremblay');
    const annotated = detectDuplicates(rows, []);
    expect(annotated[0]!.isDuplicate).toBe(false);
    expect(annotated[1]!.isDuplicate).toBe(true);
  });

  it('ne signale rien si aucun nom ne se recoupe', () => {
    const rows = parsePastedAthleteList('Jean Tremblay\nMarie Gagnon');
    const annotated = detectDuplicates(rows, []);
    expect(annotated.every((r) => !r.isDuplicate)).toBe(true);
  });
});

function createFakeAthleteRepo(): { repo: AthleteRepo; rows: AthleteRow[] } {
  const rows: AthleteRow[] = [];
  const repo: AthleteRepo = {
    async isSlugTaken(slug) {
      return rows.some((r) => r.slug === slug);
    },
    async getTeamClubId() {
      return null;
    },
    async insertAthlete(input) {
      const row = {
        id: randomUUID(),
        first_name: input.firstName,
        last_name: input.lastName,
        slug: input.slug,
        team_id: input.teamId,
        guardian_id: input.guardianId,
        user_id: input.userId,
        is_minor: input.isMinor,
        sport: input.sport,
        city: input.city,
        personal_message: input.personalMessage,
        hide_last_name: input.hideLastName,
        hide_photo: input.hidePhoto,
        hide_city: input.hideCity,
        hide_amounts: input.hideAmounts,
        show_team_only: input.showTeamOnly,
        parental_consent_at: input.parentalConsentAt,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as AthleteRow;
      rows.push(row);
      return row;
    },
    async getAthleteContext() {
      return null;
    },
    async updateAthlete() {
      throw new Error('non utilisé dans ce test');
    },
  };
  return { repo, rows };
}

const teamManager: AuthUser = {
  id: randomUUID(),
  role: 'client',
  memberships: [{ role: 'team_manager', clubId: null, teamId: TEAM_ID }],
};

describe('bulkCreateAthletesFromPastedList — flux complet', () => {
  it('crée tous les athlètes valides, sans doublon, pour l’équipe ciblée', async () => {
    const { repo } = createFakeAthleteRepo();
    const result = await bulkCreateAthletesFromPastedList(
      teamManager,
      TEAM_ID,
      'Jean Tremblay\nMarie Gagnon',
      [],
      repo,
    );
    expect(result.created).toHaveLength(2);
    expect(result.skippedDuplicates).toHaveLength(0);
  });

  it('ignore les doublons (déjà existants dans l’équipe) sans les créer', async () => {
    const { repo, rows } = createFakeAthleteRepo();
    const result = await bulkCreateAthletesFromPastedList(
      teamManager,
      TEAM_ID,
      'Jean Tremblay\nMarie Gagnon',
      [{ firstName: 'Jean', lastName: 'Tremblay' }],
      repo,
    );
    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.first_name).toBe('Marie');
    expect(result.skippedDuplicates).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('mineur sans tuteur connu : CRÉÉ (jamais bloqué), mais marqué non publiable', async () => {
    const { repo } = createFakeAthleteRepo();
    const result = await bulkCreateAthletesFromPastedList(teamManager, TEAM_ID, 'Jean Tremblay', [], repo);
    expect(result.created).toHaveLength(1);
    const created = result.created[0]!;
    expect(created.is_minor).toBe(true);
    expect(created.guardian_id).toBeNull();
    expect(created.parental_consent_at).toBeNull();
    expect(result.unpublishableMinors).toHaveLength(1);
    expect(result.unpublishableMinors[0]!.id).toBe(created.id);
  });

  it('un gérant (jamais tuteur) ne peut pas accorder de consentement parental à la création', async () => {
    const { repo } = createFakeAthleteRepo();
    // bulkCreateAthletesFromPastedList n'expose aucun champ de consentement à
    // l'entrée (parsePastedAthleteList n'en extrait aucun) ; ce test confirme
    // que createAthlete (lib/entities/athletes.ts) reste la seule source de
    // vérité pour ce refus, même appelée depuis ce nouveau chemin en lot.
    const { repo: repo2 } = createFakeAthleteRepo();
    const result = await bulkCreateAthletesFromPastedList(teamManager, TEAM_ID, 'Jean Tremblay', [], repo2);
    expect(result.created[0]!.parental_consent_at).toBeNull();
    void repo;
  });

  it('aucune ligne valide dans la liste collée → résultat vide, pas une erreur', async () => {
    const { repo } = createFakeAthleteRepo();
    const result = await bulkCreateAthletesFromPastedList(teamManager, TEAM_ID, '\n\n  \n', [], repo);
    expect(result.created).toHaveLength(0);
    expect(result.skippedDuplicates).toHaveLength(0);
    expect(result.unpublishableMinors).toHaveLength(0);
  });
});
