/**
 * POST /api/webhooks/stripe — traitement idempotent du paiement confirmé
 * (Tâche 1.5 — CŒUR). C'est le SEUL endroit où une commande/un crédit est
 * écrit (CLAUDE.md section 4 : « le crédit ne se déclenche QUE sur paiement
 * confirmé par le webhook Stripe, jamais à la soumission du formulaire »).
 *
 * Sécurité : signature Stripe vérifiée sur le corps BRUT de la requête
 * (`request.text()`, jamais `request.json()` -- une requête reformatée ne
 * correspondrait plus à la signature). `STRIPE_WEBHOOK_SECRET` lu uniquement
 * depuis l'environnement (CLAUDE.md section 5).
 *
 * Aucune session utilisateur ici (requête serveur-à-serveur Stripe) : tout
 * l'accès DB passe par `createSupabaseServiceClient()` (contourne RLS), et le
 * panier est relu via les repos bas niveau (`repo.getCartById`,
 * `repo.listItems`, `repo.listBeneficiaries`) plutôt que les wrappers
 * `listCartItems`/`listCartBeneficiaries` de la Tâche 1.4 -- ces wrappers
 * exigent une `CartIdentity` de requête utilisateur qui n'existe pas dans un
 * contexte webhook ; le contexte serveur de confiance remplace ce contrôle
 * (décision autonome, voir docs/DECISIONS.md).
 *
 * Re-validation EN DIRECT (mêmes règles que app/api/checkout/route.ts,
 * volontairement dupliquées plutôt que fiées aux métadonnées Stripe -- le
 * panier ou le stock peuvent avoir changé entre la création de la session et
 * la confirmation du paiement) : répartition à 100 %, produits actifs/stock
 * suffisant, taxe province par défaut QC.
 *
 * Idempotence : `createPaidOrder` (lib/orders/create-order.ts) délègue la
 * déduplication à la fonction Postgres `create_paid_order` (migration 0006,
 * `ON CONFLICT (stripe_event_id) DO NOTHING`) -- aucune vérification
 * préalable ici (fenêtre de course). Un évènement Stripe rejoué renvoie donc
 * simplement la commande déjà créée.
 *
 * Courriel de confirmation : un échec d'envoi ne doit JAMAIS faire échouer
 * cette réponse (la commande/les crédits sont déjà écrits, le paiement déjà
 * encaissé) -- voir lib/email/send-order-confirmation.ts.
 *
 * Codes de réponse : 400 pour une signature invalide (Stripe n'a pas à
 * réessayer) ; 200 pour tout évènement traité OU ignoré (type non géré,
 * paiement non confirmé) ; 500 pour une erreur de traitement inattendue
 * APRÈS vérification de signature -- Stripe réessaiera, ce qui est sûr et
 * souhaitable grâce à l'idempotence ci-dessus.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseServiceClient } from '@/lib/db/client';
import { createSupabaseCartRepo } from '@/lib/cart/cart';
import { createSupabaseCartItemsRepo } from '@/lib/cart/items';
import { createSupabaseCartBeneficiariesRepo } from '@/lib/cart/beneficiaries';
import { createSupabaseProductRepo } from '@/lib/catalog/products';
import { computeCheckoutTotals, validateCheckoutLines, type CheckoutLineInput } from '@/lib/checkout/prepare-checkout';
import { getStripeClient } from '@/lib/payments/stripe-client';
import { createSupabaseTaxRatesRepo } from '@/lib/taxes/rates';
import { loadCartCreditContext } from '@/lib/cart/credit-context';
import { calculateOrderCredits, type CreditLineInput } from '@/lib/credits/calculate';
import { buildOrderCreditInserts } from '@/lib/credits/persist';
import { createPaidOrder, type OrderItemInsertPayload } from '@/lib/orders/create-order';
import { loadBeneficiaryLabels, beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';
import { sendOrderConfirmationEmail } from '@/lib/email/send-order-confirmation';
import { logger } from '@/lib/logger/logger';

const DEFAULT_BILLING_PROVINCE = 'QC';

/** Évènements pour lesquels une commande doit être créée. Les autres types
 * reçus sur cet endpoint (ex. `payment_intent.created`) sont simplement
 * acquittés (200) sans traitement -- Stripe envoie tous les évènements
 * abonnés, pas seulement ceux pertinents pour ce module. */
