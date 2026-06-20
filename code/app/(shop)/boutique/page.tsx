/**
 * Page boutique (Tâche 1.2) : catalogue public, Server Component — appelle
 * directement `listPublicProducts` (pas de round-trip HTTP interne inutile),
 * cohérent avec CLAUDE.md section 6 (logique métier dans `lib/`, les pages
 * ne font qu'appeler des fonctions pures/testables).
 */
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts, type ProductSort } from '@/lib/catalog/products';
import { ProductCard } from '@/components/product-card';

interface BoutiquePageProps {
  searchParams: { sort?: string; categoryId?: string; kind?: string };
}

export default async function BoutiquePage({ searchParams }: BoutiquePageProps): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const products = await listPublicProducts(
    {
      sort: searchParams.sort as ProductSort | undefined,
      categoryId: searchParams.categoryId,
      kind: searchParams.kind,
    },
    createSupabaseProductRepo(supabase),
  );

  return (
    <main>
      <h1>Boutique</h1>
      <p>Achetez vos essentiels. Financez le sport des jeunes.</p>
      {products.length === 0 ? (
        <p>Aucun produit disponible pour le moment.</p>
      ) : (
        <ul>
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
