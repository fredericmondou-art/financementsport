/**
 * Données de référence pour l'assistant de création de campagne (Tâche 1.7) :
 * quelles équipes/clubs un `team_manager`/`club_admin` gère, et quels
 * athlètes peuvent donc être ajoutés comme participants.
 *
 * Lecture seule, purement informative pour remplir le formulaire (l'assistant
 * reste en formulaire natif, aucun composant client — CLAUDE.md section 6) :
 * la validation qui COMPTE reste celle de `lib/campaigns/create-campaign.ts`
 * (`can()` + `assertAthleteInScope`). Si cette liste omettait une équipe que
 * l'utilisateur gère réellement, la création échouerait simplement côté
 * serveur avec un message clair — aucun risque de sécurité à ce que cette
 * fonction soit "trop permissive" dans ce qu'elle affiche, puisqu'elle n'crit
 * jamais rien.
 *
 * Reproduit ici, en TypeScript, la même logique que les fonctions RLS
 * `private.manages_team`/`private.manages_club` (migration 0005) : un
 * `team_manager` gère les équipes de ses memberships directes ; un
 * `club_admin` gère aussi, par transitivité, toutes les équipes de son club.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from '@/lib/auth/permissions';

export interface ManagedTeamOption {
  id: string;
  name: string;
  clubId: string | null;
}

export interface ManagedClubOption {
  id: string;
  name: string;
}

export interface ManagedAthleteOption {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
}

export interface CampaignWizardOptions {
  teams: ManagedTeamOption[];
  clubs: ManagedClubOption[];
  athletes: ManagedAthleteOption[];
}

export async function loadCampaignWizardOptions(
  supabase: SupabaseClient,
  user: AuthUser,
): Promise<CampaignWizardOptions> {
  const teamManagerTeamIds = user.memberships
    .filter((m) => m.role === 'team_manager' && m.teamId)
    .map((m) => m.teamId as string);
  const clubAdminClubIds = user.memberships
    .filter((m) => m.role === 'club_admin' && m.clubId)
    .map((m) => m.clubId as string);

  const [clubs, teamsFromClubs, teamsFromMemberships] = await Promise.all([
    clubAdminClubIds.length > 0
      ? supabase.from('clubs').select('id, name').in('id', clubAdminClubIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    clubAdminClubIds.length > 0
      ? supabase.from('teams').select('id, name, club_id').in('club_id', clubAdminClubIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; club_id: string | null }>, error: null }),
    teamManagerTeamIds.length > 0
      ? supabase.from('teams').select('id, name, club_id').in('id', teamManagerTeamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; club_id: string | null }>, error: null }),
  ]);

  if (clubs.error) throw clubs.error;
  if (teamsFromClubs.error) throw teamsFromClubs.error;
  if (teamsFromMemberships.error) throw teamsFromMemberships.error;

  const teamsById = new Map<string, ManagedTeamOption>();
  for (const row of [...(teamsFromClubs.data ?? []), ...(teamsFromMemberships.data ?? [])]) {
    teamsById.set(row.id, { id: row.id, name: row.name, clubId: row.club_id });
  }
  const teams = [...teamsById.values()];

  const managedTeamIds = teams.map((t) => t.id);
  const { data: athleteRows, error: athletesError } =
    managedTeamIds.length > 0
      ? await supabase.from('athletes').select('id, first_name, last_name, team_id').in('team_id', managedTeamIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string; team_id: string | null }>, error: null };
  if (athletesError) throw athletesError;

  return {
    teams,
    clubs: (clubs.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    athletes: (athleteRows ?? []).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      teamId: row.team_id,
    })),
  };
}