const HANDLED_EVENT_TYPES = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    logger.error('Signature Stripe ou STRIPE_WEBHOOK_SECRET manquant.');
    return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    logger.error('Signature Stripe invalide.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== 'paid') {
    // Cas limite "paiement échoué" (CLAUDE.md section 7) : rien à faire, le
    // panier reste ouvert -- le client pourra retenter le paiement.
    return NextResponse.json({ received: true });
  }

  const cartId = session.metadata?.cart_id;
  if (!cartId) {
    logger.error('Évènement Stripe sans cart_id en métadonnées -- ignoré.', { eventId: event.id });
    return NextResponse.json({ received: true });
  }

  try {
    const supabase = createSupabaseServiceClient();

    const cartRepo = createSupabaseCartRepo(supabase);
    const itemsRepo = createSupabaseCartItemsRepo(supabase);
    const beneficiariesRepo = createSupabaseCartBeneficiariesRepo(supabase);

    const cart = await cartRepo.getCartById(cartId);
    if (!cart) {
      logger.error('Panier introuvable pour un évènement Stripe payé -- ignoré.', {
        eventId: event.id,
        cartId,
      });
      return NextResponse.json({ received: true });
    }

    const [items, beneficiaries] = await Promise.all([
      itemsRepo.listItems(cart.id),
      beneficiariesRepo.listBeneficiaries(cart.id),
    ]);

    if (beneficiaries.length === 0) {
      throw new Error(`Panier ${cart.id} sans bénéficiaire au moment du paiement confirmé.`);
    }
    const totalShareBps = beneficiaries.reduce((sum, b) => sum + b.share_bps, 0);
    if (totalShareBps !== 10000) {
      throw new Error(
        `Panier ${cart.id} : répartition entre bénéficiaires invalide au paiement (total ${totalShareBps}).`,
      );
    }

    const productRepo = createSupabaseProductRepo(supabase);
    const liveProducts = await Promise.all(items.map((item) => productRepo.getProductById(item.product_id)));

    const lines: CheckoutLineInput[] = items.map((item, index) => {
      const product = liveProducts[index];
      if (!product) {
        throw new Error(`Produit ${item.product_id} introuvable au paiement confirmé (panier ${cart.id}).`);
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
    // Note : un produit retiré/en rupture après la création de la session de
    // paiement (mais avant sa confirmation) est un cas limite réel (CLAUDE.md
    // section 7). On ne bloque PAS le webhook dans ce cas précis -- le client
    // a déjà payé via Stripe -- mais on journalise pour suivi admin plutôt
    // que de lever une erreur qui ferait échouer indéfiniment cet évènement.
    try {
      validateCheckoutLines(lines);
    } catch (validationError) {
      logger.error(
        'Panier devenu invalide entre la session Stripe et sa confirmation (commande créée quand même).',
        {
          eventId: event.id,
          cartId: cart.id,
          error: validationError instanceof Error ? validationError.message : String(validationError),
        },
      );
    }

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

    const productIds = items.map((item) => item.product_id);
    const creditContext = await loadCartCreditContext(supabase, productIds, campaignId);

    const creditLines: CreditLineInput[] = items.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      fixedCreditCents: creditContext.productCreditInfoById.get(item.product_id)?.fixedCreditCents ?? null,
    }));

    const creditResult = calculateOrderCredits({
      lines: creditLines,
      campaignId,
      isCampaignActive: creditContext.isCampaignActive,
      rules: creditContext.rules,
      beneficiaries: beneficiaries.map((b) => ({
        beneficiaryType: b.beneficiary_type,
        beneficiaryId: b.beneficiary_id,
        shareBps: b.share_bps,
      })),
    });

    const creditInserts = buildOrderCreditInserts(
      creditResult.lineCredits,
      creditResult.beneficiaryCredits,
      campaignId,
      creditContext.isCampaignActive,
    );

    const orderItemInserts: OrderItemInsertPayload[] = lines.map((line) => ({
      product_id: line.productId,
      product_name: line.productName,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      line_total_cents: line.unitPriceCents * line.quantity,
    }));

    const identityType = session.metadata?.identity_type ?? 'guest';
    const userId = identityType === 'user' ? session.metadata?.identity_value ?? null : null;
    const guestEmail = userId === null ? session.customer_details?.email ?? null : null;
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? '';

    const order = await createPaidOrder(supabase, {
      stripeEventId: event.id,
      stripeEventType: event.type,
      stripePaymentIntentId: paymentIntentId,
      userId,
      guestEmail,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      shippingCents: totals.shippingCents,
      totalCents: totals.totalCents,
      shippingAddressId: null,
      primaryCampaignId: campaignId,
      teamId,
      items: orderItemInserts,
      credits: creditInserts,
      eventPayload: event,
    });

    // Le panier ayant abouti à une commande payée n'est plus "ouvert" --
    // évite qu'il réapparaisse comme panier actif de l'identité.
    await cartRepo.markCartConverted(cart.id).catch((error) => {
      logger.error('Échec de la clôture du panier après paiement (non bloquant).', {
        cartId: cart.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const recipientEmail = guestEmail ?? session.customer_details?.email ?? null;
    if (recipientEmail) {
      const labels = await loadBeneficiaryLabels(
        supabase,
        creditResult.beneficiaryCredits.map((b) => ({
          beneficiaryType: b.beneficiaryType,
          beneficiaryId: b.beneficiaryId,
        })),
      );
      await sendOrderConfirmationEmail(supabase, {
        recipientEmail,
        orderId: order.id,
        orderNumber: order.order_number,
        items: orderItemInserts.map((item) => ({
          productName: item.product_name,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          lineTotalCents: item.line_total_cents,
        })),
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        shippingCents: totals.shippingCents,
        totalCents: totals.totalCents,
        beneficiaryCredits: creditResult.beneficiaryCredits.map((credit) => ({
          label:
            labels.get(beneficiaryLabelKey(credit.beneficiaryType, credit.beneficiaryId)) ?? 'bénéficiaire',
          amountCents: credit.amountCents,
        })),
      });
    } else {
      logger.error('Aucun courriel destinataire disponible pour la confirmation de commande.', {
        orderId: order.id,
      });
    }

    return NextResponse.json({ received: true, orderId: order.id });
  } catch (error) {
    logger.error('Échec du traitement du webhook Stripe.', {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // 500 volontaire : Stripe réessaiera l'évènement, ce qui est sûr grâce à
    // l'idempotence de create_paid_order (CLAUDE.md section 4).
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
