'use server';

/**
 * Server Action « Modifier un produit » -- même patron que
 * `app/(admin)/produits/nouveau/actions.ts`, délègue la validation/
 * permission à `updateProduct` (lib/catalog/products.ts). Permet aussi de
 * désactiver/réactiver un produit et d'ajuster son stock via le même
 * formulaire (cases "Actif"/quantité), pas d'action séparée -- plus simple
 * pour l'admin qu'un bouton dédié, et cohérent avec `productUpdateSchema`
 * qui accepte un patch partiel.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { updateProduct, createSupabaseProductRepo } from '@/lib/catalog/products';
import { NotFoundError, PermissionError } from '@/lib/entities/errors';

function emptyToUndefined(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function optionalInt(raw: FormDataEntryValue | null): number | null | undefined {
  const value = emptyToUndefined(raw);
  if (value === undefined) return null;
  return Number(value);
}

function redirectWithError(productId: string, message: string): never {
  redirect(`/produits/${productId}?erreur=${encodeURIComponent(message)}`);
}

export async function updateProductAction(formData: FormData): Promise<void> {
  const productId = formData.get('productId');
  if (typeof productId !== 'string' || productId === '') {
    redirect('/produits');
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const rawPatch = {
    name: emptyToUndefined(formData.get('name')) ?? '',
    kind: emptyToUndefined(formData.get('kind')),
    description: emptyToUndefined(formData.get('description')) ?? null,
    imageUrl: emptyToUndefined(formData.get('imageUrl')) ?? null,
    priceCents: Number(emptyToUndefined(formData.get('priceCents')) ?? '0'),
    fixedCreditCents: optionalInt(formData.get('fixedCreditCents')),
    isTaxable: formData.get('isTaxable') === 'on',
    stockQuantity: Number(emptyToUndefined(formData.get('stockQuantity')) ?? '0'),
    leadTimeDays: optionalInt(formData.get('leadTimeDays')),
    isActive: formData.get('isActive') === 'on',
  };

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseProductRepo(supabase);
    await updateProduct(user, productId, rawPatch, repo);
  } catch (error) {
    if (error instanceof NotFoundError) {
      redirect('/produits');
    }
    if (error instanceof PermissionError) {
      redirectWithError(productId, error.message);
    }
    if (error instanceof ZodError) {
      redirectWithError(productId, error.issues[0]?.message ?? 'Données invalides.');
    }
    redirectWithError(productId, 'Une erreur est survenue pendant la mise à jour du produit.');
  }

  revalidatePath('/produits');
  revalidatePath(`/produits/${productId}`);
  revalidatePath('/boutique');
  redirect(`/produits/${productId}?avis=${encodeURIComponent('Produit mis à jour.')}`);
}
