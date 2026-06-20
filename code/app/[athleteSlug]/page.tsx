/**
 * Page publique athlète (Tâche 1.6) — route top-level `/[athleteSlug]`,
 * exactement le chemin demandé par le cahier des charges (lien court,
 * facile à partager). Next.js priorise les segments statiques
 * (`/boutique`, `/panier`, `/login`, `/team`, `/club`, etc.) sur ce segment
 * dynamique : aucun conflit de routage avec les autres pages de l'app.
 *
 * Toutes les données viennent de `lib/public/profile.ts`, qui ne lit que des
 * vues publiques (`v_public_athlete`, `v_public_campaign`, ...) — jamais les
 * tables brutes (CLAUDE.md section 5).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicAthleteProfile } from '@/lib/public/profile';
import { formatCents } from '@/lib/format-cents';
import { ProductCard } from '@/components/product-card';

interface AthletePageProps {
  params: { athleteSlug: string };
}

export default async function AthletePage({ params }: AthletePageProps): Promise<JSX.Element> {
  const supabase = createSupabaseServerClient();
  const data = await loadPublicAthleteProfile(supabase, params.athleteSlug);
  if (!data) {
    notFound();
  }
  const { profile, campaignSection, recommendedProducts } = data;

  // `show_team_only` (Tâche 1.6, voir docs/DECISIONS.md) : ce profil n'a
  // volontairement AUCUNE page individuelle publique — il n'apparaît que
  // dans le contexte de son équipe. Traité comme "introuvable", au même
  // titre qu'un slug inexistant, plutôt que d'exposer une page partielle.
  if (profile.show_team_only) {
    notFound();
  }

  const encouragerHref = `/boutique?beneficiaryType=athlete&beneficiaryId=${profile.id}`;

  return (
    <main>
      <h1>{profile.display_name}</h1>
      {profile.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- image distante (Supabase Storage), pas d'optimisation Next.js nécessaire en V1.
        <img src={profile.photo_url} alt={profile.display_name} />
      ) : null}
      {profile.sport ? <p>{profile.sport}</p> : null}
      {profile.city ? <p>{profile.city}</p> : null}
      {profile.personal_message ? <p>{profile.personal_message}</p> : null}

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
        <Link href={encouragerHref}>Encourager {profile.display_name}</Link>
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
