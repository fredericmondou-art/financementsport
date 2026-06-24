/**
 * Dashboard équipe (Tâche 1.5.6, docs/prompts/phase-1-5.md, section 33) : un
 * responsable de campagne (team_manager d'une équipe, ou club_admin via la
 * cascade existante) doit pouvoir suivre sa campagne « en un coup d'œil » --
 * objectif collectif, ventes totales, crédits générés, nombre de commandes,
 * panier moyen, ventes par athlète, progression dans le temps, commandes à
 * distribuer, statut de versement.
 *
 * Même séparation logique/I/O que `lib/distribution/build-list.ts`
 * (Tâche 1.5.4) : un `TeamDashboardRepo` injecté pour l'I/O, des fonctions
 * PURES (`computeCollectiveGoalCents`, `summarizeOrderSales`,
 * `buildAthleteCreditBreakdown`, `buildWeeklyProgression`,
 * `listOrdersToDistribute`, `summarizePayouts`) testées sans base de données
 * réelle, assemblées par `buildTeamDashboard` (pure) puis `loadTeamDashboard`
 * (I/O).
 *
 * Toutes les valeurs viennent de tables/agrégations recalculées à la
 * demande -- AUCUN solde stocké en dur (CLAUDE.md section 4) :
 *   - "objectif collectif" : somme des `goal_cents` des campagnes ACTIVES de
 *     l'équipe (`campaigns.team_id = teamId AND status = 'active'`). Une
 *     campagne terminée/fermée a déjà atteint ou dépassé son objectif --
 *     elle ne fait pas partie de l'objectif COURANT.
 *   - "ventes totales"/"nombre de commandes"/"panier moyen" : calculés sur
 *     les commandes PAYÉES (`isOrderPaid`, réutilisé de
 *     `lib/distribution/build-list.ts` pour ne pas dupliquer la définition
 *     de "payée" -- même liste de statuts que la liste de distribution,
 *     Tâche 1.5.4) dont `primary_campaign_id` appartient à une campagne de
 *     cette équipe, PEU IMPORTE le statut de cette campagne (l'historique
 *     complet compte pour les ventes totales, contrairement à l'objectif
 *     collectif courant ci-dessus).
 *   - "crédits générés"/"ventes par athlète" : lus DIRECTEMENT sur
 *     `order_credits` (même filtre `status IN ('active','pending')` que la
 *     vue `v_campaign_progress`, migration 0001), filtrés par BÉNÉFICIAIRE
 *     (l'équipe elle-même OU un de ses athlètes) plutôt que par campagne --
 *     décision autonome (voir docs/DECISIONS.md, Tâche 1.5.6), même esprit
 *     que la Tâche 1.5.4 : un crédit reste attribué à son bénéficiaire
 *     indépendamment de la campagne d'origine exacte de la commande. Ceci
 *     garantit aussi mécaniquement le critère d'acceptation « les ventes par
 *     athlète totalisent les ventes de l'équipe » : `buildAthleteCreditBreakdown`
 *     calcule `totalCents` comme la somme EXACTE des mêmes lignes qu'elle
 *     répartit, ce n'est pas un second calcul qui pourrait diverger.
 *   - "commandes à distribuer" : commandes dans les statuts `ready`/
 *     `delivered_to_team` (pas encore `distributed`) -- réutilise les
 *     statuts du flux de livraison groupée (`lib/orders/status.ts`,
 *     Tâche 1.5.5) sans réutiliser `DELIVERY_STATUS_FLOW` au complet (qui
 *     inclut aussi `completed`, déjà distribué).
 *   - "statut de versement" : lu sur `payouts`, accessible en lecture pour
 *     ces bénéficiaires depuis la migration 0016 (policy
 *     `payouts_select_campaign_managers`, réutilise
 *     `private.manages_beneficiary`).
 *
 * Scope (cahier : « un responsable ne voit que ses équipes ») : la page
 * appelante (`app/(portails)/equipe/[teamId]/page.tsx`) lit `teams` par id --
 * la policy RLS `teams_select` (migration 0005, `manages_team(id) OR
 * manages_club(club_id)`) retourne déjà `null` si l'utilisateur courant ne
 * gère pas cette équipe, exactement le même patron que `campaigns`/
 * `[campaignId]` pour les Tâches 1.5.1/1.5.2/1.5.4/1.5.5 -- aucune
 * vérification applicative supplémentaire requise, RLS est la seule source
 * de vérité du scope (CLAUDE.md section 5).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AthletesTable,
  BeneficiaryType,
  CampaignsTable,
  OrderCreditsTable,
  OrdersTable,
  OrderStatus,
  PayoutsTable,
  PayoutStatus,
  TeamsTable,
} from '@/lib/db/types';
import { beneficiaryLabelKey, loadBeneficiaryLabels } from '@/lib/cart/beneficiary-labels';
import { isOrderPaid } from '@/lib/distribution/build-list';

export type TeamRow = TeamsTable['Row'];
export type CampaignRow = CampaignsTable['Row'];
export type OrderRow = OrdersTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];
export type AthleteRow = AthletesTable['Row'];
export type PayoutRow = PayoutsTable['Row'];

export interface BeneficiaryRef {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
}

// -----------------------------------------------------------------------------
// Objectif collectif
// -----------------------------------------------------------------------------

/** Fonction PURE. Somme des `goal_cents` des campagnes ACTIVES uniquement. */
export function computeCollectiveGoalCents(campaigns: Array<Pick<CampaignRow, 'status' | 'goal_cents'>>): number {
  return campaigns
    .filter((campaign) => campaign.status === 'active')
    .reduce((sum, campaign) => sum + (campaign.goal_cents ?? 0), 0);
}

