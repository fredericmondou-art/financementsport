/**
 * Page publique équipe (Tâche 1.6). Même structure que la page athlète
 * (`app/[athleteSlug]/page.tsx`) ; pas de champs `hide_*`/`show_team_only`
 * sur `teams` (uniquement sur `athletes`, voir CLAUDE.md section 2) — aucun
 * masquage à appliquer ici.
 *
 * Habillage Tâche 1.4.4 : voir le commentaire équivalent sur la page
 * athlète — présentation uniquement, aucun texte changé.
 */
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicTeamProfile } from '@/lib/public/profile';
import { formatCents } from '@/lib/format-cents';
import { ProductCard } from '@/components/product-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Button } from '@/components/ui/button';

interface TeamPageProps {
  params: { slug: string };
}

export default async function TeamPage({ params }: TeamPageProps): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const data = await loadPublicTeamProfile(supabase, params.slug);
  if (!data) {
    notFound();
  }
  const { profile, campaignSection, recommendedProducts } = data;

  const encouragerHref = `/boutique?beneficiaryType=team&beneficiaryId=${profile.id}`;

  return (
    <main className="page stack">
      <div className="public-profile__header">
        {profile.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- image distante (Supabase Storage), pas d'optimisation Next.js nécessaire en V1.
          <img src={profile.logo_url} alt={profile.name} className="public-profile__avatar" />
        ) : null}
        <div className="public-profile__identity">
          <h1>{profile.name}</h1>
          <div className="public-profile__meta">
            {profile.sport ? <Badge variant="info">{profile.sport}</Badge> : null}
            {profile.category ? <Badge>{profile.category}</Badge> : null}
            {profile.city ? <Badge>{[profile.city, profile.province].filter(Boolean).join(', ')}</Badge> : null}
          </div>
        </div>
      </div>

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
        <p>Aucune campagne active pour le moment.</p>
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
