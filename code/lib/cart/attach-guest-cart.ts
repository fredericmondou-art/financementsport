/**
 * Rattachement d'un panier invité à un compte après connexion (Tâche 1.4,
 * règle explicite du cahier : "Panier invité rattachable à un compte après
 * connexion.").
 *
 * Prend uniquement le jeton de session invité (cookie déjà posé par
 * `lib/cart/identity.ts` avant la connexion) — pas besoin que l'appelant
 * connaisse l'id du panier : on retrouve le panier `open` correspondant au
 * jeton nous-mêmes. Ça permet d'appeler cette fonction automatiquement
 * depuis `loginAction` (app/(auth)/login/actions.ts) sans plomberie
 * supplémentaire côté formulaire de connexion.
 *
 * Décisions autonomes (voir docs/DECISIONS.md) :
 * - Si l'invité n'a pas de panier `open` (jamais rien ajouté), ne fait rien
 *   -- pas une erreur, juste un cas courant (la plupart des connexions
 *   n'ont pas de panier invité à rattacher).
 * - Si l'utilisateur n'a pas encore de panier `open`, on rattache simplement
 *   le panier invité (changement de `user_id`, plus de `session_token`).
 * - S'il a déjà un panier `open` (ex. déjà ajouté des articles une fois
 *   connecté sur un autre appareil), on FUSIONNE les lignes du panier invité
 *   dans le panier existant de l'utilisateur (quantités additionnées pour un
 *   même produit) et on abandonne le panier invité — pas deux paniers `open`
 *   simultanés pour la même identité.
 * - La répartition entre bénéficiaires N'EST PAS fusionnée : celle déjà
 *   présente sur le panier de l'utilisateur (s'il y en avait une) est
 *   conservée inchangée. Fusionner deux répartitions en pourcentages
 *   provenant de paniers distincts n'a pas de résultat "correct" évident ;
 *   on préfère laisser l'utilisateur reconfirmer sa répartition plutôt que
 *   d'inventer une règle de fusion arbitraire touchant à l'argent (CLAUDE.md
 *   section 9 : prudence dès qu'un choix touche l'argent).
 */
import type { CartRepo, CartRow } from './cart';
import type { CartItemsRepo } from './items';

export interface AttachGuestCartRepos {
  carts: CartRepo;
  items: CartItemsRepo;
}

/** `null` si l'invité n'avait pas de panier `open` à rattacher (cas normal,
 * pas une erreur). */
export async function attachGuestCartToUser(
  guestSessionToken: string,
  userId: string,
  repos: AttachGuestCartRepos,
): Promise<CartRow | null> {
  const guestCart = await repos.carts.getOpenCartForIdentity({
    userId: null,
    sessionToken: guestSessionToken,
  });
  if (!guestCart) {
    return null;
  }

  const existingUserCart = await repos.carts.getOpenCartForIdentity({
    userId,
    sessionToken: null,
  });

  if (!existingUserCart) {
    return repos.carts.attachCartToUser(guestCart.id, userId);
  }

  const [guestItems, userItems] = await Promise.all([
    repos.items.listItems(guestCart.id),
    repos.items.listItems(existingUserCart.id),
  ]);

  for (const guestItem of guestItems) {
    const matching = userItems.find((item) => item.product_id === guestItem.product_id);
    if (matching) {
      await repos.items.updateItemQuantity(matching.id, matching.quantity + guestItem.quantity);
    } else {
      await repos.items.insertItem({
        cartId: existingUserCart.id,
        productId: guestItem.product_id,
        quantity: guestItem.quantity,
        unitPriceCents: guestItem.unit_price_cents,
      });
    }
  }

  await repos.carts.markCartAbandoned(guestCart.id);
  return existingUserCart;
}