// -----------------------------------------------------------------------------
// Ventes totales / nombre de commandes / panier moyen
// -----------------------------------------------------------------------------

export interface OrderSalesSummary {
  totalSalesCents: number;
  orderCount: number;
  averageOrderCents: number;
}

/** Fonction PURE. `averageOrderCents` arrondi au centime le plus proche
 * (CLAUDE.md section 4 : entier, jamais de float stocké/retourné). */
export function summarizeOrderSales(orders: Array<Pick<OrderRow, 'status' | 'total_cents'>>): OrderSalesSummary {
  const paidOrders = orders.filter((order) => isOrderPaid(order.status));
  const totalSalesCents = paidOrders.reduce((sum, order) => sum + order.total_cents, 0);
  const orderCount = paidOrders.length;
  const averageOrderCents = orderCount === 0 ? 0 : Math.round(totalSalesCents / orderCount);
  return { totalSalesCents, orderCount, averageOrderCents };
}

// -----------------------------------------------------------------------------
// Crédits générés / ventes par athlète
// -----------------------------------------------------------------------------

const CREDIT_STATUSES_COUNTED = new Set(['active', 'pending']);

export interface AthleteSalesEntry {
  athleteId: string;
  displayName: string;
  creditCents: number;
}

export interface TeamCreditBreakdown {
  byAthlete: AthleteSalesEntry[];
  /** Crédits attribués directement à l'équipe (`beneficiary_type = 'team'`),
   * pas à un athlète précis -- jamais perdus ni mal attribués, voir
   * docs/DECISIONS.md, Tâche 1.5.6. */
  unassignedToAthleteCents: number;
  /** == somme(byAthlete[].creditCents) + unassignedToAthleteCents, par
   * construction (pas un second calcul qui pourrait diverger). */
  totalCents: number;
}

/**
 * Fonction PURE. `athletes` doit contenir TOUT le effectif de l'équipe
 * (effectif courant complet -- visibilité totale, voir docs/DECISIONS.md),
 * même les athlètes sans aucun crédit (apparaissent avec `creditCents: 0`).
 */
