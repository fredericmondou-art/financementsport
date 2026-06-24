/**
 * Chargement des données d'une page publique (athlète/équipe/club),
 * Tâche 1.6. Toutes les lectures passent par les vues publiques `v_public_*`
 * (jamais les tables brutes), exactement comme `lib/catalog/products.ts`
 * pour la lecture publique du catalogue — voir CLAUDE.md section 5/6.
 *
 * `v_public_campaign`/`v_public_campaign_products` (migration 0007) ont été
 * créées À CETTE TÂCHE pour combler la lacune identifiée à la Tâche 0.4
 * (`campaigns` n'a aucune policy SELECT pour `anon`) — voir docs/DECISIONS.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BeneficiaryType,
  VCampaignProgressView,
  VCampaignSupporterCountView,
  VPublicAthleteView,
  VPublicClubView,
  VPublicTeamView,
} from '@/lib/db/types';
import { createSupabaseProductRepo, listPublicProducts, type ProductRepo, type ProductRow } from '@/lib/catalog/products';
import {
  applyAmountsMask,
  computeCampaignProgress,
  computeDaysRemaining,
  pickMostRelevantCampaign,
  type CampaignProgress,
  type PublicCampaignRow,
} from './campaign-progress';
import { selectRecommendedProducts } from './recommended-products';

export type PublicAthleteRow = VPublicAthleteView['Row'];
export type PublicTeamRow = VPublicTeamView['Row'];
export type PublicClubRow = VPublicClubView['Row'];

/** Accès aux vues publiques, injecté pour permettre des tests sans base de
 * données réelle (même pattern que `ProductRepo`/`CartRepo`). */
export interface PublicProfileRepo {
  getAthleteBySlug(slug: string): Promise<PublicAthleteRow | null>;
  getTeamBySlug(slug: string): Promise<PublicTeamRow | null>;
  getClubBySlug(slug: string): Promise<PublicClubRow | null>;
  /** Toutes les campagnes publiques actives ciblant directement ce
   * bénéficiaire (`pickMostRelevantCampaign` choisit laquelle afficher). */
  listActiveCampaignsForBeneficiary(
    beneficiaryType: BeneficiaryType,
    beneficiaryId: string,
  ): Promise<PublicCampaignRow[]>;
  getCampaignProgress(campaignId: string): Promise<VCampaignProgressView['Row'] | null>;
  getCampaignProductIds(campaignId: string): Promise<string[]>;
  /** Nombre de commandes DISTINCTES ayant généré un crédit actif/en attente
   * pour cette campagne (Tâche 1.6.C2, page de suivi de l'athlète) --
   * PAS le nombre de personnes uniques (pas d'identité unifiée invité/
   * connecté dans ce projet, CLAUDE.md section 63 ; une même personne qui
   * achète deux fois compte deux fois). L'agrégation (COUNT DISTINCT) vit
   * dans la vue `v_campaign_supporter_count` (migration 0011), pas ici --
   * même principe que `raised_cents`/`v_campaign_progress` : jamais de
   * lecture brute de `order_credits` depuis une page, seulement des vues
   * d'agrégation (voir docs/DECISIONS.md). */
  getSupporterCount(campaignId: string): Promise<number>;
}

export function createSupabasePublicProfileRepo(supabase: SupabaseClient): PublicProfileRepo {
  return {
    async getAthleteBySlug(slug) {
      const { data, error } = await supabase.from('v_public_athlete').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return (data as PublicAthleteRow) ?? null;
    },
    async getTeamBySlug(slug) {
      const { data, error } = await supabase.from('v_public_team').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return (data as PublicTeamRow) ?? null;
    },
    async getClubBySlug(slug) {
      const { data, error } = await supabase.from('v_public_club').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return (data as PublicClubRow) ?? null;
    },
    async listActiveCampaignsForBeneficiary(beneficiaryType, beneficiaryId) {
      const { data, error } = await supabase
        .from('v_public_campaign')
        .select('*')
        .eq('beneficiary_type', beneficiaryType)
        .eq('beneficiary_id', beneficiaryId);
      if (error) throw error;
      return (data as PublicCampaignRow[]) ?? [];
    },
    async getCampaignProgress(campaignId) {
      const { data, error } = await supabase
        .from('v_campaign_progress')
        .select('*')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      if (error) throw error;
      return (data as VCampaignProgressView['Row']) ?? null;
    },
    async getCampaignProductIds(campaignId) {
      const { data, error } = await supabase
        .from('v_public_campaign_products')
        .select('product_id')
        .eq('campaign_id', campaignId);
      if (error) throw error;
      return ((data as Array<{ product_id: string }>) ?? []).map((row) => row.product_id);
    },
    async getSupporterCount(campaignId) {
      const { data, error } = await supabase
        .from('v_campaign_supporter_count')
        .select('supporter_count')
        .eq('campaign_id', campaignId)
        .maybeSingle();
      if (error) throw error;
      return (data as VCampaignSupporterCountView['Row'] | null)?.supporter_count ?? 0;
    },
  };
}

