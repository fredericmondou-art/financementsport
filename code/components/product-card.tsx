/**
 * Carte produit/pack du catalogue public (Tâche 1.2). Affiche prix et
 * crédit indicatif — pas de logique métier ici (CLAUDE.md section 6) :
 * `formatCents` (déjà écrit, testé) fait le seul calcul, une simple
 * division/format, pas une règle d'affaires.
 *
 * Image (Tâche 1.4.5) : `next/image` avec `fill` (le conteneur
 * `.product-card__image` porte `position: relative` + `aspect-ratio`,
 * voir app/globals.css) — optimisation/redimensionnement automatique des
 * images Supabase Storage, voir `images.remotePatterns` dans
 * next.config.js.
 */
import Image from 'next/image';
import { formatCents } from '@/lib/format-cents';
import type { ProductRow } from '@/lib/catalog/products';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ProductCardProps {
  product: ProductRow;
}

export function ProductCard({ product }: ProductCardProps): JSX.Element {
  const hasFixedCredit = product.fixed_credit_cents !== null;

  return (
    <Card>
      <article aria-label={product.name} className="product-card">
        {product.image_url ? (
          <div className="product-card__image">
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(min-width: 1100px) 220px, (min-width: 640px) 45vw, 90vw"
              className="product-card__image-img"
            />
          </div>
        ) : null}
        <h3 className="product-card__title">{product.name}</h3>
        {product.description ? <p>{product.description}</p> : null}
        <p className="product-card__price">{formatCents(product.price_cents)}</p>
        {hasFixedCredit ? (
          <p>
            Génère {formatCents(product.fixed_credit_cents as number)} de crédit de financement.
          </p>
        ) : null}
        <div className="product-card__meta">
          {product.stock_quantity <= 0 ? <Badge variant="error">Rupture de stock</Badge> : null}
          {product.lead_time_days !== null ? (
            <Badge variant="info">Délai : {product.lead_time_days} jour(s)</Badge>
          ) : null}
        </div>
      </article>
    </Card>
  );
}

export default ProductCard;
