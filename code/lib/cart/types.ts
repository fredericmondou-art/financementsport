/**
 * Types partagés par `lib/cart/*.ts` (Tâche 1.4).
 *
 * Un panier appartient SOIT à un utilisateur connecté (`userId`), SOIT à un
 * invité identifié par un jeton de session (`sessionToken`) stocké côté
 * client (cookie) — jamais les deux à la fois côté appelant : `userId` prime
 * si présent (voir `getOrCreateCart`). Ceci reflète exactement
 * `carts.user_id`/`carts.session_token` du schéma (l'un des deux NULL).
 *
 * Important (voir `lib/auth/permissions.ts`, en-tête) : l'accès à un panier
 * INVITÉ ne passe PAS par `can()` (le système de rôles) — uniquement par la
 * correspondance du `sessionToken`. `assertCartOwnership` (dans `cart.ts`)
 * est le seul point de contrôle d'accès pour `lib/cart/*.ts`.
 */

export interface CartIdentity {
  userId: string | null;
  sessionToken: string | null;
}
