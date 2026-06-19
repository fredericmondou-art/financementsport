/**
 * Récupère l'utilisateur authentifié (et son profil/rôle/memberships) côté
 * serveur, pour usage par `lib/auth/permissions.ts`.
 *
 * Règle CLAUDE.md section 9 : ne doit JAMAIS lever d'exception ni bloquer un
 * parcours invité. Retourne `null` si personne n'est connecté — c'est un
 * état normal, pas une erreur.
 */
import { createSupabaseServerClient } from './supabase-server';
import type { AuthUser, Membership, UserRole } from './permissions';

interface ProfileRow {
  id: string;
  role: UserRole;
}

interface MembershipRow {
  role: 'team_manager' | 'club_admin';
  club_id: string | null;
  team_id: string | null;
}

/**
 * Retourne l'utilisateur courant + son rôle + ses memberships, ou `null` si
 * personne n'est connecté (visiteur / achat invité).
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createSupabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', authData.user.id)
    .single<ProfileRow>();

  if (profileError || !profile) {
    // Compte auth.users existe mais pas encore de profil (ex. trigger pas
    // encore exécuté) — on traite comme non authentifié plutôt que de
    // planter, pour ne jamais bloquer un parcours.
    return null;
  }

  const { data: membershipRows } = await supabase
    .from('memberships')
    .select('role, club_id, team_id')
    .eq('user_id', profile.id);

  const memberships: Membership[] = (membershipRows ?? []).map((m: MembershipRow) => ({
    role: m.role,
    clubId: m.club_id,
    teamId: m.team_id,
  }));

  return {
    id: profile.id,
    role: profile.role,
    memberships,
  };
}
