/**
 * Test d'intégration Tâche 1.4 : panier (création/accès), articles, stock,
 * répartition entre bénéficiaires, rattachement d'un panier invité. Repos en
 * mémoire (PAS de Postgres réel), même convention que
 * `tests/integration/entities.test.ts` (réseau vers *.supabase.co bloqué
 * dans ce bac à sable). Les repos en mémoire respectent exactement les
 * interfaces `CartRepo`/`CartItemsRepo`/`CartBeneficiariesRepo`, donc ce
 * test exerce la même logique métier que le code branché sur Supabase.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertCartOwnership,
  getCartForIdentity,
  getOrCreateCart,
  type CartRepo,
  type CartRow,
} from '@/lib/cart/cart';
import {
  addItemToCart,
  removeItemFromCart,
  updateCartItemQuantity,
  type CartItemRow,
  type CartItemsRepo,
  type CartProductSnapshot,
} from '@/lib/cart/items';
import {
  setCartBeneficiarySplit,
  type CartBeneficiaryRow,
  type CartBeneficiariesRepo,
} from '@/lib/cart/beneficiaries';
import { attachGuestCartToUser } from '@/lib/cart/attach-guest-cart';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';
import type { CartIdentity } from '@/lib/cart/types';

function createFakeCartRepo(): CartRepo {
  const carts = new Map<string, CartRow>();
  return {
    async getCartById(id) {
      return carts.get(id) ?? null;
    },
    async getOpenCartForIdentity(identity) {
      const openCarts = [...carts.values()].filter((c) => c.status === 'open');
      if (identity.userId !== null) {
        return openCarts.find((c) => c.user_id === identity.userId) ?? null;
      }
      if (identity.sessionToken !== null) {
        return (
          openCarts.find((c) => c.user_id === null && c.session_token === identity.sessionToken) ?? null
        );
      }
      return null;
    },
    async insertCart(identity) {
      const id = randomUUID();
      const row: CartRow = {
        id,
        user_id: identity.userId,
        session_token: identity.userId === null ? identity.sessionToken : null,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      carts.set(id, row);
      return row;
    },
    async attachCartToUser(cartId, userId) {
      const existing = carts.get(cartId);
      if (!existing) throw new Error('panier introuvable (fake repo)');
      const updated: CartRow = {
        ...existing,
        user_id: userId,
        session_token: null,
        updated_at: new Date().toISOString(),
      };
      carts.set(cartId, updated);
      return updated;
    },
    async markCartAbandoned(cartId) {
      const existing = carts.get(cartId);
      if (!existing) throw new Error('panier introuvable (fake repo)');
      carts.set(cartId, { ...existing, status: 'abandoned', updated_at: new Date().toISOString() });
    },
    async markCartConverted(cartId) {
      const existing = carts.get(cartId);
      if (!existing) throw new Error('panier introuvable (fake repo)');
      carts.set(cartId, { ...existing, status: 'converted', updated_at: new Date().toISOString() });
    },
  };
}

function createFakeCartItemsRepo(): CartItemsRepo {
  const items = new Map<string, CartItemRow>();
  return {
    async listItems(cartId) {
      return [...items.values()].filter((item) => item.cart_id === cartId);
    },
    async insertItem(input) {
      const id = randomUUID();
      const row: CartItemRow = {
        id,
        cart_id: input.cartId,
        product_id: input.productId,
        quantity: input.quantity,
        unit_price_cents: input.unitPriceCents,
        created_at: new Date().toISOString(),
      };
      items.set(id, row);
      return row;
    },
    async updateItemQuantity(itemId, quantity) {
      const existing = items.get(itemId);
      if (!existing) throw new Error('article introuvable (fake repo)');
      const updated = { ...existing, quantity };
      items.set(itemId, updated);
      return updated;
    },
    async deleteItem(itemId) {
      items.delete(itemId);
    },
    async getItemById(id) {
      return items.get(id) ?? null;
    },
  };
}

function createFakeCartBeneficiariesRepo(): CartBeneficiariesRepo {
  const rows = new Map<string, CartBeneficiaryRow>();
  return {
    async listBeneficiaries(cartId) {
      return [...rows.values()].filter((row) => row.cart_id === cartId);
    },
    async replaceBeneficiaries(cartId, input) {
      for (const [id, row] of rows) {
        if (row.cart_id === cartId) rows.delete(id);
      }
      const inserted = input.map((row) => {
        const id = randomUUID();
        const newRow: CartBeneficiaryRow = {
          id,
          cart_id: cartId,
          beneficiary_type: row.beneficiaryType,
          beneficiary_id: row.beneficiaryId,
          campaign_id: row.campaignId,
          share_bps: row.shareBps,
        };
        rows.set(id, newRow);
        return newRow;
      });
      return inserted;
    },
  };
}

function makeProduct(overrides: Partial<CartProductSnapshot> = {}): CartProductSnapshot {
  return {
    id: overrides.id ?? randomUUID(),
    priceCents: overrides.priceCents ?? 1000,
    isActive: overrides.isActive ?? true,
    stockQuantity: overrides.stockQuantity ?? 10,
  };
}

const guestA: CartIdentity = { userId: null, sessionToken: randomUUID() };
const guestB: CartIdentity = { userId: null, sessionToken: randomUUID() };
const userIdentity: CartIdentity = { userId: randomUUID(), sessionToken: null };

describe('assertCartOwnership / getCartForIdentity — contrôle d’accès (pas de can(), voir lib/cart/cart.ts)', () => {
  it('refuse un panier connecté à un autre utilisateur (PermissionError)', async () => {
    const repo = createFakeCartRepo();
    const cart = await getOrCreateCart(userIdentity, repo);
    const autreUtilisateur: CartIdentity = { userId: randomUUID(), sessionToken: null };

    expect(() => assertCartOwnership(cart, autreUtilisateur)).toThrow(PermissionError);
    await expect(getCartForIdentity(cart.id, autreUtilisateur, repo)).rejects.toThrow(PermissionError);
  });

  it('refuse un panier invité à un autre jeton de session (PermissionError)', async () => {
    const repo = createFakeCartRepo();
    const cart = await getOrCreateCart(guestA, repo);

    expect(() => assertCartOwnership(cart, guestB)).toThrow(PermissionError);
  });

  it('lève NotFoundError pour un id de panier inexistant', async () => {
    const repo = createFakeCartRepo();
    await expect(getCartForIdentity(randomUUID(), userIdentity, repo)).rejects.toThrow(NotFoundError);
  });

  it('autorise le propriétaire exact (connecté ou invité)', async () => {
    const repo = createFakeCartRepo();
    const cartConnecte = await getOrCreateCart(userIdentity, repo);
    expect(() => assertCartOwnership(cartConnecte, userIdentity)).not.toThrow();

    const cartInvite = await getOrCreateCart(guestA, repo);
    expect(() => assertCartOwnership(cartInvite, guestA)).not.toThrow();
  });
});

describe('getOrCreateCart', () => {
  it('crée un panier au premier appel, puis retourne le même panier ouvert au second appel', async () => {
    const repo = createFakeCartRepo();
    const first = await getOrCreateCart(guestA, repo);
    const second = await getOrCreateCart(guestA, repo);
    expect(second.id).toBe(first.id);
  });

  it('refuse une identité sans utilisateur ni jeton de session', async () => {
    const repo = createFakeCartRepo();
    const identiteVide: CartIdentity = { userId: null, sessionToken: null };
    await expect(getOrCreateCart(identiteVide, repo)).rejects.toThrow(BusinessRuleError);
  });
});

describe('addItemToCart', () => {
  it('refuse un produit dont la quantité demandée dépasse le stock (BusinessRuleError)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ stockQuantity: 2 });

    await expect(addItemToCart(cart, guestA, product, 3, itemsRepo)).rejects.toThrow(BusinessRuleError);
  });

  it('refuse un produit inactif (NotFoundError, ne révèle pas qu’il a existé)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ isActive: false });

    await expect(addItemToCart(cart, guestA, product, 1, itemsRepo)).rejects.toThrow(NotFoundError);
  });

  it('additionne les quantités plutôt que de dupliquer la ligne pour un même produit', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ stockQuantity: 10 });

    await addItemToCart(cart, guestA, product, 2, itemsRepo);
    await addItemToCart(cart, guestA, product, 3, itemsRepo);

    const items = await itemsRepo.listItems(cart.id);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(5);
  });

  it('refuse d’ajouter au panier d’un autre invité (PermissionError, via assertCartOwnership)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct();

    await expect(addItemToCart(cart, guestB, product, 1, itemsRepo)).rejects.toThrow(PermissionError);
  });
});

describe('updateCartItemQuantity', () => {
  it('lève NotFoundError si l’article n’existe pas dans ce panier', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct();

    await expect(
      updateCartItemQuantity(cart, guestA, randomUUID(), 2, product, itemsRepo),
    ).rejects.toThrow(NotFoundError);
  });

  it('refuse un produit fourni qui ne correspond pas à la ligne (BusinessRuleError)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ stockQuantity: 10 });
    const item = await addItemToCart(cart, guestA, product, 1, itemsRepo);

    const autreProduit = makeProduct();
    await expect(
      updateCartItemQuantity(cart, guestA, item.id, 2, autreProduit, itemsRepo),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('refuse une quantité supérieure au stock disponible', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ stockQuantity: 5 });
    const item = await addItemToCart(cart, guestA, product, 1, itemsRepo);

    await expect(
      updateCartItemQuantity(cart, guestA, item.id, 6, product, itemsRepo),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('remplace la quantité (pas un ajout relatif)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct({ stockQuantity: 10 });
    const item = await addItemToCart(cart, guestA, product, 3, itemsRepo);

    const updated = await updateCartItemQuantity(cart, guestA, item.id, 7, product, itemsRepo);
    expect(updated.quantity).toBe(7);
  });
});

describe('removeItemFromCart', () => {
  it('retire une ligne existante', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const product = makeProduct();
    const item = await addItemToCart(cart, guestA, product, 1, itemsRepo);

    await removeItemFromCart(cart, guestA, item.id, itemsRepo);
    expect(await itemsRepo.getItemById(item.id)).toBeNull();
  });

  it('lève NotFoundError pour une ligne déjà retirée ou inexistante', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);

    await expect(removeItemFromCart(cart, guestA, randomUUID(), itemsRepo)).rejects.toThrow(NotFoundError);
  });
});

describe('setCartBeneficiarySplit — règle "SUM(share_bps) = 10000"', () => {
  it('refuse une répartition dont la somme n’atteint pas 10000 (BusinessRuleError)', async () => {
    const cartRepo = createFakeCartRepo();
    const beneficiariesRepo = createFakeCartBeneficiariesRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);

    await expect(
      setCartBeneficiarySplit(
        cart,
        guestA,
        [{ beneficiaryType: 'athlete', beneficiaryId: randomUUID(), shareBps: 4000 }],
        beneficiariesRepo,
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('enregistre une répartition valide et remplace entièrement la précédente', async () => {
    const cartRepo = createFakeCartRepo();
    const beneficiariesRepo = createFakeCartBeneficiariesRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);
    const athleteId = randomUUID();
    const teamId = randomUUID();

    await setCartBeneficiarySplit(
      cart,
      guestA,
      [{ beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 10000 }],
      beneficiariesRepo,
    );
    const remplacement = await setCartBeneficiarySplit(
      cart,
      guestA,
      [
        { beneficiaryType: 'athlete', beneficiaryId: athleteId, shareBps: 4000 },
        { beneficiaryType: 'team', beneficiaryId: teamId, shareBps: 6000 },
      ],
      beneficiariesRepo,
    );

    expect(remplacement).toHaveLength(2);
    const current = await beneficiariesRepo.listBeneficiaries(cart.id);
    expect(current).toHaveLength(2);
    expect(current.reduce((sum, row) => sum + row.share_bps, 0)).toBe(10000);
  });

  it('refuse de répartir le panier d’un autre invité (PermissionError)', async () => {
    const cartRepo = createFakeCartRepo();
    const beneficiariesRepo = createFakeCartBeneficiariesRepo();
    const cart = await getOrCreateCart(guestA, cartRepo);

    await expect(
      setCartBeneficiarySplit(
        cart,
        guestB,
        [{ beneficiaryType: 'club', beneficiaryId: randomUUID(), shareBps: 10000 }],
        beneficiariesRepo,
      ),
    ).rejects.toThrow(PermissionError);
  });
});

describe('attachGuestCartToUser — rattachement du panier invité après connexion', () => {
  it('retourne null si l’invité n’a pas de panier ouvert (cas normal, pas une erreur)', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const result = await attachGuestCartToUser(randomUUID(), randomUUID(), {
      carts: cartRepo,
      items: itemsRepo,
    });
    expect(result).toBeNull();
  });

  it('rattache simplement le panier invité quand l’utilisateur n’a pas encore de panier ouvert', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const sessionToken = randomUUID();
    const guestIdentity: CartIdentity = { userId: null, sessionToken };
    const guestCart = await getOrCreateCart(guestIdentity, cartRepo);
    const product = makeProduct({ stockQuantity: 10 });
    await addItemToCart(guestCart, guestIdentity, product, 2, itemsRepo);

    const userId = randomUUID();
    const attached = await attachGuestCartToUser(sessionToken, userId, {
      carts: cartRepo,
      items: itemsRepo,
    });

    expect(attached?.id).toBe(guestCart.id);
    expect(attached?.user_id).toBe(userId);
    expect(attached?.session_token).toBeNull();
  });

  it('fusionne les articles dans le panier existant de l’utilisateur (quantités additionnées) et abandonne le panier invité', async () => {
    const cartRepo = createFakeCartRepo();
    const itemsRepo = createFakeCartItemsRepo();
    const sessionToken = randomUUID();
    const guestIdentity: CartIdentity = { userId: null, sessionToken };
    const userId = randomUUID();
    const userIdentityLocal: CartIdentity = { userId, sessionToken: null };

    const sharedProductId = randomUUID();
    const sharedProduct = makeProduct({ id: sharedProductId, stockQuantity: 20 });
    const guestOnlyProduct = makeProduct({ stockQuantity: 20 });

    const userCart = await getOrCreateCart(userIdentityLocal, cartRepo);
    await addItemToCart(userCart, userIdentityLocal, sharedProduct, 2, itemsRepo);

    const guestCart = await getOrCreateCart(guestIdentity, cartRepo);
    await addItemToCart(guestCart, guestIdentity, sharedProduct, 3, itemsRepo);
    await addItemToCart(guestCart, guestIdentity, guestOnlyProduct, 1, itemsRepo);

    const merged = await attachGuestCartToUser(sessionToken, userId, {
      carts: cartRepo,
      items: itemsRepo,
    });

    expect(merged?.id).toBe(userCart.id);
    const finalItems = await itemsRepo.listItems(userCart.id);
    expect(finalItems).toHaveLength(2);
    expect(finalItems.find((item) => item.product_id === sharedProductId)?.quantity).toBe(5);
    expect(finalItems.find((item) => item.product_id === guestOnlyProduct.id)?.quantity).toBe(1);

    const abandonedGuestCart = await cartRepo.getCartById(guestCart.id);
    expect(abandonedGuestCart?.status).toBe('abandoned');

    // Le panier invité abandonné ne doit plus jamais être retrouvé comme
    // panier "ouvert" pour son ancien jeton de session.
    const reLookup = await cartRepo.getOpenCartForIdentity(guestIdentity);
    expect(reLookup).toBeNull();
  });
});
