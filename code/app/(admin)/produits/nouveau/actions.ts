'use server';

/**
 * Server Action « Créer un produit » -- extrait les champs du `FormData`,
 * délègue toute la validation/permission à `createProduct` (déjà écrit à la
 * Tâche 1.2, voir `lib/catalog/products.ts`) plutôt que de la dupliquer ici
 * (CLAUDE.md section 6 : logique métier dans `lib/`, pas dans les routes).
 *
 * Le succès `redirect()` reste TOUJOURS hors du try/catch -- `redirect()`
 * lève une exception interne (`NEXT_REDIRECT`) qui serait sinon avalée par le
 * `catch`, même convention que `app/(portails)/campagnes/nouvelle/actions.ts`.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createProduct, createSupabaseProductRepo } from '@/lib/catalog/products';
import { PermissionError } from '@/lib/entities/errors';

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

function redirectWithError(message: string): never {
  redirect(`/produits/nouveau?erreur=${encodeURIComponent(message)}`);
}

export async function createProductAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const rawInput = {
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

  let productId: string;
  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseProductRepo(supabase);
    const product = await createProduct(user, rawInput, repo);
    productId = product.id;
  } catch (error) {
    if (error instanceof PermissionError) {
      redirectWithError(error.message);
    }
    if (error instanceof ZodError) {
      redirectWithError(error.issues[0]?.message ?? 'Données invalides.');
    }
    redirectWithError('Une erreur est survenue pendant la création du produit.');
  }

  revalidatePath('/produits');
  revalidatePath('/boutique');
  redirect(`/produits/${productId}?avis=${encodeURIComponent('Produit créé.')}`);
}
