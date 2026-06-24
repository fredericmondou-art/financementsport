/**
 * Test d'intégration Tâche 1.1 : chaîne club -> équipe -> athlète, avec des
 * repos en mémoire (PAS de Postgres réel) — supabase-js exige un vrai
 * endpoint PostgREST, indisponible ici (réseau vers *.supabase.co bloqué
 * dans ce bac à sable, voir docs/DECISIONS.md, Tâche 0.3). Les repos en
 * mémoire respectent exactement les interfaces `ClubRepo`/`TeamRepo`/
 * `AthleteRepo`, donc ce test exerce la même logique métier (validation,
 * permissions, slug) que le code branché sur Supabase.
 *
 * Note : `clubId`/`teamId`/`guardianId`/`userId` sont validés en UUID par les
 * schémas zod (alignés sur les colonnes Postgres réelles, toujours des UUID
 * générés par Supabase) — les identifiants des fixtures et des repos en
 * mémoire ci-dessous sont donc des UUID, pas de simples chaînes lisibles.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth/permissions';
import { createClub, getClub, type ClubRepo, type ClubRow } from '@/lib/entities/clubs';
import { createTeam, type TeamRepo, type TeamRow } from '@/lib/entities/teams';
import {
  createAthlete,
  isAthletePubliclyVisible,
  updateAthlete,
  type AthleteContext,
  type AthleteRepo,
  type AthleteRow,
} from '@/lib/entities/athletes';
import { PermissionError } from '@/lib/entities/errors';

function createFakeClubRepo(): ClubRepo {
  const clubs = new Map<string, ClubRow>();
  return {
    async isSlugTaken(slug) {
      return [...clubs.values()].some((c) => c.slug === slug);
    },
    async insertClub(input) {
      const id = randomUUID();
      const row = {
        id,
        name: input.name,
        slug: input.slug,
        description: input.description,
        logo_url: input.logoUrl,
        city: input.city,
        province: input.province,
        approved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as ClubRow;
      clubs.set(id, row);
      return row;
    },
    async getClubById(id) {
      return clubs.get(id) ?? null;
    },
    async updateClub(id, patch) {
      const existing = clubs.get(id);
      if (!existing) throw new Error('club introuvable (fake repo)');
      const updated = { ...existing, ...patch } as ClubRow;
      clubs.set(id, updated);
      return updated;
    },
  };
}

function createFakeTeamRepo(): TeamRepo {
  const teams = new Map<string, TeamRow>();
  return {
    async isSlugTaken(slug) {
      return [...teams.values()].some((t) => t.slug === slug);
    },
    async insertTeam(input) {
      const id = randomUUID();
      const row = {
        id,
        name: input.name,
        slug: input.slug,
        club_id: input.clubId,
        sport: input.sport,
        category: input.category,
        logo_url: input.logoUrl,
        city: input.city,
        province: input.province,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as TeamRow;
      teams.set(id, row);
      return row;
    },
    async getTeamById(id) {
      return teams.get(id) ?? null;
    },
    async updateTeam(id, patch) {
      const existing = teams.get(id);
      if (!existing) throw new Error('équipe introuvable (fake repo)');
      const updated = { ...existing, ...patch } as TeamRow;
      teams.set(id, updated);
      return updated;
    },
  };
}

function createFakeAthleteRepo(teamRepo: TeamRepo): AthleteRepo {
  const athletes = new Map<string, AthleteRow>();
  return {
    async isSlugTaken(slug) {
      return [...athletes.values()].some((a) => a.slug === slug);
    },
    async getTeamClubId(teamId) {
      const team = await teamRepo.getTeamById(teamId);
      return team?.club_id ?? null;
    },
    async insertAthlete(input) {
      const id = randomUUID();
      const row = {
        id,
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
        photo_url: input.photoUrl,
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
      athletes.set(id, row);
      return row;
    },
    async getAthleteContext(id) {
      const athlete = athletes.get(id);
      if (!athlete) return null;
      const teamClubId = athlete.team_id ? await this.getTeamClubId(athlete.team_id) : null;
      return { athlete, teamClubId } as AthleteContext;
    },
    async updateAthlete(id, patch) {
      const existing = athletes.get(id);
      if (!existing) throw new Error('athlète introuvable (fake repo)');
      const row: Record<string, unknown> = { ...existing };
      if (patch.firstName !== undefined) row.first_name = patch.firstName;
      if (patch.lastName !== undefined) row.last_name = patch.lastName;
      if (patch.teamId !== undefined) row.team_id = patch.teamId;
      if (patch.sport !== undefined) row.sport = patch.sport;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.personalMessage !== undefined) row.personal_message = patch.personalMessage;
      if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;
      if (patch.isActive !== undefined) row.is_active = patch.isActive;
      if (patch.hideLastName !== undefined) row.hide_last_name = patch.hideLastName;
      if (patch.hidePhoto !== undefined) row.hide_photo = patch.hidePhoto;
      if (patch.hideCity !== undefined) row.hide_city = patch.hideCity;
      if (patch.hideAmounts !== undefined) row.hide_amounts = patch.hideAmounts;
      if (patch.showTeamOnly !== undefined) row.show_team_only = patch.showTeamOnly;
      if (patch.parentalConsentAt !== undefined) row.parental_consent_at = patch.parentalConsentAt;
      const updated = row as AthleteRow;
      athletes.set(id, updated);
      return updated;
    },
  };
}

// Modèle d'intégration admin-driven (voir docs/DECISIONS.md) : platform_admin
// crée le club, puis un club_admin déjà membre de ce club (rôle assigné par
// l'admin via `memberships`, hors scope de ce module) crée l'équipe.
const platformAdmin: AuthUser = { id: randomUUID(), role: 'platform_admin', memberships: [] };
const guardian: AuthUser = { id: randomUUID(), role: 'client', memberships: [] };

describe('Chaîne club -> équipe -> athlète (critère d’acceptation Tâche 1.1)', () => {
  it('crée un club, puis une équipe rattachée, puis un athlète rattaché', async () => {
    const clubRepo = createFakeClubRepo();
    const teamRepo = createFakeTeamRepo();
    const athleteRepo = createFakeAthleteRepo(teamRepo);

    const club = await createClub(platformAdmin, { name: 'Corsaires' }, clubRepo);
    expect(club.slug).toBe('corsaires');

    const clubAdmin: AuthUser = {
      id: randomUUID(),
      role: 'club_admin',
      memberships: [{ role: 'club_admin', clubId: club.id, teamId: null }],
    };

    const team = await createTeam(
      clubAdmin,
      { name: 'U11', clubId: club.id, category: 'U11' },
      teamRepo,
    );
    expect(team.club_id).toBe(club.id);
    expect(team.slug).toBe('u11');

    const athlete = await createAthlete(
      guardian,
      {
        firstName: 'Thomas',
        lastName: 'Tremblay',
        teamId: team.id,
        guardianId: guardian.id,
      },
      athleteRepo,
    );
    expect(athlete.team_id).toBe(team.id);
    expect(athlete.guardian_id).toBe(guardian.id);
    expect(athlete.slug).toBe('thomas-tremblay');

    // Lecture autorisée pour le club_admin via la cascade équipe -> club.
    const fetched = await getClub(clubAdmin, club.id, clubRepo);
    expect(fetched.id).toBe(club.id);
  });

  it('refuse la création d’une équipe par un utilisateur sans scope club_admin sur le club visé', async () => {
    const clubRepo = createFakeClubRepo();
    const teamRepo = createFakeTeamRepo();
    const club = await createClub(platformAdmin, { name: 'Corsaires' }, clubRepo);

    await expect(
      createTeam(guardian, { name: 'U11', clubId: club.id }, teamRepo),
    ).rejects.toThrow(PermissionError);
  });

  it('deux athlètes "Thomas U11" produisent deux slugs distincts', async () => {
    const teamRepo = createFakeTeamRepo();
    const athleteRepo = createFakeAthleteRepo(teamRepo);

    const first = await createAthlete(
      guardian,
      { firstName: 'Thomas', lastName: 'U11', guardianId: guardian.id },
      athleteRepo,
    );
    const otherGuardian: AuthUser = { id: randomUUID(), role: 'client', memberships: [] };
    const second = await createAthlete(
      otherGuardian,
      { firstName: 'Thomas', lastName: 'U11', guardianId: otherGuardian.id },
      athleteRepo,
    );

    expect(first.slug).toBe('thomas-u11');
    expect(second.slug).toBe('thomas-u11-2');
    expect(first.slug).not.toBe(second.slug);
  });

  it('un athlète mineur sans consentement n’est pas publiable', async () => {
    const teamRepo = createFakeTeamRepo();
    const athleteRepo = createFakeAthleteRepo(teamRepo);

    const athlete = await createAthlete(
      guardian,
      { firstName: 'Thomas', lastName: 'Tremblay', guardianId: guardian.id },
      athleteRepo,
    );
    expect(isAthletePubliclyVisible(athlete)).toBe(false);

    const consented = await updateAthlete(
      guardian,
      athlete.id,
      { parentalConsentAt: new Date().toISOString() },
      athleteRepo,
    );
    expect(isAthletePubliclyVisible(consented)).toBe(true);
  });

  it('photoUrl traverse création puis mise à jour (Tâche 1.6.C1)', async () => {
    const teamRepo = createFakeTeamRepo();
    const athleteRepo = createFakeAthleteRepo(teamRepo);

    const athlete = await createAthlete(
      guardian,
      {
        firstName: 'Thomas',
        lastName: 'Tremblay',
        guardianId: guardian.id,
        photoUrl: 'https://exemple.com/thomas.jpg',
      },
      athleteRepo,
    );
    expect(athlete.photo_url).toBe('https://exemple.com/thomas.jpg');

    const updated = await updateAthlete(
      guardian,
      athlete.id,
      { photoUrl: 'https://exemple.com/thomas-2.jpg' },
      athleteRepo,
    );
    expect(updated.photo_url).toBe('https://exemple.com/thomas-2.jpg');

    const cleared = await updateAthlete(guardian, athlete.id, { photoUrl: null }, athleteRepo);
    expect(cleared.photo_url).toBeNull();
  });

  it('refuse à un tiers (ni tuteur, ni athlète, ni admin) de définir le consentement parental à la création', async () => {
    const teamRepo = createFakeTeamRepo();
    const athleteRepo = createFakeAthleteRepo(teamRepo);

    const fakeTeamId = randomUUID();
    const teamManager: AuthUser = {
      id: randomUUID(),
      role: 'team_manager',
      memberships: [{ role: 'team_manager', clubId: null, teamId: fakeTeamId }],
    };
    const autreTuteurId = randomUUID();
    // Le gérant inscrit un athlète de son équipe pour un tuteur déjà inscrit
    // (guardianId fourni), mais tente de cocher le consentement lui-même —
    // doit être ignoré, jamais accordé par un tiers.
    const athlete = await createAthlete(
      teamManager,
      {
        firstName: 'Léa',
        lastName: 'Gagnon',
        teamId: fakeTeamId,
        guardianId: autreTuteurId,
        parentalConsentAt: new Date().toISOString(),
      },
      athleteRepo,
    );
    expect(athlete.parental_consent_at).toBeNull();
    expect(isAthletePubliclyVisible(athlete)).toBe(false);
  });
});
