/**
 * Carte produit/pack du catalogue public (Tâche 1.2). Affiche prix et
 * crédit indicatif — pas de logique métier ici (CLAUDE.md section 6) :
 * `formatCents` (déjà écrit, testé) fait le seul calcul, une simple
 * division/format, pas une règle d'affaires.
 */
import { formatCents } from '@/lib/format-cents';
import type { ProductRow } from '@/lib/catalog/products';

export interface ProductCardProps {
  product: ProductRow;
}

export function ProductCard({ product }: ProductCardProps): JSX.Element {
  const hasFixedCredit = product.fixed_credit_cents !== null;

  return (
    <article aria-label={product.name}>
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- image distante (Supabase Storage), pas d'optimisation Next.js nécessaire en V1.
        <img src={product.image_url} alt={product.name} />
      ) : null}
      <h3>{product.name}</h3>
      {product.description ? <p>{product.description}</p> : null}
      <p>{formatCents(product.price_cents)}</p>
      {hasFixedCredit ? (
        <p>
          Génère {formatCents(product.fixed_credit_cents as number)} de crédit de financement.
        </p>
      ) : null}
      {product.stock_quantity <= 0 ? <p>Rupture de stock</p> : null}
      {product.lead_time_days !== null ? <p>Délai : {product.lead_time_days} jour(s)</p> : null}
    </article>
  );
}

export default ProductCard;
