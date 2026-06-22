/**
 * Page boutique (Tâche 1.2, étendue à la Tâche 1.6) : catalogue public,
 * Server Component — appelle directement `listPublicProducts` (pas de
 * round-trip HTTP interne inutile), cohérent avec CLAUDE.md section 6.
 *
 * `?beneficiaryType=&beneficiaryId=` (Tâche 1.6) : transmis par le lien
 * "Encourager" d'une page publique athlète/équipe/club (voir
 * `lib/public/profile.ts`, `app/[athleteSlug]/page.tsx`). Reportés en champs
 * cachés sur chaque formulaire "Ajouter au panier" pour que `addItemAction`
 * puisse pré-attacher ce bénéficiaire au panier — voir
 * `app/(shop)/panier/actions.ts`.
 *
 * Habillage Tâche 1.4.4 : grille de cartes du système de design,
 * présentation uniquement — le `<h1>Boutique</h1>` et le texte du bouton
 * "Ajouter au panier" restent inchangés (voir tests/e2e/navigation.spec.ts
 * et tests/e2e/public-profile.spec.ts).
 */
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts, type ProductSort } from '@/lib/catalog/products';
import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { addItemAction } from '@/app/(shop)/panier/actions';

interface BoutiquePageProps {
  searchParams: {
    sort?: string;
    categoryId?: string;
    kind?: string;
    beneficiaryType?: string;
    beneficiaryId?: string;
  };
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

  const beneficiaryType = searchParams.beneficiaryType;
  const beneficiaryId = searchParams.beneficiaryId;

  return (
    <main className="page page--wide stack">
      <div className="page-header">
        <h1>Boutique</h1>
        <p>Achetez vos essentiels. Financez le sport des jeunes.</p>
      </div>
      {beneficiaryType && beneficiaryId ? (
        <Alert variant="info">
          Vos achats soutiendront ce bénéficiaire — vous pourrez ajuster la répartition depuis votre
          panier.
        </Alert>
      ) : null}
      {products.length === 0 ? (
        <p>Aucun produit disponible pour le moment.</p>
      ) : (
        <ul className="product-grid">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
              <form action={addItemAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="quantity" value={1} />
                {beneficiaryType ? <input type="hidden" name="beneficiaryType" value={beneficiaryType} /> : null}
                {beneficiaryId ? <input type="hidden" name="beneficiaryId" value={beneficiaryId} /> : null}
                <Button type="submit" disabled={product.stock_quantity <= 0} fullWidth>
                  Ajouter au panier
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