export function buildAthleteCreditBreakdown(input: {
  teamId: string;
  athletes: Array<{ id: string; displayName: string }>;
  credits: Array<Pick<OrderCreditRow, 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>>;
}): TeamCreditBreakdown {
  const { teamId, athletes, credits } = input;
  const eligible = credits.filter((credit) => CREDIT_STATUSES_COUNTED.has(credit.status));

  const creditByAthleteId = new Map<string, number>();
  let unassignedToAthleteCents = 0;
  for (const credit of eligible) {
    if (credit.beneficiary_type === 'athlete') {
      creditByAthleteId.set(
        credit.beneficiary_id,
        (creditByAthleteId.get(credit.beneficiary_id) ?? 0) + credit.amount_cents,
      );
    } else if (credit.beneficiary_type === 'team' && credit.beneficiary_id === teamId) {
      unassignedToAthleteCents += credit.amount_cents;
    }
    // Un crédit 'club' n'est jamais inclus ici : l'orchestrateur
    // (`loadTeamDashboard`) ne demande que les bénéficiaires
    // athlète/équipe de CETTE équipe.
  }

  const byAthlete: AthleteSalesEntry[] = athletes
    .map((athlete) => ({
      athleteId: athlete.id,
      displayName: athlete.displayName,
      creditCents: creditByAthleteId.get(athlete.id) ?? 0,
    }))
    .sort((a, b) => b.creditCents - a.creditCents || a.displayName.localeCompare(b.displayName, 'fr-CA'));

  const totalCents = byAthlete.reduce((sum, entry) => sum + entry.creditCents, 0) + unassignedToAthleteCents;

  return { byAthlete, unassignedToAthleteCents, totalCents };
}

// -----------------------------------------------------------------------------
// Progression dans le temps
// -----------------------------------------------------------------------------

/** Fonction PURE. Lundi (UTC) de la semaine ISO contenant `dateIso`, au
 * format `YYYY-MM-DD`. Utilisé pour regrouper la progression par semaine. */
export function isoWeekStart(dateIso: string): string {
  const date = new Date(dateIso);
  const utcMidnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = utcMidnight.getUTCDay(); // 0 = dimanche ... 6 = samedi
  const daysSinceMonday = (dayOfWeek + 6) % 7; // 0 = lundi
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - daysSinceMonday);
  return utcMidnight.toISOString().slice(0, 10);
}

export interface WeeklyProgressionPoint {
  weekStart: string;
  weekTotalCents: number;
  cumulativeCents: number;
}

/** Fonction PURE. Regroupe les crédits actifs/en attente par semaine
 * (`created_at`), triés chronologiquement, avec somme cumulative -- pour le
 * graphique de progression. Semaines sans aucun crédit : absentes de la
 * liste plutôt que des points à 0 (pas de calendrier de référence externe à
 * cette fonction pure ; la page peut combler les trous d'affichage si
 * besoin). */
export function buildWeeklyProgression(
  credits: Array<Pick<OrderCreditRow, 'amount_cents' | 'status' | 'created_at'>>,
): WeeklyProgressionPoint[] {
  const eligible = credits.filter((credit) => CREDIT_STATUSES_COUNTED.has(credit.status));

  const totalsByWeek = new Map<string, number>();
  for (const credit of eligible) {
    const weekStart = isoWeekStart(credit.created_at);
    totalsByWeek.set(weekStart, (totalsByWeek.get(weekStart) ?? 0) + credit.amount_cents);
  }

  const sortedWeeks = [...totalsByWeek.keys()].sort();
  let cumulativeCents = 0;
  return sortedWeeks.map((weekStart) => {
    const weekTotalCents = totalsByWeek.get(weekStart)!;
    cumulativeCents += weekTotalCents;
    return { weekStart, weekTotalCents, cumulativeCents };
  });
}

// -----------------------------------------------------------------------------
// Commandes à distribuer
// -----------------------------------------------------------------------------

/** Commandes payées mais pas encore distribuées aux athlètes -- même
 * vocabulaire que le flux de livraison groupée (`lib/orders/status.ts`,
 * Tâche 1.5.5), volontairement SANS `completed` (déjà distribuée) ni les
 * statuts antérieurs à `ready` (pas encore prêtes physiquement). */
const ORDERS_TO_DISTRIBUTE_STATUSES: ReadonlySet<OrderStatus> = new Set(['ready', 'delivered_to_team']);

export interface OrderToDistribute {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  totalCents: number;
}

/** Fonction PURE. */
export function listOrdersToDistribute(orders: OrderRow[]): OrderToDistribute[] {
  return orders
    .filter((order) => ORDERS_TO_DISTRIBUTE_STATUSES.has(order.status))
    .map((order) => ({
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      totalCents: order.total_cents,
    }))
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, 'fr-CA'));
}

// -----------------------------------------------------------------------------
// Statut de versement
// -----------------------------------------------------------------------------

