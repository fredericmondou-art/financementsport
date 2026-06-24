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
 *
 * Habillage Tâche 1.4.4 : Card/Badge/ProgressBar/Button du système de
 * design, présentation uniquement — aucun texte affiché par cette page n'a
 * changé (voir tests/e2e/public-profile.spec.ts : titre h1, lien
 * "Encourager", "Cette campagne est active.", absence du texte
 * "amassés sur un objectif" quand les montants sont masqués).
 *
 * `generateMetadata` (Tâche 1.4.5) : aperçu de partage social correct quand
 * ce lien est envoyé sur Messenger/Facebook (section 54). Construit
 * uniquement à partir du nom et de la campagne — ne référence jamais
 * `campaignSection.progress` (raisedCents/goalCents), pour ne jamais
 * exposer dans un aperçu de partage un montant que `hide_amounts` masque
 * sur la page elle-même (CLAUDE.md section 2). Appelle le même chargeur que
 * la page (`loadPublicAthleteProfile`) : requête Supabase dupliquée par
 * rendu, acceptable pour la V1 (ces loaders ne sont pas encore mémoïsés via
 * `cache()` de React — voir docs/DECISIONS.md).
 *
 * État vide (Tâche 1.4.5) : "Aucune campagne active pour le moment." passé
 * dans `Alert variant="info"` pour plus de clarté visuelle — texte
 * inchangé.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicAthleteProfile } from '@/lib/public/profile';
import { Badge } from '@/components/ui/badge';
import { PublicProfileView } from '@/components/public-profile-view';

interface AthletePageProps {
  params: { athleteSlug: string };
}

export async function generateMetadata({ params }: AthletePageProps): Promise<Metadata> {
  const supabase = createSupabaseServerClient();
  const data = await loadPublicAthleteProfile(supabase, params.athleteSlug);
  if (!data || data.profile.show_team_only) {
    return { title: 'Profil introuvable' };
  }
  const { profile, campaignSection } = data;
  const title = profile.display_name;
  const description = campaignSection
    ? `Soutenez ${profile.display_name} — ${campaignSection.campaign.name}.`
    : `Découvrez et soutenez ${profile.display_name}.`;
  return {
    title,
    description,
    openGraph: {
      type: 'profile',
      title,
      description,
      images: profile.photo_url ? [{ url: profile.photo_url }] : undefined,
    },
    twitter: {
      card: profile.photo_url ? 'summary_large_image' : 'summary',
      title,
      description,
      images: profile.photo_url ? [profile.photo_url] : undefined,
    },
  };
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
    <main className="page stack">
      <PublicProfileView
        imageUrl={profile.photo_url}
        imageAlt={profile.display_name}
        name={profile.display_name}
        badges={
          <>
            {profile.sport ? <Badge variant="info">{profile.sport}</Badge> : null}
            {profile.city ? <Badge>{profile.city}</Badge> : null}
          </>
        }
        bodyText={profile.personal_message}
        campaignSection={campaignSection}
        encouragerHref={encouragerHref}
        recommendedProducts={recommendedProducts}
      />
    </main>
  );
}
