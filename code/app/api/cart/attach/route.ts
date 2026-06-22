/**
 * Route API de rattachement d'un panier invité après connexion (Tâche 1.4).
 * En pratique, ce rattachement est déjà déclenché automatiquement par
 * `loginAction` (app/(auth)/login/actions.ts) ; cette route existe pour les
 * cas où la connexion a lieu par un autre chemin (ex. callback OAuth futur)
 * et doit pouvoir déclencher le même rattachement explicitement.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { attachGuestCartToUser } from '@/lib/cart/attach-guest-cart';
import { createCartDataClient, createSupabaseCartRepo } from '@/lib/cart/cart';
import { getExistingGuestSessionToken } from '@/lib/cart/identity';
import { createSupabaseCartItemsRepo } from '@/lib/cart/items';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }

  try {
    const guestSessionToken = getExistingGuestSessionToken();
    if (!guestSessionToken) {
      return NextResponse.json({ cart: null });
    }

    const cartClient = createCartDataClient();
    const cart = await attachGuestCartToUser(guestSessionToken, user.id, {
      carts: createSupabaseCartRepo(cartClient),
      items: createSupabaseCartItemsRepo(cartClient),
    });

    return NextResponse.json({ cart });
  } catch (error) {
    return toErrorResponse(error);
  }
}