const PAYOUT_STATUS_LABELS_FR: Record<PayoutStatus, string> = {
  calculated: 'Calculé',
  in_validation: 'En validation',
  approved: 'Approuvé',
  paid: 'Payé',
  adjusted: 'Ajusté',
  disputed: 'Contesté',
  closed: 'Clôturé',
};

/** Fonction PURE. */
export function payoutStatusLabelFr(status: PayoutStatus): string {
  return PAYOUT_STATUS_LABELS_FR[status];
}

export interface PayoutSummaryEntry {
  payoutId: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  beneficiaryLabel: string;
  status: PayoutStatus;
  statusLabel: string;
  amountCents: number;
  paidAt: string | null;
}

/** Fonction PURE. Triés du plus récent au plus ancien (`paid_at`, ou la fin
 * de liste si jamais payé -- versement encore `calculated`/`in_validation`/
 * `approved`). */
export function summarizePayouts(payouts: PayoutRow[], beneficiaryLabels: Map<string, string>): PayoutSummaryEntry[] {
  return payouts
    .map((payout) => ({
      payoutId: payout.id,
      beneficiaryType: payout.beneficiary_type,
      beneficiaryId: payout.beneficiary_id,
      beneficiaryLabel:
        beneficiaryLabels.get(beneficiaryLabelKey(payout.beneficiary_type, payout.beneficiary_id)) ??
        'Bénéficiaire inconnu',
      status: payout.status,
      statusLabel: payoutStatusLabelFr(payout.status),
      amountCents: payout.amount_cents,
      paidAt: payout.paid_at,
    }))
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));
}

// -----------------------------------------------------------------------------
// Assemblage (pur) + orchestration (I/O)
// -----------------------------------------------------------------------------

export interface TeamDashboard {
  team: { id: string; name: string };
  goalCents: number;
  sales: OrderSalesSummary;
  credits: TeamCreditBreakdown;
  progression: WeeklyProgressionPoint[];
  ordersToDistribute: OrderToDistribute[];
  payouts: PayoutSummaryEntry[];
}

/** Fonction PURE : assemble toutes les sections du dashboard à partir de
 * données déjà chargées. Testée indépendamment de tout repo. */
export function buildTeamDashboard(input: {
  team: Pick<TeamRow, 'id' | 'name'>;
  campaigns: Array<Pick<CampaignRow, 'status' | 'goal_cents'>>;
  orders: OrderRow[];
  credits: OrderCreditRow[];
  athletes: Array<{ id: string; displayName: string }>;
  payouts: PayoutRow[];
  beneficiaryLabels: Map<string, string>;
}): TeamDashboard {
  return {
    team: { id: input.team.id, name: input.team.name },
    goalCents: computeCollectiveGoalCents(input.campaigns),
    sales: summarizeOrderSales(input.orders),
    credits: buildAthleteCreditBreakdown({
      teamId: input.team.id,
      athletes: input.athletes,
      credits: input.credits,
    }),
    progression: buildWeeklyProgression(input.credits),
    ordersToDistribute: listOrdersToDistribute(input.orders),
    payouts: summarizePayouts(input.payouts, input.beneficiaryLabels),
  };
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `DistributionRepo`/`OrderStatusRepo`). */
export interface TeamDashboardRepo {
  getTeam(teamId: string): Promise<Pick<TeamRow, 'id' | 'name'> | null>;
  listCampaignsForTeam(teamId: string): Promise<Array<Pick<CampaignRow, 'id' | 'status' | 'goal_cents'>>>;
  /** Effectif COMPLET de l'équipe (actif ou non -- voir docs/DECISIONS.md :
   * un athlète ayant quitté l'équipe peut conserver des crédits historiques
   * qui doivent rester comptés dans le total de l'équipe). */
  listAthletesForTeam(teamId: string): Promise<AthleteRow[]>;
  listOrdersForCampaigns(campaignIds: string[]): Promise<OrderRow[]>;
  listCreditsForBeneficiaries(beneficiaries: BeneficiaryRef[]): Promise<OrderCreditRow[]>;
  listPayoutsForBeneficiaries(beneficiaries: BeneficiaryRef[]): Promise<PayoutRow[]>;
}

