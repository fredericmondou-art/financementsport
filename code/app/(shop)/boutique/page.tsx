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
 *
 * État vide (Tâche 1.4.5) : "Aucun produit disponible pour le moment."
 * passé dans `Alert variant="info"` pour plus de clarté visuelle — texte
 * inchangé.
 *
 * Barre de tri (Tâche V5, refonte visuelle) : `sortProducts`
 * (lib/catalog/products.ts) gérait déjà 4 tris (`price_asc`, `price_desc`,
 * `credit_desc`, `popularity`) via `?sort=`, mais aucune interface ne
 * permettait de les choisir — seul un visiteur connaissant l'URL exacte
 * pouvait s'en servir. `buildSortHref` reconstruit l'URL en conservant les
 * autres paramètres (`categoryId`, `kind`, bénéficiaire) ; liens natifs
 * (`<Link>`), aucun JS requis, même choix que le menu mobile/FAQ/recherche
 * d'athlètes (voir docs/DECISIONS.md). Pas de filtre par catégorie affiché :
 * `categoryId` n'est pas encore exercé par le seed V1 (voir
 * lib/catalog/products.ts, commentaire sur `categoryId`).
 */
import Link from 'next/link';
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

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'credit_desc', label: 'Crédit généré' },
  { value: 'popularity', label: 'Popularité' },
];

function buildSortHref(sort: ProductSort, current: BoutiquePageProps['searchParams']): string {
  const params = new URLSearchParams();
  params.set('sort', sort);
  if (current.categoryId) params.set('categoryId', current.categoryId);
  if (current.kind) params.set('kind', current.kind);
  if (current.beneficiaryType) params.set('beneficiaryType', current.beneficiaryType);
  if (current.beneficiaryId) params.set('beneficiaryId', current.beneficiaryId);
  return `/boutique?${params.toString()}`;
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
  const activeSort: ProductSort = (searchParams.sort as ProductSort | undefined) ?? 'price_asc';

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
      {products.length > 0 ? (
        <nav aria-label="Trier les produits" className="shop-toolbar">
          <span className="shop-toolbar__label">Trier par :</span>
          <ul className="shop-toolbar__sorts">
            {SORT_OPTIONS.map((option) => (
              <li key={option.value}>
                <Link
                  href={buildSortHref(option.value, searchParams)}
                  aria-current={activeSort === option.value ? 'true' : undefined}
                  className="shop-toolbar__sort-link"
                >
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {products.length === 0 ? (
        <Alert variant="info">Aucun produit disponible pour le moment -- revenez bientôt.</Alert>
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
