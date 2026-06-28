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
 *
 * TÂCHE V7 (refonte visuelle) : `publicUrl` passée à `PublicProfileView`
 * pour le bouton « Partager ce profil » — voir le commentaire équivalent sur
 * la page athlète et le commentaire de tête de ce composant.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { loadPublicClubProfile } from '@/lib/public/profile';
import { getPublicAppUrl } from '@/lib/env';
import { buildBeneficiaryPublicPath } from '@/lib/public/preview';
import { Badge } from '@/components/ui/badge';
import { PublicProfileView } from '@/components/public-profile-view';

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
  const publicUrl = `${getPublicAppUrl()}${buildBeneficiaryPublicPath('club', params.slug)}`;

  return (
    <main className="page stack">
      <PublicProfileView
        imageUrl={profile.logo_url}
        imageAlt={profile.name}
        name={profile.name}
        badges={
          <>{profile.city ? <Badge>{[profile.city, profile.province].filter(Boolean).join(', ')}</Badge> : null}</>
        }
        bodyText={profile.description}
        campaignSection={campaignSection}
        encouragerHref={encouragerHref}
        recommendedProducts={recommendedProducts}
        publicUrl={publicUrl}
      />
    </main>
  );
}
