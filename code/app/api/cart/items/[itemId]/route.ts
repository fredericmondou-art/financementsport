/**
 * Route API d'une ligne de panier précise (Tâche 1.4) : mise à jour de
 * quantité, retrait. `cartId` est attendu en paramètre de requête (et non
 * dans le corps) pour rester cohérent entre PATCH et DELETE.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, getProduct } from '@/lib/catalog/products';
import { createCartDataClient, createSupabaseCartRepo, getCartForIdentity } from '@/lib/cart/cart';
import { resolveCartIdentity } from '@/lib/cart/identity';
import {
  createSupabaseCartItemsRepo,
  removeItemFromCart,
  updateCartItemQuantity,
} from '@/lib/cart/items';
import { BusinessRuleError } from '@/lib/entities/errors';
import { toErrorResponse } from '@/lib/http/api-error-response';

function requireCartId(request: NextRequest): string {
  const cartId = request.nextUrl.searchParams.get('cartId');
  if (!cartId) {
    throw new BusinessRuleError('Paramètre cartId manquant.');
  }
  return cartId;
}

const patchSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int('La quantité doit être un nombre entier.').min(1),
});

/** PATCH /api/cart/items/:itemId?cartId=... — remplace la quantité d'une
 * ligne existante. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { itemId: string } },
): Promise<NextResponse> {
  try {
    const cartId = requireCartId(request);
    const body = patchSchema.parse(await request.json());
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const user = await getCurrentUser();

    const cartClient = createCartDataClient();
    const cart = await getCartForIdentity(cartId, identity, createSupabaseCartRepo(cartClient));
    const product = await getProduct(user, body.productId, createSupabaseProductRepo(supabase));
    const item = await updateCartItemQuantity(
      cart,
      identity,
      params.itemId,
      body.quantity,
      {
        id: product.id,
        priceCents: product.price_cents,
        isActive: product.is_active,
        stockQuantity: product.stock_quantity,
      },
      createSupabaseCartItemsRepo(cartClient),
    );

    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/cart/items/:itemId?cartId=... — retire une ligne du panier. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemId: string } },
): Promise<NextResponse> {
  try {
    const cartId = requireCartId(request);
    const identity = await resolveCartIdentity();
    const cartClient = createCartDataClient();

    const cart = await getCartForIdentity(cartId, identity, createSupabaseCartRepo(cartClient));
    await removeItemFromCart(cart, identity, params.itemId, createSupabaseCartItemsRepo(cartClient));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
