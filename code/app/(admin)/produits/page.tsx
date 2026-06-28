/**
 * Liste admin des produits/packs (suite à Tâche 1.2 : `lib/catalog/products.ts`
 * existait déjà côté logique métier et API interne, mais aucune page ne
 * permettait à un admin d'ajouter/configurer un produit sans passer par
 * Supabase Studio -- demande directe de l'utilisateur, voir docs/DECISIONS.md.
 *
 * Garde de page : `can(user, 'read', { type: 'product' })` -- vrai seulement
 * pour `platform_admin` (voir `lib/auth/permissions.ts`, ligne `case
 * 'product':`) -- 404 plutôt qu'un message "accès refusé", même convention
 * que `app/(admin)/dashboard/page.tsx` et `app/(admin)/versements/page.tsx`.
 *
 * `listActiveProducts()` (lib/catalog/products.ts) ne retourne QUE les
 * produits actifs -- inadapté à une vue admin qui doit aussi montrer les
 * produits désactivés (pour pouvoir les réactiver). Cette page interroge donc
 * Supabase directement, comme `app/(admin)/versements/page.tsx` le fait déjà
 * pour les campagnes (décision autonome, pas de nouvelle méthode de repo pour
 * une simple lecture admin sans règle métier).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { can } from '@/lib/auth/permissions';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { ProductsTable } from '@/lib/db/types';

export const metadata = {
  title: 'Produits',
};

type ProductRow = Pick<
  ProductsTable['Row'],
  'id' | 'name' | 'kind' | 'price_cents' | 'stock_quantity' | 'is_active'
>;

const KIND_LABELS: Record<ProductRow['kind'], string> = {
  product: 'Produit',
  pack: 'Pack',
  subscription: 'Abonnement',
};

export default async function ProduitsPage(): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'read', { type: 'product' })) {
    // Pas de scope à révéler à un rôle non autorisé : 404, pas un message
    // "accès refusé" -- voir l'en-tête de ce fichier.
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, kind, price_cents, stock_quantity, is_active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const products = (data ?? []) as ProductRow[];

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Produits</h1>
        <p>Catalogue complet -- produits, packs et abonnements vendus en boutique, actifs ou non.</p>
        <Button href="/produits/nouveau" variant="primary">
          Nouveau produit
        </Button>
      </div>

      <Card>
        <section className="stack stack--sm">
          {products.length === 0 ? (
            <EmptyState title="Aucun produit pour le moment." actionHref="/produits/nouveau" actionLabel="Créer le premier produit">
              Les produits créés ici apparaissent dans la boutique publique une fois actifs.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Type</th>
                    <th>Prix</th>
                    <th>Stock</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{KIND_LABELS[product.kind]}</td>
                      <td>{formatCents(product.price_cents)}</td>
                      <td>{product.stock_quantity}</td>
                      <td>
                        {product.is_active ? (
                          <Badge variant="success">Actif</Badge>
                        ) : (
                          <Badge variant="neutral">Inactif</Badge>
                        )}
                      </td>
                      <td>
                        <Button href={`/produits/${product.id}`} variant="outline" size="sm">
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>
    </main>
  );
}
