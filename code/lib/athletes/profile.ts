/**
 * Tâche 1.6.C1 — profil athlète éditable (vue privée du parent/tuteur ou de
 * l'athlète majeur lui-même) : liste « mes athlètes » + objectif de la
 * campagne active, affiché en lecture seule sur la page d'édition.
 *
 * Décision autonome (voir docs/DECISIONS.md, Tâche 1.6.C1) : aucun nouveau
 * champ « objectif personnel » n'est ajouté à la table `athletes` — l'objectif
 * affiché est celui de la campagne active de l'athlète, déjà la source de
 * vérité affichée sur la page publique (CLAUDE.md section 4, « les soldes ne
 * se stockent pas en dur », appliqué par analogie : pas de duplication d'une
 * donnée déjà calculée ailleurs). Un gérant d'équipe/club crée et règle cet
 * objectif via l'assistant de campagne (Tâche 1.6.B1) ; cette page se
 * contente de l'afficher en lecture seule pour que le parent comprenne le
 * contexte de campagne de son enfant.
 *
 * Important, deux différences volontaires avec `loadPublicAthleteProfile`
 * (lib/public/profile.ts) :
 * - On ne lit JAMAIS `v_public_athlete` ici (cette vue exclut les mineurs
 *   sans consentement parental) — le parent doit voir l'objectif de son
 *   enfant même AVANT d'avoir donné ce consentement, sinon il ne pourrait
 *   jamais comprendre pourquoi sa page n'est pas visible publiquement.
 * - On n'applique JAMAIS `applyAmountsMask` : `hide_amounts` ne masque les
 *   montants qu'au public, jamais au parent/tuteur qui décide de l'activer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabasePublicProfileRepo,
  type PublicCampaignSection,
  type PublicProfileRepo,
} from '@/lib/public/profile';
import { computeCampaignProgress, computeDaysRemaining, pickMostRelevantCampaign } from '@/lib/public/campaign-progress';
import type { AthleteRow } from '@/lib/entities/athletes';

/** `repo` est injectable (même pattern que `loadPublicAthleteProfile`,
 * lib/public/profile.ts) pour permettre des tests sans base de données
 * réelle -- les appels applicatifs ne passent que `supabase` + `athleteId`,
 * le repo réel étant construit par défaut. */
export async function loadOwnerCampaignSection(
  supabase: SupabaseClient,
  athleteId: string,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
): Promise<PublicCampaignSection | null> {
  const activeCampaigns = await repo.listActiveCampaignsForBeneficiary('athlete', athleteId);
  const campaign = pickMostRelevantCampaign(activeCampaigns);
  if (!campaign) {
    return null;
  }
  const progressRow = await repo.getCampaignProgress(campaign.id);
  return {
    campaign,
    progress: computeCampaignProgress(progressRow?.raised_cents ?? 0, campaign.goal_cents),
    daysRemaining: computeDaysRemaining(campaign.ends_at),
  };
}

export interface AthleteSuivi {
  campaignSection: PublicCampaignSection | null;
  /** Nombre de commandes distinctes ayant soutenu la campagne active
   * (`PublicProfileRepo#getSupporterCount`, vue `v_campaign_supporter_count`,
   * migration 0011) -- `null` si aucune campagne active (rien à compter),
   * distinct de `0` (campagne active, aucun supporter pour l'instant). Pas
   * de classement (cahier des charges, Tâche 1.6.C2 : « pas de palmarès »). */
  supporterCount: number | null;
}

/**
 * Tâche 1.6.C2 — données de la page de suivi de progression de l'athlète :
 * objectif, montant amassé, nombre de supporters. Compose
 * `loadOwnerCampaignSection` (déjà utilisée par la page d'édition, Tâche
 * 1.6.C1) avec `repo.getSupporterCount`, appelé seulement s'il y a une
 * campagne active (sinon aucun `campaign_id` à interroger).
 */
export async function loadAthleteSuivi(
  supabase: SupabaseClient,
  athleteId: string,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
): Promise<AthleteSuivi> {
  const campaignSection = await loadOwnerCampaignSection(supabase, athleteId, repo);
  if (!campaignSection) {
    return { campaignSection: null, supporterCount: null };
  }
  const supporterCount = await repo.getSupporterCount(campaignSection.campaign.id);
  return { campaignSection, supporterCount };
}

/** Accès en lecture seule aux athlètes dont l'utilisateur courant est le
 * tuteur (`guardian_id`) ou l'athlète majeur lui-même (`user_id`) — séparé de
 * `AthleteRepo` (lib/entities/athletes.ts) pour ne pas alourdir son contrat
 * avec un besoin propre à la page « Mes athlètes » (même style que
 * `ExistingAthleteRepo`, lib/athletes/bulk-add.ts). */
export interface MyAthletesRepo {
  listAthletesManagedByUser(userId: string): Promise<AthleteRow[]>;
}

export function createSupabaseMyAthletesRepo(supabase: SupabaseClient): MyAthletesRepo {
  return {
    async listAthletesManagedByUser(userId) {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .or(`guardian_id.eq.${userId},user_id.eq.${userId}`)
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data as AthleteRow[]) ?? [];
    },
  };
}
