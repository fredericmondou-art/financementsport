/**
 * Rendu partagé des trois pages publiques (athlète/équipe/club) — extrait
 * depuis app/(public)/{team,club}/[slug]/page.tsx et
 * app/(public)/[athleteSlug]/page.tsx à la Tâche 1.6.B3, SANS aucun
 * changement de texte ni de structure (voir tests/e2e/public-profile.spec.ts :
 * titre h1, lien « Encourager », « Cette campagne est active. », absence du
 * texte « amassés sur un objectif » quand les montants sont masqués).
 *
 * Retourne uniquement le contenu intérieur (un `<>`, pas de `<main>`) : les 3
 * pages publiques continuent de fournir elles-mêmes leur
 * `<main className="page stack">`, et l'aperçu de l'assistant de campagne
 * (RecapStep, Tâche 1.6.B3) l'enveloppe dans une `<Card>` plutôt qu'un
 * second `<main>` (qui serait invalide, imbriqué dans la page de
 * l'assistant).
 *
 * Garantie de fidélité (critère d'acceptation 1.6.B3 « l'aperçu correspond à
 * la vraie page publique ») : les 3 pages publiques ET l'aperçu de
 * l'assistant appellent exactement cette même fonction de rendu — toute
 * différence visuelle entre les deux contextes est donc impossible par
 * construction, pas seulement par discipline de copier-coller.
 *
 * `badges`/`bodyText` restent la responsabilité de l'appelant (les 3 pages
 * publiques ne construisent pas les mêmes badges — sport+catégorie+ville
 * pour une équipe, ville seule pour un club, sport+ville pour un athlète) :
 * ce composant ne décide jamais QUELLES données afficher, seulement COMMENT
 * les disposer.
 */
import type { ReactNode } from 'react';
import Image from 'next/image';
import { formatCents } from '@/lib/format-cents';
import { ProductCard } from '@/components/product-card';
import type { ProductRow } from '@/lib/catalog/products';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';
import type { PublicCampaignSection } from '@/lib/public/profile';

export interface PublicProfileViewProps {
  imageUrl: string | null;
  imageAlt: string;
  name: string;
  /** JSX des badges (Badge déjà appliqué par l'appelant) — toujours rendu
   * dans le même conteneur `.public-profile__meta` que l'original, même
   * vide, pour préserver le markup exact des 3 pages d'origine. */
  badges?: ReactNode;
  bodyText?: string | null;
  campaignSection: PublicCampaignSection | null;
  encouragerHref: string;
  recommendedProducts: ProductRow[];
}

export function PublicProfileView({
  imageUrl,
  imageAlt,
  name,
  badges,
  bodyText,
  campaignSection,
  encouragerHref,
  recommendedProducts,
}: PublicProfileViewProps): JSX.Element {
  return (
    <>
      <div className="public-profile__header">
        {imageUrl ? (
          <Image src={imageUrl} alt={imageAlt} width={96} height={96} className="public-profile__avatar" />
        ) : null}
        <div className="public-profile__identity">
          <h1>{name}</h1>
          <div className="public-profile__meta">{badges}</div>
        </div>
      </div>
      {bodyText ? <p>{bodyText}</p> : null}

      {campaignSection ? (
        <Card>
          <section className="stack stack--sm">
            <h2>{campaignSection.campaign.name}</h2>
            {campaignSection.campaign.public_message ? <p>{campaignSection.campaign.public_message}</p> : null}
            {campaignSection.progress.goalCents !== null ? (
              <>
                <p>
                  {formatCents(campaignSection.progress.raisedCents)} amassés sur un objectif de{' '}
                  {formatCents(campaignSection.progress.goalCents)}
                  {campaignSection.progress.isGoalExceeded ? ' — objectif dépassé !' : ''}
                </p>
                <ProgressBar percent={campaignSection.progress.percent ?? 0} label="Progression de la campagne" />
              </>
            ) : (
              <p>Cette campagne est active.</p>
            )}
            {campaignSection.daysRemaining !== null ? (
              <p>{campaignSection.daysRemaining} jour(s) restant(s)</p>
            ) : null}
          </section>
        </Card>
      ) : (
        <Alert variant="info">Aucune campagne active pour le moment.</Alert>
      )}

      <div>
        <Button href={encouragerHref} variant="accent">
          Encourager {name}
        </Button>
      </div>

      {recommendedProducts.length > 0 ? (
        <section className="stack stack--sm">
          <h2>Packs recommandés</h2>
          <ul className="product-grid">
            {recommendedProducts.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
                <Button href={encouragerHref} variant="outline" size="sm">
                  Soutenir avec ce pack
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default PublicProfileView;
