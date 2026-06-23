'use server';

/**
 * Server Action « Racheter » (Tâche 1.6.A3, docs/prompts/phase-1-6.md) :
 * reconstruit le panier courant à partir d'une commande passée. Toute la
 * logique métier vit dans `lib/reorder/reorder.ts` -- cette action ne fait
 * que charger les données nécessaires (commande d'origine, état ACTUEL du
 * catalogue) et router le résultat, même style que `app/(shop)/panier/
 * actions.ts`.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo } from '@/lib/catalog/products';
import {
  createCartDataClient,
  createSupabaseCartRepo,
} from '@/lib/cart/cart';
import { createSupabaseCartItemsRepo, type CartProductSnapshot } from '@/lib/cart/items';
import { createSupabaseCartBeneficiariesRepo } from '@/lib/cart/beneficiaries';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseOrdersRepo, getOrderWithDetailsForUser } from '@/lib/orders/list-orders';
import { reorderOrderToCart } from '@/lib/reorder/reorder';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';

const COMPTE_PATH = '/compte';
const PANIER_PATH = '/panier';

function redirectWithError(error: unknown): never {
  const message =
    error instanceof BusinessRuleError || error instanceof PermissionError || error instanceof NotFoundError
      ? error.message
      : 'Une erreur est survenue pendant le rachat de cette commande.';
  redirect(`${COMPTE_PATH}?erreur=${encodeURIComponent(message)}`);
}

const reorderSchema = z.object({
  orderId: z.string().uuid(),
});

export async function reorderAction(formData: FormData): Promise<void> {
  const parsed = reorderSchema.safeParse({ orderId: formData.get('orderId') });
  if (!parsed.success) {
    redirectWithError(new BusinessRuleError('Commande invalide.'));
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  let unavailableCount = 0;
  try {
    const supabase = createSupabaseServerClient();
    const ordersRepo = createSupabaseOrdersRepo(supabase);
    const details = await getOrderWithDetailsForUser(parsed.data.orderId, user.id, ordersRepo);

    // Revalide chaque produit contre le catalogue ACTUEL (prix, statut,
    // stock) -- jamais confiance à l'instantané figé sur l'ancienne commande
    // (voir l'en-tête de lib/reorder/reorder.ts).
    const productRepo = createSupabaseProductRepo(supabase);
    const uniqueProductIds = Array.from(new Set(details.items.map((item) => item.product_id)));
    const products = await Promise.all(uniqueProductIds.map((id) => productRepo.getProductById(id)));
    const currentProductsById = new Map<string, CartProductSnapshot>();
    uniqueProductIds.forEach((id, index) => {
      const product = products[index];
      if (product) {
        currentProductsById.set(id, {
          id: product.id,
          priceCents: product.price_cents,
          isActive: product.is_active,
          stockQuantity: product.stock_quantity,
        });
      }
    });

    const identity = await resolveCartIdentity();
    const cartClient = createCartDataClient();

    const result = await reorderOrderToCart(
      identity,
      {
        items: details.items.map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
        })),
        credits: details.credits.map((credit) => ({
          beneficiaryType: credit.beneficiary_type,
          beneficiaryId: credit.beneficiary_id,
          amountCents: credit.amount_cents,
        })),
      },
      currentProductsById,
      {
        cart: createSupabaseCartRepo(cartClient),
        items: createSupabaseCartItemsRepo(cartClient),
        beneficiaries: createSupabaseCartBeneficiariesRepo(cartClient),
      },
    );
    unavailableCount = result.unavailable.length;
  } catch (error) {
    redirectWithError(error);
  }

  revalidatePath(PANIER_PATH);
  if (unavailableCount > 0) {
    redirect(
      `${PANIER_PATH}?avis=${encodeURIComponent(
        'Commande rachetée : certains articles ont changé (retirés du catalogue ou quantité réduite par manque de stock). Vérifiez votre panier avant de payer.',
      )}`,
    );
  }
  redirect(PANIER_PATH);
}
