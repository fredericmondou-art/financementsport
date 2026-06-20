/**
 * Système de permissions par rôle — fonction PURE, aucune I/O.
 *
 * Vérifiée CÔTÉ SERVEUR uniquement (Server Components, Route Handlers,
 * Server Actions). Ne jamais faire confiance à une vérification UI seule
 * (CLAUDE.md section 5).
 *
 * Rôles : voir `user_role` dans le schéma (01-schema-base-de-donnees.sql).
 * `platform_admin` a toujours accès total (court-circuite les autres règles).
 * Toute combinaison (rôle, action, ressource) non listée explicitement est
 * REFUSÉE par défaut (deny-by-default) — voir le `return false` final de
 * chaque branche.
 */

export type UserRole =
  | 'client'
  | 'athlete'
  | 'team_manager'
  | 'club_admin'
  | 'platform_admin'
  | 'support'
  | 'logistics'
  | 'accounting';

export type Action = 'read' | 'create' | 'update' | 'delete';

/** Un "membership" donne à un utilisateur un rôle contextuel sur un club et/ou
 * une équipe précise (voir table `memberships`). */
export interface Membership {
  role: 'team_manager' | 'club_admin';
  clubId: string | null;
  teamId: string | null;
}

/** Représentation minimale de l'utilisateur authentifié nécessaire pour
 * évaluer les permissions. `null` = visiteur non authentifié (achat invité —
 * voir CLAUDE.md section 9 : l'auth ne doit jamais bloquer ce parcours, donc
 * `can(null, ...)` doit rester défini et ne jamais lever d'exception). */
export interface AuthUser {
  id: string;
  role: UserRole;
  memberships: Membership[];
}

export type Resource =
  | { type: 'order'; ownerId: string | null }
  | { type: 'cart'; ownerId: string | null }
  | { type: 'address'; ownerId: string }
  | { type: 'campaign'; clubId: string | null; teamId: string | null }
  | { type: 'product' }
  | { type: 'credit_rule' }
  | { type: 'payout' }
  // Tâche 1.1 — `id: null` signifie "pas encore créé" (vérification au
  // moment du `create`, avant qu'un id existe).
  | { type: 'club'; id: string | null }
  | { type: 'team'; id: string | null; clubId: string | null }
  | {
      type: 'athlete';
      id: string | null;
      teamId: string | null;
      clubId: string | null;
      guardianId: string | null;
      athleteUserId: string | null;
    };

function hasMembershipScope(
  user: AuthUser,
  scopeRole: 'team_manager' | 'club_admin',
  clubId: string | null,
  teamId: string | null,
): boolean {
  return user.memberships.some((m) => {
    if (m.role !== scopeRole) return false;
    if (m.teamId && teamId && m.teamId === teamId) return true;
    if (m.clubId && clubId && m.clubId === clubId) return true;
    return false;
  });
}

/**
 * `can(user, action, resource)` — true si l'action est autorisée.
 *
 * `user === null` représente un visiteur invité : autorisé uniquement pour
 * les actions explicitement ouvertes au public (aucune pour l'instant dans
 * cette matrice — le panier invité passe par un identifiant de session géré
 * ailleurs, pas par ce système de rôles).
 */