export function createSupabaseTeamDashboardRepo(supabase: SupabaseClient): TeamDashboardRepo {
  return {
    async getTeam(teamId) {
      const { data, error } = await supabase.from('teams').select('id, name').eq('id', teamId).maybeSingle();
      if (error) throw error;
      return data as Pick<TeamRow, 'id' | 'name'> | null;
    },
    async listCampaignsForTeam(teamId) {
      const { data, error } = await supabase.from('campaigns').select('id, status, goal_cents').eq('team_id', teamId);
      if (error) throw error;
      return (data as Array<Pick<CampaignRow, 'id' | 'status' | 'goal_cents'>>) ?? [];
    },
    async listAthletesForTeam(teamId) {
      const { data, error } = await supabase.from('athletes').select('*').eq('team_id', teamId);
      if (error) throw error;
      return (data as AthleteRow[]) ?? [];
    },
    async listOrdersForCampaigns(campaignIds) {
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase.from('orders').select('*').in('primary_campaign_id', campaignIds);
      if (error) throw error;
      return (data as OrderRow[]) ?? [];
    },
    async listCreditsForBeneficiaries(beneficiaries) {
      return queryByBeneficiary<OrderCreditRow>(supabase, 'order_credits', beneficiaries);
    },
    async listPayoutsForBeneficiaries(beneficiaries) {
      return queryByBeneficiary<PayoutRow>(supabase, 'payouts', beneficiaries);
    },
  };
}

/** Une table à bénéficiaire polymorphe ne peut pas être filtrée par une
 * seule clause `.in()` sur des paires (type, id) avec le client Supabase --
 * une requête par type présent, fusionnées. Notre ensemble de bénéficiaires
 * ne contient jamais 'club' ici (dashboard ÉQUIPE), mais la fonction reste
 * générique au cas où elle serait réutilisée. */
async function queryByBeneficiary<T>(
  supabase: SupabaseClient,
  table: 'order_credits' | 'payouts',
  beneficiaries: BeneficiaryRef[],
): Promise<T[]> {
  const idsByType: Record<BeneficiaryType, string[]> = { athlete: [], team: [], club: [] };
  for (const beneficiary of beneficiaries) {
    idsByType[beneficiary.beneficiaryType].push(beneficiary.beneficiaryId);
  }

  const results: T[] = [];
  for (const type of ['athlete', 'team', 'club'] as const) {
    const ids = [...new Set(idsByType[type])];
    if (ids.length === 0) continue;
    const { data, error } = await supabase.from(table).select('*').eq('beneficiary_type', type).in('beneficiary_id', ids);
    if (error) throw error;
    results.push(...((data as T[]) ?? []));
  }
  return results;
}

/**
 * Charge et assemble le dashboard complet d'une équipe. Retourne `null` si
 * l'équipe n'existe pas OU n'est pas accessible (RLS -- `repo.getTeam`
 * appelle `teams_select`, qui retourne `null` plutôt qu'une erreur pour une
 * équipe hors scope, exactement comme une ligne absente).
 */
export async function loadTeamDashboard(
  teamId: string,
  repo: TeamDashboardRepo,
  supabase: SupabaseClient,
): Promise<TeamDashboard | null> {
  const team = await repo.getTeam(teamId);
  if (!team) {
    return null;
  }

  const [campaigns, athleteRows] = await Promise.all([
    repo.listCampaignsForTeam(teamId),
    repo.listAthletesForTeam(teamId),
  ]);

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const beneficiaries: BeneficiaryRef[] = [
    ...athleteRows.map((athlete) => ({ beneficiaryType: 'athlete' as const, beneficiaryId: athlete.id })),
    { beneficiaryType: 'team' as const, beneficiaryId: teamId },
  ];

  const [orders, credits, payouts, beneficiaryLabels] = await Promise.all([
    repo.listOrdersForCampaigns(campaignIds),
    repo.listCreditsForBeneficiaries(beneficiaries),
    repo.listPayoutsForBeneficiaries(beneficiaries),
    loadBeneficiaryLabels(supabase, beneficiaries),
  ]);

  const athletes = athleteRows.map((athlete) => ({
    id: athlete.id,
    displayName:
      beneficiaryLabels.get(beneficiaryLabelKey('athlete', athlete.id)) ?? `${athlete.first_name} ${athlete.last_name}`,
  }));

  return buildTeamDashboard({ team, campaigns, orders, credits, athletes, payouts, beneficiaryLabels });
}
