/**
 * Page « Nouveau produit » -- voir `app/(admin)/produits/page.tsx` pour le
 * contexte général de cette fonctionnalité (back-office produits demandé
 * directement par l'utilisateur, docs/DECISIONS.md).
 *
 * Garde de page identique à la liste : `can(user, 'create', { type:
 * 'product' })` -- vrai seulement pour `platform_admin`.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { ProductForm, NEW_PRODUCT_DEFAULTS } from '../product-form';
import { createProductAction } from './actions';

export const metadata = {
  title: 'Nouveau produit',
};

export default async function NouveauProduitPage({
  searchParams,
}: {
  searchParams: { erreur?: string };
}): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'create', { type: 'product' })) {
    notFound();
  }

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Nouveau produit</h1>
        <p>Créer un produit, pack ou abonnement à vendre en boutique.</p>
      </div>

      <ProductForm
        action={createProductAction}
        defaults={NEW_PRODUCT_DEFAULTS}
        submitLabel="Créer le produit"
        errorMessage={searchParams.erreur}
      />
    </main>
  );
}