export function can(user: AuthUser | null, action: Action, resource: Resource): boolean {
  if (!user) {
    return false;
  }

  // platform_admin : accès total, toujours.
  if (user.role === 'platform_admin') {
    return true;
  }

  switch (resource.type) {
    case 'order':
    case 'cart':
      // Le client (et tout rôle) lit/modifie ses propres commandes et
      // paniers. Personne d'autre que platform_admin (déjà court-circuité
      // ci-dessus) n'a accès aux commandes d'un autre utilisateur ici.
      return resource.ownerId !== null && resource.ownerId === user.id;

    case 'address':
      return resource.ownerId === user.id;

    case 'campaign':
      if (action === 'read' || action === 'update' || action === 'create') {
        if (user.role === 'team_manager') {
          return hasMembershipScope(user, 'team_manager', resource.clubId, resource.teamId);
        }
        if (user.role === 'club_admin') {
          return hasMembershipScope(user, 'club_admin', resource.clubId, resource.teamId);
        }
      }
      return false;

    case 'product':
      // Seul platform_admin écrit ou lit les produits via ce système de
      // permissions (la lecture publique du catalogue passe par une vue
      // publique, pas par ce contrôle — voir Tâche 1.2).
      return false;

    case 'credit_rule':
    case 'payout':
      // Réservé à platform_admin (déjà court-circuité) et, pour les
      // versements, à `accounting` en lecture (préparation Tâche 1.5+).
      if (resource.type === 'payout' && user.role === 'accounting' && action === 'read') {
        return true;
      }
      return false;

    case 'club':
      // Aligné EXACTEMENT sur les policies RLS déjà déployées (migration
      // 0003) : `clubs_insert_admin` (platform_admin uniquement, pas
      // d'auto-service — un club est créé par l'admin, qui assigne ensuite
      // un club_admin via `memberships`, écriture elle-même réservée à
      // platform_admin par `memberships_write_admin`). Voir
      // docs/DECISIONS.md (Tâche 1.1) : une première version de ce fichier
      // permettait l'auto-création par n'importe quel utilisateur, corrigée
      // après relecture du schéma RLS réellement déployé.
      if (action === 'create') {
        return false;
      }
      if (action === 'read' || action === 'update') {
        // `clubs_select` / `clubs_update_scoped` : platform_admin (déjà
        // court-circuité) OU club_admin scopé sur ce club.
        return hasMembershipScope(user, 'club_admin', resource.id, null);
      }
      // delete : `clubs_delete_admin` = platform_admin uniquement.
      return false;

    case 'team':
      if (action === 'create') {
        // `teams_insert` : platform_admin OU club_admin du club visé.
        // `manages_club(NULL)` vaut toujours faux côté RLS : une équipe
        // indépendante (`clubId === null`) ne peut être créée que par
        // platform_admin.
        if (resource.clubId === null) {
          return false;
        }
        return hasMembershipScope(user, 'club_admin', resource.clubId, null);
      }
      if (action === 'read' || action === 'update') {
        // `teams_select` / `teams_update` : club_admin du club OU
        // team_manager de cette équipe précise.
        return (
          hasMembershipScope(user, 'team_manager', null, resource.id) ||
          hasMembershipScope(user, 'club_admin', resource.clubId, null)
        );
      }
      // delete : `teams_delete` = platform_admin OU club_admin (PAS
      // team_manager — un gérant ne peut pas supprimer sa propre équipe).
      return hasMembershipScope(user, 'club_admin', resource.clubId, null);

    case 'athlete':
      if (action === 'create') {
        // `athletes_insert` : platform_admin OU `guardian_id = auth.uid()`
        // OU `manages_team(team_id)` (team_manager DIRECT de l'équipe
        // visée — PAS de cascade club_admin à l'insertion, contrairement à
        // la lecture/mise à jour ci-dessous).
        if (resource.guardianId === user.id) {
          return true;
        }
        return hasMembershipScope(user, 'team_manager', null, resource.teamId);
      }
      if (action === 'read' || action === 'update' || action === 'delete') {
        // `athletes_select` / `_update` / `_delete` via `manages_athlete` :
        // guardian, athlète majeur lui-même, team_manager direct, OU
        // club_admin (cascade via le club de l'équipe).
        if (resource.guardianId === user.id || resource.athleteUserId === user.id) {
          return true;
        }
        return (
          hasMembershipScope(user, 'team_manager', null, resource.teamId) ||
          hasMembershipScope(user, 'club_admin', resource.clubId, null)
        );
      }
      return false;

    default:
      return false;
  }
}

/**
 * Règle spécifique Tâche 1.1 : les champs `hide_*` d'un athlète (contrôles
 * de confidentialité d'un mineur) ne sont modifiables QUE par son
 * parent/tuteur (`guardian_id`), par l'athlète lui-même s'il est majeur et
 * gère son propre profil (`user_id`), ou par `platform_admin`. À la
 * différence de `can()` pour `athlete`/`update`, un `team_manager` ou
 * `club_admin` scopé sur l'équipe N'A PAS ce droit — ces champs touchent à
 * la confidentialité des données d'un mineur (CLAUDE.md section 2 et 5), pas
 * à la gestion d'effectif ordinaire.
 */
export function canEditHiddenAthleteFields(
  user: AuthUser | null,
  athlete: { guardianId: string | null; athleteUserId: string | null },
): boolean {
  if (!user) {
    return false;
  }
  if (user.role === 'platform_admin') {
    return true;
  }
  return athlete.guardianId === user.id || athlete.athleteUserId === user.id;
}
