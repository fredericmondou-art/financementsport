/**
 * Page « Modifier un produit » -- voir `app/(admin)/produits/page.tsx` pour
 * le contexte général. Réutilise `getProduct` (lib/catalog/products.ts) qui
 * gère déjà la garde d'accès pour un produit inactif (404 pour un non-admin),
 * et le formulaire partagé `ProductForm`.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getProduct, createSupabaseProductRepo } from '@/lib/catalog/products';
import { NotFoundError } from '@/lib/entities/errors';
import { Alert } from '@/components/ui/alert';
import { ProductForm, defaultsFromRow } from '../product-form';
import { updateProductAction } from './actions';

export const metadata = {
  title: 'Modifier un produit',
};

export default async function ModifierProduitPage({
  params,
  searchParams,
}: {
  params: { productId: string };
  searchParams: { avis?: string; erreur?: string };
}): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const repo = createSupabaseProductRepo(supabase);
  let product;
  try {
    product = await getProduct(user, params.productId, repo);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>{product.name}</h1>
        <p>Modifier les paramètres de ce produit.</p>
      </div>

      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      <ProductForm
        action={updateProductAction}
        defaults={defaultsFromRow(product)}
        submitLabel="Enregistrer"
        errorMessage={searchParams.erreur}
        productId={product.id}
      />
    </main>
  );
}
