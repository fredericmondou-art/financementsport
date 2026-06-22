/**
 * POST /api/checkout — création de la session de paiement Stripe (Tâche 1.5).
 *
 * Route mince : toute l'orchestration vit désormais dans
 * `lib/checkout/create-checkout-session.ts` (extraite à la Tâche 1.4.6 pour
 * être partagée avec la Server Action `checkoutAction` du panier --
 * CLAUDE.md section 6, « logique métier dans lib/, pas dans les routes »).
 * Cette route reste exposée pour compatibilité (ex. appels programmatiques),
 * mais le parcours d'achat public passe par le bouton "Procéder au
 * paiement" de `/panier`, qui appelle la même fonction directement.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createCheckoutSession } from '@/lib/checkout/create-checkout-session';
import { toErrorResponse } from '@/lib/http/api-error-response';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const { checkoutUrl } = await createCheckoutSession();
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    return toErrorResponse(error);
  }
}
