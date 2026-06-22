/**
 * Route API articles du panier (Tâche 1.4). POST seulement ici (ajout) ;
 * mise à jour/retrait d'une ligne précise : `app/api/cart/items/[itemId]`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, getProduct } from '@/lib/catalog/products';
import { createCartDataClient, createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { addItemToCart, createSupabaseCartItemsRepo } from '@/lib/cart/items';
import { toErrorResponse } from '@/lib/http/api-error-response';

const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int('La quantité doit être un nombre entier.').min(1).default(1),
});

/**
 * POST /api/cart/items — ajoute un produit au panier courant (créé au
 * besoin). Le prix et le statut actif du produit sont relus depuis le
 * catalogue ici, jamais fournis par le client (CLAUDE.md section 4/5).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = addItemSchema.parse(await request.json());
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const user = await getCurrentUser();

    const product = await getProduct(user, body.productId, createSupabaseProductRepo(supabase));
    const cartClient = createCartDataClient();
    const cart = await getOrCreateCart(identity, createSupabaseCartRepo(cartClient));
    const item = await addItemToCart(
      cart,
      identity,
      {
        id: product.id,
        priceCents: product.price_cents,
        isActive: product.is_active,
        stockQuantity: product.stock_quantity,
      },
      body.quantity,
      createSupabaseCartItemsRepo(cartClient),
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
