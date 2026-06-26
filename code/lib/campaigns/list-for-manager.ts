/**
 * Liste « Mes campagnes » (correction d'écart de navigation, Phase 1.4b --
 * voir docs/DECISIONS.md). Avant cette tâche, le lien de navigation
 * « Campagnes » pointait directement vers `/campagnes/nouvelle` : un
 * responsable qui avait déjà créé une campagne n'avait AUCUN moyen de la
 * retrouver depuis la navigation (seul le lien envoyé juste après activation,
 * `/campagnes/[id]/demarrage`, y menait). Cette page comble ce trou.
 *
 * Même séparation logique/I/O que `lib/dashboards/team.ts` : une fonction
 * PURE (`buildCampaignListItems`) testée sans base de données, assemblée par
 * `loadCampaignListForCurrentUser` (I/O).
 *
 * Scope : AUCUNE logique de périmètre dupliquée ici -- la requête
 * `.from('campaigns').select('*')` est filtrée par la policy RLS
 * `campaigns_select_scoped` (migration 0003), exactement le même patron que
 * `app/(portails)/equipe/[teamId]/page.tsx` et `[campaignId]/rapport`
 * (« RLS est la seule source de vérité du scope », CLAUDE.md section 5).
 * Un `platform_admin` verra ainsi TOUTES les campagnes -- comportement voulu,
 * cohérent avec son accès total partout ailleurs dans le projet.
 *
 * Montant amassé : lu depuis la vue `v_campaign_progress` (jamais stocké en
 * dur, CLAUDE.md section 4) ; absence de ligne dans la vue (aucun crédit
 * encore) traitée comme `raisedCents: 0`, pas une erreur.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignsTable, CampaignStatus } from '@/lib/db/types';
import { campaignStatusLabelFr } from './close';

export type CampaignRow = CampaignsTable['Row'];

export type CampaignStatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const CAMPAIGN_STATUS_BADGE_VARIANTS: Record<CampaignStatus, CampaignStatusBadgeVariant> = {
  draft: 'neutral',
  pending_approval: 'warning',
  scheduled: 'warning',
  active: 'success',
  ended: 'info',
  closed: 'info',
  paid: 'info',
  cancelled: 'error',
  archived: 'neutral',
};

/** Fonction PURE. Décision de présentation autonome (voir docs/DECISIONS.md) :
 * aucune table/règle métier ne définit de variante de badge par statut, ce
 * choix ne touche ni l'argent ni la sécurité. */
export function campaignStatusBadgeVariant(status: CampaignStatus): CampaignStatusBadgeVariant {
  return CAMPAIGN_STATUS_BADGE_VARIANTS[status];
}

export interface CampaignProgressRow {
  campaign_id: string;
  raised_cents: number;
}

export interface CampaignListItem {
  id: string;
  name: string;
  status: CampaignStatus;
  statusLabel: string;
  statusBadgeVariant: CampaignStatusBadgeVariant;
  goalCents: number | null;
  raisedCents: number;
  createdAt: string;
}

/**
 * Fonction PURE. Trie du plus récent au plus ancien (`created_at`) -- la
 * campagne qu'on vient de créer doit apparaître en premier, c'est tout
 * l'objet de cette liste.
 */
export function buildCampaignListItems(
  campaigns: Array<Pick<CampaignRow, 'id' | 'name' | 'status' | 'goal_cents' | 'created_at'>>,
  progressRows: CampaignProgressRow[],
): CampaignListItem[] {
  const raisedByCampaignId = new Map(progressRows.map((row) => [row.campaign_id, row.raised_cents]));

  return [...campaigns]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      statusLabel: campaignStatusLabelFr(campaign.status),
      statusBadgeVariant: campaignStatusBadgeVariant(campaign.status),
      goalCents: campaign.goal_cents,
      raisedCents: raisedByCampaignId.get(campaign.id) ?? 0,
      createdAt: campaign.created_at,
    }));
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `TeamDashboardRepo`). */
export interface CampaignListRepo {
  listCampaigns(): Promise<Array<Pick<CampaignRow, 'id' | 'name' | 'status' | 'goal_cents' | 'created_at'>>>;
  listProgressForCampaigns(campaignIds: string[]): Promise<CampaignProgressRow[]>;
}

export function createSupabaseCampaignListRepo(supabase: SupabaseClient): CampaignListRepo {
  return {
    async listCampaigns() {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, status, goal_cents, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Array<Pick<CampaignRow, 'id' | 'name' | 'status' | 'goal_cents' | 'created_at'>>) ?? [];
    },
    async listProgressForCampaigns(campaignIds) {
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase
        .from('v_campaign_progress')
        .select('campaign_id, raised_cents')
        .in('campaign_id', campaignIds);
      if (error) throw error;
      return (data as CampaignProgressRow[]) ?? [];
    },
  };
}

/**
 * Charge la liste des campagnes visibles par l'utilisateur courant (scope
 * géré entièrement par RLS, voir commentaire de tête). Retourne toujours un
 * tableau, jamais `null` -- une liste vide est un résultat normal (utilisateur
 * sans aucune campagne encore), pas une erreur, voir l'état vide géré par la
 * page appelante.
 */
export async function loadCampaignListForCurrentUser(repo: CampaignListRepo): Promise<CampaignListItem[]> {
  const campaigns = await repo.listCampaigns();
  const progressRows = await repo.listProgressForCampaigns(campaigns.map((c) => c.id));
  return buildCampaignListItems(campaigns, progressRows);
}
