/**
 * POST /api/checkout — création de la session de paiement Stripe (Tâche 1.5).
 *
 * Mince : re-valide le panier EN DIRECT (produits/stock relus depuis
 * `products`, pas depuis le panier qui peut être périmé -- CLAUDE.md
 * section 7), calcule les totaux (lib/checkout/prepare-checkout.ts +
 * lib/taxes/*), puis crée la session Stripe. AUCUNE écriture de
 * commande/crédit ici -- elle n'a lieu qu'au webhook `checkout.session.
 * completed` (CLAUDE.md section 4 : « le crédit ne se déclenche QUE sur
 * paiement confirmé par le webhook »), jamais à la création de cette
 * session.
 *
 * Décisions autonomes (voir docs/DECISIONS.md) :
 *   - Taxe calculée sur la province par défaut 'QC' (CLAUDE.md section 2),
 *     faute d'étape de saisie d'adresse de facturation dans le panier actuel.
 *   - Le panier ne porte qu'UNE campagne de contexte (Tâche 1.3/1.4) : le
 *     premier `campaign_id` non nul trouvé sur les bénéficiaires.
 *   - `team_id` (regroupement de livraison) renseigné seulement quand il n'y
 *     a qu'un seul bénéficiaire et qu'il s'agit directement d'une équipe --
 *     sinon laissé `null` (la distribution groupée multi-bénéficiaires est
 *     hors-périmètre de cette tâche, voir schéma "amorces Phase 1.5").
 *   - Métadonnées Stripe : on ne pousse que `cart_id` + identité (pas le
 *     détail des lignes/bénéficiaires, qui dépasserait vite les limites de
 *     taille des métadonnées Stripe pour un gros panier) -- le webhook
 *     relit le panier en direct par `cart_id`, avec les MÊMES prix figés
 *     (`cart_items.unit_price_cents`) que ceux affichés ici.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createCartDataClient, createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { createSupabaseCartItemsRepo, listCartItems } from '@/lib/cart/items';
import { createSupabaseCartBeneficiariesRepo, listCartBeneficiaries } from '@/lib/cart/beneficiaries';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseProductRepo } from '@/lib/catalog/products';
import { computeCheckoutTotals, validateCheckoutLines, type CheckoutLineInput } from '@/lib/checkout/prepare-checkout';
import { BusinessRuleError } from '@/lib/entities/errors';
import { toErrorResponse } from '@/lib/http/api-error-response';
import { getStripeClient } from '@/lib/payments/stripe-client';
import { createSupabaseTaxRatesRepo } from '@/lib/taxes/rates';

const DEFAULT_BILLING_PROVINCE = 'QC';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const user = await getCurrentUser();

    const cartClient = createCartDataClient();
    const cart = await getOrCreateCart(identity, createSupabaseCartRepo(cartClient));
    const [items, beneficiaries] = await Promise.all([
      listCartItems(cart, identity, createSupabaseCartItemsRepo(cartClient)),
      listCartBeneficiaries(cart, identity, createSupabaseCartBeneficiariesRepo(cartClient)),
    ]);

    if (beneficiaries.length === 0) {
      throw new BusinessRuleError('Choisissez au moins un bénéficiaire avant de procéder au paiement.');
    }
    const totalShareBps = beneficiaries.reduce((sum, b) => sum + b.share_bps, 0);
    if (totalShareBps !== 10000) {
      // Défense en profondeur (voir lib/cart/beneficiaries.ts) : la
      // répartition stockée pourrait théoriquement être devenue invalide
      // entre l'enregistrement et le paiement.
      throw new BusinessRuleError(
        `La répartition entre bénéficiaires doit totaliser 100 % ; total actuel : ${totalShareBps / 100}%.`,
      );
    }

    const productRepo = createSupabaseProductRepo(supabase);
    const liveProducts = await Promise.all(items.map((item) => productRepo.getProductById(item.product_id)));

    const lines: CheckoutLineInput[] = items.map((item, index) => {
      const product = liveProducts[index];
      if (!product) {
        throw new BusinessRuleError('Un produit de votre panier n’existe plus.');
      }
      return {
        productId: item.product_id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        isTaxable: product.is_taxable,
        isActive: product.is_active,
        stockQuantity: product.stock_quantity,
      };
    });
    validateCheckoutLines(lines);

    const taxRatesRepo = createSupabaseTaxRatesRepo(supabase);
    const taxRate = await taxRatesRepo.getApplicableRate(DEFAULT_BILLING_PROVINCE, new Date().toISOString());
    if (!taxRate) {
      throw new Error(`Aucun taux de taxe configuré pour la province ${DEFAULT_BILLING_PROVINCE}.`);
    }
    const totals = computeCheckoutTotals(lines, taxRate.rate_bps);

    const campaignId = beneficiaries.find((b) => b.campaign_id !== null)?.campaign_id ?? null;
    const teamId =
      beneficiaries.length === 1 && beneficiaries[0]!.beneficiary_type === 'team'
        ? beneficiaries[0]!.beneficiary_id
        : null;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const stripe = getStripeClient();

    const lineItems = lines.map((line) => ({
      price_data: {
        currency: 'cad',
        product_data: { name: line.productName },
        unit_amount: line.unitPriceCents,
      },
      quantity: line.quantity,
    }));
    if (totals.taxCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'cad',
          product_data: { name: 'TPS + TVQ' },
          unit_amount: totals.taxCents,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${appUrl}/commande/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/panier?erreur=${encodeURIComponent('Le paiement a été annulé.')}`,
      metadata: {
        cart_id: cart.id,
        identity_type: user ? 'user' : 'guest',
        identity_value: user?.id ?? identity.sessionToken ?? '',
        campaign_id: campaignId ?? '',
        team_id: teamId ?? '',
      },
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    return toErrorResponse(error);
  }
}
