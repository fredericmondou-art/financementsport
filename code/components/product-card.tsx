/**
 * Carte produit/pack du catalogue public (Tâche 1.2). Affiche prix et
 * crédit indicatif — pas de logique métier ici (CLAUDE.md section 6) :
 * `formatCents` (déjà écrit, testé) fait le seul calcul, une simple
 * division/format, pas une règle d'affaires.
 *
 * Image (Tâche 1.4.5, étendue 1.4b.3) : `next/image` avec `fill` (le
 * conteneur `.product-card__image` porte `position: relative` +
 * `aspect-ratio`, voir app/globals.css) — optimisation/redimensionnement
 * automatique des images Supabase Storage, voir `images.remotePatterns`
 * dans next.config.js. Si `image_url` est absent (cas par défaut
 * aujourd'hui : aucun produit du seed n'a d'image), affiche un
 * remplacement visuel neutre (SVG inline, pas de fichier externe ni
 * `next/image` — évite toute dépendance à `public/`/remotePatterns pour un
 * simple aplat) plutôt qu'un trou dans la carte.
 *
 * Hauteur égale + bouton aligné (Tâche 1.4b.3) : voir app/globals.css,
 * `.product-grid > li > .card { flex: 1 }` — la grille étire déjà chaque
 * `<li>` d'une même rangée à la même hauteur (comportement par défaut de
 * CSS Grid), et faire grandir la carte à l'intérieur du `<li>` pousse le
 * formulaire "Ajouter au panier" (rendu après la carte, voir
 * app/(shop)/boutique/page.tsx) systématiquement au même point en bas.
 */
import Image from 'next/image';
import { formatCents } from '@/lib/format-cents';
import type { ProductRow } from '@/lib/catalog/products';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ProductCardProps {
  product: ProductRow;
}

function ProductImagePlaceholder(): JSX.Element {
  return (
    <div className="product-card__image-placeholder" role="img" aria-label="Aucune image pour ce produit">
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="52" height="52" rx="6" />
        <circle cx="24" cy="22" r="5" />
        <path d="M12 46 L25 30 L34 38 L44 24 L52 46 Z" />
      </svg>
    </div>
  );
}

export function ProductCard({ product }: ProductCardProps): JSX.Element {
  const hasFixedCredit = product.fixed_credit_cents !== null;

  return (
    <Card>
      <article aria-label={product.name} className="product-card">
        <div className="product-card__image">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(min-width: 1100px) 220px, (min-width: 640px) 45vw, 90vw"
              className="product-card__image-img"
            />
          ) : (
            <ProductImagePlaceholder />
          )}
        </div>
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
