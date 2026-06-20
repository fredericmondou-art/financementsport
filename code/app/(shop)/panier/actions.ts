/**
 * Server Actions du panier (Tâche 1.4), même style que
 * app/(auth)/login/actions.ts : formulaires natifs, pas de fetch côté
 * client, pas de "use client". Toute la logique métier vit dans
 * lib/cart/*.ts -- ces actions ne font que router formulaire -> lib.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, getProduct } from '@/lib/catalog/products';
import {
  beneficiarySplitInputSchema,
  createSupabaseCartBeneficiariesRepo,
  setCartBeneficiarySplit,
} from '@/lib/cart/beneficiaries';
import { createSupabaseCartRepo, getCartForIdentity, getOrCreateCart } from '@/lib/cart/cart';
import { resolveCartIdentity } from '@/lib/cart/identity';
import {
  addItemToCart,
  createSupabaseCartItemsRepo,
  removeItemFromCart,
  updateCartItemQuantity,
} from '@/lib/cart/items';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';

const PANIER_PATH = '/panier';

function redirectWithError(error: unknown): never {
  const message =
    error instanceof BusinessRuleError || error instanceof PermissionError || error instanceof NotFoundError
      ? error.message
      : 'Une erreur est survenue.';
  redirect(`${PANIER_PATH}?erreur=${encodeURIComponent(message)}`);
}

const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
});

export async function addItemAction(formData: FormData): Promise<void> {
  const parsed = addItemSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity') || 1,
  });
  if (!parsed.success) {
    redirectWithError(new BusinessRuleError('Produit ou quantité invalide.'));
  }

  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const user = await getCurrentUser();

    const cart = await getOrCreateCart(identity, createSupabaseCartRepo(supabase));
    const product = await getProduct(user, parsed.data.productId, createSupabaseProductRepo(supabase));
    await addItemToCart(
      cart,
      identity,
      {
        id: product.id,
        priceCents: product.price_cents,
        isActive: product.is_active,
        stockQuantity: product.stock_quantity,
      },
      parsed.data.quantity,
      createSupabaseCartItemsRepo(supabase),
    );
  } catch (error) {
    redirectWithError(error);
  }

  revalidatePath(PANIER_PATH);
  redirect(PANIER_PATH);
}

const updateQuantitySchema = z.object({
  cartId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
});

export async function updateQuantityAction(formData: FormData): Promise<void> {
  const parsed = updateQuantitySchema.safeParse({
    cartId: formData.get('cartId'),
    itemId: formData.get('itemId'),
    quantity: formData.get('quantity'),
  });
  if (!parsed.success) {
    redirectWithError(new BusinessRuleError('Quantité invalide.'));
  }

  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const user = await getCurrentUser();
    const itemsRepo = createSupabaseCartItemsRepo(supabase);

    const cart = await getCartForIdentity(parsed.data.cartId, identity, createSupabaseCartRepo(supabase));
    const existingItem = await itemsRepo.getItemById(parsed.data.itemId);
    if (!existingItem) {
      throw new NotFoundError('Article introuvable dans ce panier.');
    }
    const product = await getProduct(user, existingItem.product_id, createSupabaseProductRepo(supabase));

    await updateCartItemQuantity(
      cart,
      identity,
      parsed.data.itemId,
      parsed.data.quantity,
      {
        id: product.id,
        priceCents: product.price_cents,
        isActive: product.is_active,
        stockQuantity: product.stock_quantity,
      },
      itemsRepo,
    );
  } catch (error) {
    redirectWithError(error);
  }

  revalidatePath(PANIER_PATH);
  redirect(PANIER_PATH);
}

const removeItemSchema = z.object({
  cartId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export async function removeItemAction(formData: FormData): Promise<void> {
  const parsed = removeItemSchema.safeParse({
    cartId: formData.get('cartId'),
    itemId: formData.get('itemId'),
  });
  if (!parsed.success) {
    redirectWithError(new BusinessRuleError('Article invalide.'));
  }

  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const cart = await getCartForIdentity(parsed.data.cartId, identity, createSupabaseCartRepo(supabase));
    await removeItemFromCart(cart, identity, parsed.data.itemId, createSupabaseCartItemsRepo(supabase));
  } catch (error) {
    redirectWithError(error);
  }

  revalidatePath(PANIER_PATH);
  redirect(PANIER_PATH);
}

/**
 * Le formulaire envoie des tableaux parallèles `beneficiaryType[]` /
 * `beneficiaryId[]` / `shareBps[]` (une entrée par ligne de bénéficiaire
 * affichée par components/beneficiary-split.tsx). On les recombine ici
 * avant de les faire valider par `beneficiarySplitInputSchema` -- pas de
 * logique de validation dupliquée, seulement le "reshape" du FormData.
 */
const splitFormSchema = z.object({
  cartId: z.string().uuid(),
  beneficiaryType: z.array(z.string()),
  beneficiaryId: z.array(z.string()),
  shareBps: z.array(z.string()),
});

export async function setBeneficiarySplitAction(formData: FormData): Promise<void> {
  const beneficiaryType = formData.getAll('beneficiaryType').map(String);
  const beneficiaryId = formData.getAll('beneficiaryId').map(String);
  const shareBps = formData.getAll('shareBps').map(String);
  const cartId = formData.get('cartId');

  const parsedForm = splitFormSchema.safeParse({ cartId, beneficiaryType, beneficiaryId, shareBps });
  if (!parsedForm.success) {
    redirectWithError(new BusinessRuleError('Répartition invalide.'));
  }

  // Les lignes vides (ajoutées par le formulaire pour permettre de saisir un
  // nouveau bénéficiaire sans JS, voir components/beneficiary-split.tsx)
  // n'ont ni id rempli ni part > 0 : on les retire avant validation plutôt
  // que de les faire échouer sur le format UUID.
  const rawSplit = parsedForm.data.beneficiaryType
    .map((type, index) => ({
      beneficiaryType: type,
      beneficiaryId: parsedForm.data.beneficiaryId[index] ?? '',
      shareBps: Number(parsedForm.data.shareBps[index] ?? '0'),
    }))
    .filter((row) => row.beneficiaryId.trim() !== '' && row.shareBps > 0);

  const parsedSplit = beneficiarySplitInputSchema.safeParse(rawSplit);
  if (!parsedSplit.success) {
    redirectWithError(new BusinessRuleError(parsedSplit.error.issues[0]?.message ?? 'Répartition invalide.'));
  }

  try {
    const identity = await resolveCartIdentity();
    const supabase = createSupabaseServerClient();
    const cart = await getCartForIdentity(parsedForm.data.cartId, identity, createSupabaseCartRepo(supabase));
    await setCartBeneficiarySplit(
      cart,
      identity,
      parsedSplit.data,
      createSupabaseCartBeneficiariesRepo(supabase),
    );
  } catch (error) {
    redirectWithError(error);
  }

  revalidatePath(PANIER_PATH);
  redirect(PANIER_PATH);
}
