/**
 * Page publique club (Tâche 1.6). Même structure que les pages
 * athlète/équipe ; pas de champs `hide_*` sur `clubs` (uniquement sur
 * `athletes`, voir CLAUDE.md section 2) — aucun masquage à appliquer ici.
 *
 * Habillage Tâche 1.4.4 : voir le commentaire équivalent sur la page
 * athlète — présentation uniquement, aucun texte changé.
 *
 * `generateMetadata` (Tâche 1.4.5) : voir le commentaire équivalent sur la
 * page athlète — même logique, mêmes garde-fous (jamais de montant dans
 * l'aperçu de partage).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicClubProfile } from '@/lib/public/profile';
import { formatCents } from '@/lib/format-cents';
import { ProductCard } from '@/components/product-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';

interface ClubPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ClubPageProps): Promise<Metadata> {
  const supabase = createSupabaseServerClient();
  const data = await loadPublicClubProfile(supabase, params.slug);
  if (!data) {
    return { title: 'Profil introuvable' };
  }
  const { profile, campaignSection } = data;
  const title = profile.name;
  const description = campaignSection
    ? `Soutenez ${profile.name} — ${campaignSection.campaign.name}.`
    : `Découvrez et soutenez ${profile.name}.`;
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      images: profile.logo_url ? [{ url: profile.logo_url }] : undefined,
    },
    twitter: {
      card: profile.logo_url ? 'summary_large_image' : 'summary',
      title,
      description,
      images: profile.logo_url ? [profile.logo_url] : undefined,
    },
  };
}

export default async function ClubPage({ params }: ClubPageProps): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const data = await loadPublicClubProfile(supabase, params.slug);
  if (!data) {
    notFound();
  }
  const { profile, campaignSection, recommendedProducts } = data;

  const encouragerHref = `/boutique?beneficiaryType=club&beneficiaryId=${profile.id}`;

  return (
    <main className="page stack">
      <div className="public-profile__header">
        {profile.logo_url ? (
          <Image
            src={profile.logo_url}
            alt={profile.name}
            width={96}
            height={96}
            className="public-profile__avatar"
          />
        ) : null}
        <div className="public-profile__identity">
          <h1>{profile.name}</h1>
          <div className="public-profile__meta">
            {profile.city ? <Badge>{[profile.city, profile.province].filter(Boolean).join(', ')}</Badge> : null}
          </div>
        </div>
      </div>
      {profile.description ? <p>{profile.description}</p> : null}

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
          Encourager {profile.name}
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
    </main>
  );
}
