/**
 * Orchestration de la création de session Stripe Checkout (Tâche 1.5).
 *
 * Extraite à la Tâche 1.4.6 dans `lib/` pour être appelée à la fois par
 * `app/api/checkout/route.ts` (compatibilité) ET par la Server Action
 * `checkoutAction` (app/(shop)/panier/actions.ts) — un seul point de vérité
 * pour la création de session, pas de logique dupliquée (CLAUDE.md
 * section 6 : « logique métier dans lib/, pas dans les routes »).
 *
 * Mince côté lecture : re-valide le panier EN DIRECT (produits/stock relus
 * depuis `products`, pas depuis le panier qui peut être périmé -- CLAUDE.md
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
 *     sinon laissé `null`.
 *   - Métadonnées Stripe : on ne pousse que `cart_id` + identité -- le
 *     webhook relit le panier en direct par `cart_id`.
 *   - `locale: 'fr-CA'` explicite sur la session Stripe Checkout (Tâche
 *     1.4.6) : CLAUDE.md section 2 exige une interface en français par
 *     défaut sur tout le parcours client, y compris la page de paiement
 *     hébergée par Stripe -- sans ce paramètre, Stripe utilise la langue du
 *     navigateur du client ("auto"), ce qui aurait laissé la page de
 *     paiement en anglais pour une majorité de clients. Gap découvert en
 *     testant le parcours d'achat de bout en bout.
 */
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getCurrentUser } from '@/lib/auth/session';
import { createCartDataClient, createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { createSupabaseCartBeneficiariesRepo, listCartBeneficiaries } from '@/lib/cart/beneficiaries';
import { createSupabaseCartItemsRepo, listCartItems } from '@/lib/cart/items';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseProductRepo } from '@/lib/catalog/products';
import {
  computeCheckoutTotals,
  validateCheckoutLines,
  type CheckoutLineInput,
} from '@/lib/checkout/prepare-checkout';
import { BusinessRuleError } from '@/lib/entities/errors';
import { getStripeClient } from '@/lib/payments/stripe-client';
import { createSupabaseTaxRatesRepo } from '@/lib/taxes/rates';

const DEFAULT_BILLING_PROVINCE = 'QC';

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

/**
 * Crée la session Stripe Checkout pour le panier de l'identité courante
 * (cookie de session invité ou utilisateur connecté, résolu par
 * `resolveCartIdentity`). Lève `BusinessRuleError` pour tout cas limite
 * métier (panier vide, aucun bénéficiaire, répartition incomplète, produit
 * retiré, stock insuffisant) -- à l'appelant de décider comment afficher
 * l'erreur (redirection HTTP avec message pour la Server Action, réponse
 * JSON pour la route API).
 */
export async function createCheckoutSession(): Promise<CheckoutSessionResult> {
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
    locale: 'fr-CA',
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

  if (!session.url) {
    throw new Error('Stripe n’a pas retourné d’URL de redirection pour cette session.');
  }

  return { checkoutUrl: session.url };
}
