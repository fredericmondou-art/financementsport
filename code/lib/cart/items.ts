/**
 * Articles du panier (Tâche 1.4) : ajout, retrait, mise à jour de quantité.
 *
 * Sécurité (CLAUDE.md section 4/5) : le prix unitaire (`unitPriceCents`)
 * n'est JAMAIS fourni par le client. L'appelant (route/page) doit charger le
 * produit via `lib/catalog/products.ts` (`getProduct`, qui respecte déjà
 * `is_active`) et passer un `CartProductSnapshot` — ce module fige ensuite ce
 * prix sur la ligne (`cart_items.unit_price_cents`), exactement comme
 * `order_items` le fera à la Tâche 1.5. Un prix modifié après coup au
 * catalogue ne change donc pas rétroactivement une ligne déjà en panier.
 *
 * Gestion du cas limite "stock épuisé" (CLAUDE.md section 7) : refusé ici,
 * avant même d'arriver au paiement.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CartItemsTable } from '@/lib/db/types';
import { BusinessRuleError, NotFoundError } from '@/lib/entities/errors';
import { assertCartOwnership, type CartRow } from './cart';
import type { CartIdentity } from './types';

export type CartItemRow = CartItemsTable['Row'];

/** Instantané du produit au moment de l'ajout, chargé par l'appelant via
 * `lib/catalog/products.ts` — ce module ne fait pas confiance à un prix ou
 * un statut fournis directement par le client. */
export interface CartProductSnapshot {
  id: string;
  priceCents: number;
  isActive: boolean;
  stockQuantity: number;
}

/** Accès aux données `cart_items`, injecté (voir `CartRepo`). */
export interface CartItemsRepo {
  listItems(cartId: string): Promise<CartItemRow[]>;
  insertItem(input: {
    cartId: string;
    productId: string;
    quantity: number;
    unitPriceCents: number;
  }): Promise<CartItemRow>;
  updateItemQuantity(itemId: string, quantity: number): Promise<CartItemRow>;
  deleteItem(itemId: string): Promise<void>;
  getItemById(id: string): Promise<CartItemRow | null>;
}

export function createSupabaseCartItemsRepo(supabase: SupabaseClient): CartItemsRepo {
  return {
    async listItems(cartId) {
      const { data, error } = await supabase.from('cart_items').select('*').eq('cart_id', cartId);
      if (error) throw error;
      return (data as CartItemRow[]) ?? [];
    },
    async insertItem(input) {
      const { data, error } = await supabase
        .from('cart_items')
        .insert({
          cart_id: input.cartId,
          product_id: input.productId,
          quantity: input.quantity,
          unit_price_cents: input.unitPriceCents,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CartItemRow;
    },
    async updateItemQuantity(itemId, quantity) {
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', itemId)
        .select()
        .single();
      if (error) throw error;
      return data as CartItemRow;
    },
    async deleteItem(itemId) {
      const { error } = await supabase.from('cart_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    async getItemById(id) {
      const { data, error } = await supabase.from('cart_items').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as CartItemRow) ?? null;
    },
  };
}

function assertPositiveIntegerQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BusinessRuleError('La quantité doit être un nombre entier positif.');
  }
}

/**
 * Ajoute un produit au panier. Si une ligne existe déjà pour ce produit,
 * additionne les quantités plutôt que de dupliquer la ligne (comportement
 * standard d'un panier e-commerce — décision autonome, voir
 * docs/DECISIONS.md).
 */
export async function addItemToCart(
  cart: CartRow,
  identity: CartIdentity,
  product: CartProductSnapshot,
  quantity: number,
  repo: CartItemsRepo,
): Promise<CartItemRow> {
  assertCartOwnership(cart, identity);
  assertPositiveIntegerQuantity(quantity);
  if (!product.isActive) {
    // Cohérent avec `getProduct` (lib/catalog/products.ts) : on ne révèle pas
    // qu'un produit retiré du catalogue existait.
    throw new NotFoundError('Produit introuvable.');
  }

  const items = await repo.listItems(cart.id);
  const existing = items.find((item) => item.product_id === product.id);
  const desiredTotalQuantity = (existing?.quantity ?? 0) + quantity;

  if (desiredTotalQuantity > product.stockQuantity) {
    throw new BusinessRuleError('Stock insuffisant pour la quantité demandée.');
  }

  if (existing) {
    return repo.updateItemQuantity(existing.id, desiredTotalQuantity);
  }
  return repo.insertItem({
    cartId: cart.id,
    productId: product.id,
    quantity,
    unitPriceCents: product.priceCents,
  });
}

/** Remplace la quantité d'une ligne existante (pas un ajout relatif — voir
 * `addItemToCart` pour additionner). */
export async function updateCartItemQuantity(
  cart: CartRow,
  identity: CartIdentity,
  itemId: string,
  quantity: number,
  product: CartProductSnapshot,
  repo: CartItemsRepo,
): Promise<CartItemRow> {
  assertCartOwnership(cart, identity);
  assertPositiveIntegerQuantity(quantity);

  const item = await repo.getItemById(itemId);
  if (!item || item.cart_id !== cart.id) {
    throw new NotFoundError('Article introuvable dans ce panier.');
  }
  if (item.product_id !== product.id) {
    throw new BusinessRuleError('Le produit fourni ne correspond pas à cette ligne de panier.');
  }
  if (quantity > product.stockQuantity) {
    throw new BusinessRuleError('Stock insuffisant pour la quantité demandée.');
  }

  return repo.updateItemQuantity(itemId, quantity);
}

export async function removeItemFromCart(
  cart: CartRow,
  identity: CartIdentity,
  itemId: string,
  repo: CartItemsRepo,
): Promise<void> {
  assertCartOwnership(cart, identity);
  const item = await repo.getItemById(itemId);
  if (!item || item.cart_id !== cart.id) {
    throw new NotFoundError('Article introuvable dans ce panier.');
  }
  await repo.deleteItem(itemId);
}

export async function listCartItems(
  cart: CartRow,
  identity: CartIdentity,
  repo: CartItemsRepo,
): Promise<CartItemRow[]> {
  assertCartOwnership(cart, identity);
  return repo.listItems(cart.id);
}
