/**
 * Identité d'un bénéficiaire (équipe/club/athlète) par id, pour l'aperçu
 * fidèle de la page publique dans l'assistant de campagne (Tâche 1.6.B3,
 * étape « Récapitulatif ») et pour l'écran « prochaines actions » qui suit
 * l'activation. Mêmes vues publiques `v_public_*` que `lib/public/profile.ts`
 * (jamais les tables brutes, CLAUDE.md section 5) -- seule la clé de
 * recherche change (id plutôt que slug) : le brouillon de campagne et la
 * ligne `campaigns` ne connaissent le bénéficiaire que par UUID, jamais par
 * slug.
 *
 * Ne charge QUE l'identité (nom, image, message, slug) -- pas de section
 * campagne : pendant la rédaction du brouillon, la campagne elle-même
 * n'existe pas encore en base (elle n'est créée qu'à l'activation, voir
 * `createCampaignFromDraftAction`). La section "campagne" affichée dans
 * l'aperçu est construite séparément, sans aucune dépendance I/O, par
 * `lib/campaigns/draft-preview.ts#buildDraftPreviewCampaignSection`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType } from '@/lib/db/types';

export interface BeneficiaryPreviewIdentity {
  name: string;
  slug: string;
  imageUrl: string | null;
  bodyText: string | null;
  /** Champs bruts pour que l'appelant construise ses badges -- jamais un
   * champ masqué (`hide_*`) qui ne serait pas déjà respecté par la vue
   * publique elle-même (CLAUDE.md section 5). */
  sport: string | null;
  category: string | null;
  city: string | null;
  province: string | null;
}

export interface BeneficiaryPreviewRepo {
  getTeamIdentityById(id: string): Promise<BeneficiaryPreviewIdentity | null>;
  getClubIdentityById(id: string): Promise<BeneficiaryPreviewIdentity | null>;
  getAthleteIdentityById(id: string): Promise<BeneficiaryPreviewIdentity | null>;
}

interface PublicTeamIdentityRow {
  name: string;
  slug: string;
  logo_url: string | null;
  sport: string | null;
  category: string | null;
  city: string | null;
  province: string | null;
}

interface PublicClubIdentityRow {
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  city: string | null;
  province: string | null;
}

interface PublicAthleteIdentityRow {
  display_name: string;
  slug: string;
  photo_url: string | null;
  personal_message: string | null;
  sport: string | null;
  city: string | null;
}

export function createSupabaseBeneficiaryPreviewRepo(supabase: SupabaseClient): BeneficiaryPreviewRepo {
  return {
    async getTeamIdentityById(id) {
      const { data, error } = await supabase.from('v_public_team').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as PublicTeamIdentityRow;
      return {
        name: row.name,
        slug: row.slug,
        imageUrl: row.logo_url,
        bodyText: null,
        sport: row.sport,
        category: row.category,
        city: row.city,
        province: row.province,
      };
    },
    async getClubIdentityById(id) {
      const { data, error } = await supabase.from('v_public_club').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as PublicClubIdentityRow;
      return {
        name: row.name,
        slug: row.slug,
        imageUrl: row.logo_url,
        bodyText: row.description,
        sport: null,
        category: null,
        city: row.city,
        province: row.province,
      };
    },
    async getAthleteIdentityById(id) {
      const { data, error } = await supabase.from('v_public_athlete').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as PublicAthleteIdentityRow;
      return {
        name: row.display_name,
        slug: row.slug,
        imageUrl: row.photo_url,
        bodyText: row.personal_message,
        sport: row.sport,
        category: null,
        city: row.city,
        province: null,
      };
    },
  };
}

/**
 * `beneficiaryType`/`beneficiaryId` proviennent soit du brouillon (étapes 1
 * à 5, validés au plus en partie), soit d'une `campaigns.Row` réelle
 * (toujours définis) -- `null`/`undefined` sont acceptés pour couvrir le cas
 * "le brouillon n'a pas encore rempli l'étape Bénéficiaire", auquel cas
 * aucun aperçu d'identité ne peut être construit.
 */
export async function loadBeneficiaryPreviewIdentity(
  beneficiaryType: BeneficiaryType | null | undefined,
  beneficiaryId: string | null | undefined,
  repo: BeneficiaryPreviewRepo,
): Promise<BeneficiaryPreviewIdentity | null> {
  if (!beneficiaryType || !beneficiaryId) {
    return null;
  }
  if (beneficiaryType === 'team') return repo.getTeamIdentityById(beneficiaryId);
  if (beneficiaryType === 'club') return repo.getClubIdentityById(beneficiaryId);
  return repo.getAthleteIdentityById(beneficiaryId);
}

/**
 * Chemin de la VRAIE page publique d'un bénéficiaire -- même routage que
 * les 3 pages publiques (Tâche 1.6) : `/team/[slug]`, `/club/[slug]`,
 * `/[athleteSlug]` (route top-level pour l'athlète, lien court à partager).
 * Fonction pure, partagée par l'aperçu du brouillon et l'écran de
 * démarrage, pour qu'un seul endroit connaisse cette correspondance.
 */
export function buildBeneficiaryPublicPath(beneficiaryType: BeneficiaryType, slug: string): string {
  if (beneficiaryType === 'team') return `/team/${slug}`;
  if (beneficiaryType === 'club') return `/club/${slug}`;
  return `/${slug}`;
}
