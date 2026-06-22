/**
 * Route API répartition entre bénéficiaires (Tâche 1.4). PUT remplace
 * l'intégralité de la répartition (cohérent avec `CartBeneficiariesRepo.
 * replaceBeneficiaries`) ; la validation "somme = 100 %" est faite par
 * `setCartBeneficiarySplit` (lib/cart/beneficiaries.ts), jamais dupliquée
 * ici (CLAUDE.md section 6).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseCartBeneficiariesRepo, setCartBeneficiarySplit } from '@/lib/cart/beneficiaries';
import { createCartDataClient, createSupabaseCartRepo, getCartForIdentity } from '@/lib/cart/cart';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { toErrorResponse } from '@/lib/http/api-error-response';

const bodySchema = z.object({
  cartId: z.string().uuid(),
  // Détail validé par `beneficiarySplitInputSchema`, déjà appelé dans
  // `setCartBeneficiarySplit` -- pas de double validation ici.
  split: z.unknown(),
});

/** PUT /api/cart/beneficiaries — remplace la répartition du panier
 * `cartId`. Refuse (400) si `SUM(shareBps) !== 10000`. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = bodySchema.parse(await request.json());
    const identity = await resolveCartIdentity();
    const cartClient = createCartDataClient();

    const cart = await getCartForIdentity(body.cartId, identity, createSupabaseCartRepo(cartClient));
    const beneficiaries = await setCartBeneficiarySplit(
      cart,
      identity,
      body.split,
      createSupabaseCartBeneficiariesRepo(cartClient),
    );

    return NextResponse.json({ beneficiaries });
  } catch (error) {
    return toErrorResponse(error);
  }
}
