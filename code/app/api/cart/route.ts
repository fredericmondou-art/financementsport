/**
 * Route API panier (Tâche 1.4). Mince : résolution de l'identité (connecté
 * ou invité) + délégation à `lib/cart/*.ts` (CLAUDE.md section 6).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseCartBeneficiariesRepo, listCartBeneficiaries } from '@/lib/cart/beneficiaries';
import { createCartDataClient, createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { loadCartCreditContext } from '@/lib/cart/credit-context';
import { estimateCartCredit } from '@/lib/cart/estimate-credit';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseCartItemsRepo, listCartItems } from '@/lib/cart/items';
import { toErrorResponse } from '@/lib/http/api-error-response';

/**
 * GET /api/cart?campaignId=... — panier courant (créé au besoin), ses
 * articles, sa répartition entre bénéficiaires et le crédit estimé (moteur
 * de la Tâche 1.3, jamais recalculé ici). `campaignId` est optionnel : achat
 * boutique permanent si absent.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();

    const cartClient = createCartDataClient();
    const cart = await getOrCreateCart(identity, createSupabaseCartRepo(cartClient));
    const [items, beneficiaries] = await Promise.all([
      listCartItems(cart, identity, createSupabaseCartItemsRepo(cartClient)),
      listCartBeneficiaries(cart, identity, createSupabaseCartBeneficiariesRepo(cartClient)),
    ]);

    const campaignId = request.nextUrl.searchParams.get('campaignId');
    const creditContext = await loadCartCreditContext(
      supabase,
      items.map((item) => item.product_id),
      campaignId,
    );
    const creditEstimate = estimateCartCredit({
      items,
      beneficiaries,
      productCreditInfoById: creditContext.productCreditInfoById,
      campaignId,
      isCampaignActive: creditContext.isCampaignActive,
      rules: creditContext.rules,
    });

    return NextResponse.json({ cart, items, beneficiaries, creditEstimate });
  } catch (error) {
    return toErrorResponse(error);
  }
}
