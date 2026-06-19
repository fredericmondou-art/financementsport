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
  | { type: 'payout' };

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

    default:
      return false;
  }
}