export interface PublicCampaignSection {
  campaign: PublicCampaignRow;
  progress: CampaignProgress;
  daysRemaining: number | null;
}

export interface PublicProfileData<TProfile> {
  profile: TProfile;
  /** `null` si aucune campagne active ne cible ce bénéficiaire en ce
   * moment : la page affiche alors le profil et le catalogue général, sans
   * section objectif/progression (voir docs/DECISIONS.md). */
  campaignSection: PublicCampaignSection | null;
  recommendedProducts: ProductRow[];
}

/**
 * Assemble la section "campagne" (objectif/progression/jours restants) et
 * les packs recommandés pour un bénéficiaire donné. Partagée par les trois
 * pages publiques — seule la récupération du profil lui-même diffère par
 * type. `hideAmounts` n'est appliqué que par l'appelant athlète (seule table
 * porteuse de ce champ) via `applyAmountsMask` après l'appel.
 */
async function loadCampaignAndProducts(
  repo: PublicProfileRepo,
  productRepo: ProductRepo,
  beneficiaryType: BeneficiaryType,
  beneficiaryId: string,
): Promise<{ campaignSection: PublicCampaignSection | null; recommendedProducts: ProductRow[] }> {
  const [activeCampaigns, allActiveProducts] = await Promise.all([
    repo.listActiveCampaignsForBeneficiary(beneficiaryType, beneficiaryId),
    listPublicProducts({ sort: 'credit_desc' }, productRepo),
  ]);
  const campaign = pickMostRelevantCampaign(activeCampaigns);

  if (!campaign) {
    return {
      campaignSection: null,
      recommendedProducts: selectRecommendedProducts(allActiveProducts, []),
    };
  }

  const [progressRow, campaignProductIds] = await Promise.all([
    repo.getCampaignProgress(campaign.id),
    repo.getCampaignProductIds(campaign.id),
  ]);

  return {
    campaignSection: {
      campaign,
      progress: computeCampaignProgress(progressRow?.raised_cents ?? 0, campaign.goal_cents),
      daysRemaining: computeDaysRemaining(campaign.ends_at),
    },
    recommendedProducts: selectRecommendedProducts(allActiveProducts, campaignProductIds),
  };
}

export async function loadPublicAthleteProfile(
  supabase: SupabaseClient,
  slug: string,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
  productRepo: ProductRepo = createSupabaseProductRepo(supabase),
): Promise<PublicProfileData<PublicAthleteRow> | null> {
  const profile = await repo.getAthleteBySlug(slug);
  if (!profile) {
    return null;
  }

  const { campaignSection, recommendedProducts } = await loadCampaignAndProducts(
    repo,
    productRepo,
    'athlete',
    profile.id,
  );

  // hide_amounts : seule athletes porte ce champ — voir docs/DECISIONS.md.
  const maskedCampaignSection: PublicCampaignSection | null = campaignSection
    ? { ...campaignSection, progress: applyAmountsMask(campaignSection.progress, profile.hide_amounts) }
    : null;

  return { profile, campaignSection: maskedCampaignSection, recommendedProducts };
}

export async function loadPublicTeamProfile(
  supabase: SupabaseClient,
  slug: string,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
  productRepo: ProductRepo = createSupabaseProductRepo(supabase),
): Promise<PublicProfileData<PublicTeamRow> | null> {
  const profile = await repo.getTeamBySlug(slug);
  if (!profile) {
    return null;
  }
  const { campaignSection, recommendedProducts } = await loadCampaignAndProducts(repo, productRepo, 'team', profile.id);
  return { profile, campaignSection, recommendedProducts };
}

export async function loadPublicClubProfile(
  supabase: SupabaseClient,
  slug: string,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
  productRepo: ProductRepo = createSupabaseProductRepo(supabase),
): Promise<PublicProfileData<PublicClubRow> | null> {
  const profile = await repo.getClubBySlug(slug);
  if (!profile) {
    return null;
  }
  const { campaignSection, recommendedProducts } = await loadCampaignAndProducts(repo, productRepo, 'club', profile.id);
  return { profile, campaignSection, recommendedProducts };
}
