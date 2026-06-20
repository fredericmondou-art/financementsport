/**
 * Page publique équipe (Tâche 1.6). Même structure que la page athlète
 * (`app/[athleteSlug]/page.tsx`) ; pas de champs `hide_*`/`show_team_only`
 * sur `teams` (uniquement sur `athletes`, voir CLAUDE.md section 2) — aucun
 * masquage à appliquer ici.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicTeamProfile } from '@/lib/public/profile';
import { formatCents } from '@/lib/format-cents';
import { ProductCard } from '@/components/product-card';

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
    <main>
      <h1>{profile.name}</h1>
      {profile.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- image distante (Supabase Storage), pas d'optimisation Next.js nécessaire en V1.
        <img src={profile.logo_url} alt={profile.name} />
      ) : null}
      {profile.sport ? <p>{profile.sport}</p> : null}
      {profile.category ? <p>{profile.category}</p> : null}
      {profile.city ? <p>{[profile.city, profile.province].filter(Boolean).join(', ')}</p> : null}

      {campaignSection ? (
        <section>
          <h2>{campaignSection.campaign.name}</h2>
          {campaignSection.campaign.public_message ? <p>{campaignSection.campaign.public_message}</p> : null}
          {campaignSection.progress.goalCents !== null ? (
            <>
              <p>
                {formatCents(campaignSection.progress.raisedCents)} amassés sur un objectif de{' '}
                {formatCents(campaignSection.progress.goalCents)}
                {campaignSection.progress.isGoalExceeded ? ' — objectif dépassé !' : ''}
              </p>
              <progress value={campaignSection.progress.percent ?? 0} max={100} />
            </>
          ) : (
            <p>Cette campagne est active.</p>
          )}
          {campaignSection.daysRemaining !== null ? (
            <p>{campaignSection.daysRemaining} jour(s) restant(s)</p>
          ) : null}
        </section>
      ) : (
        <p>Aucune campagne active pour le moment.</p>
      )}

      <p>
        <Link href={encouragerHref}>Encourager {profile.name}</Link>
      </p>

      {recommendedProducts.length > 0 ? (
        <section>
          <h2>Packs recommandés</h2>
          <ul>
            {recommendedProducts.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
                <Link href={encouragerHref}>Soutenir avec ce pack</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
