/**
 * Export des commandes (admin) — Tâche 1.5.11, docs/prompts/phase-1-5.md.
 * Filtrable par campagne, équipe, période, statut ; colonnes montants/taxes
 * (ventilées TPS/TVQ)/crédits/bénéficiaires/statut, montants convertis en
 * dollars. Réutilise `lib/export/csv.ts` (Tâche 1.5.4, prévu explicitement
 * pour cette tâche), `splitQcTax`/`findApplicableTaxRateBps`/
 * `DEFAULT_BILLING_PROVINCE` (Tâche 1.5.9, même ventilation TPS/TVQ que le
 * rapport de campagne — voir le critère d'acceptation "les totaux de
 * l'export correspondent au rapport de campagne"), et `isOrderPaid`/
 * `orderStatusLabelFr` (Tâche 1.5.4) pour rester cohérent avec le reste du
 * projet sur ce qui compte comme "payé".
 *
 * Même séparation logique/I/O que les autres modules de la Phase 1.5 :
 * fonctions PURES (filtrage, assemblage des lignes) testées sans base
 * réelle, un repo injecté pour l'I/O, assemblées par `loadOrderExportData`
 * (orchestration).
 *
 * Décisions autonomes (voir docs/DECISIONS.md, Tâche 1.5.11) :
 *   - Garde d'accès dédiée `canExportOrders` (même patron que
 *     `lib/dashboards/admin.ts#canViewAdminDashboard`) plutôt qu'une entrée
 *     dans `lib/auth/permissions.ts#can` : pas de forme de `Resource`
 *     naturelle pour "toutes les commandes, sans notion de propriétaire".
 *   - Filtre de période sur `orders.created_at` (toujours renseigné), pas
 *     `paid_at` (nullable — une commande non payée n'a pas de date de
 *     paiement, et l'export doit pouvoir lister aussi les commandes non
 *     payées, utile à la logistique/au suivi, pas seulement à la
 *     comptabilité).
 *   - Double application des filtres : la requête Supabase filtre déjà
 *     (efficacité), et `applyOrderExportFilters` (pure) refiltre le résultat
 *     en mémoire avant l'assemblage — défense en profondeur légère, dans le
 *     même esprit que le RPC + trigger de la Tâche 1.5.10, pour garantir le
 *     critère d'acceptation "l'export reflète exactement les filtres
 *     appliqués" même si une requête était mal construite.
 *   - Colonne "Crédit total" = `orders.credit_total_cents` (déjà calculé et
 *     stocké à la création de la commande, CLAUDE.md section 4 — ce n'est
 *     PAS un solde courant, c'est un figeage historique au moment de la
 *     commande), pas une re-somme des `order_credits` actifs : cohérent avec
 *     la colonne déjà exposée sur `orders`, mais peut diverger du
 *     `creditTotalCents` du rapport de campagne (Tâche 1.5.9, qui somme les
 *     `order_credits` ACTIFS scopés par `campaign_id` du crédit, pas de la
 *     commande) — même limitation déjà documentée au rapport de campagne
 *     (divergence commande multi-bénéficiaires/multi-campagnes), pas
 *     introduite ici. En revanche, les ventes/taxes/livraison (le cœur du
 *     critère d'acceptation de réconciliation) proviennent des MÊMES
 *     colonnes `orders.total_cents`/`tax_cents`/`shipping_cents` que
 *     `summarizeSales`/`summarizeTaxBreakdown`, donc concordent exactement
 *     pour les commandes payées d'une même campagne.
 *   - Colonne "Bénéficiaires" : TOUTES les lignes `order_credits` de la
 *     commande, quel que soit leur statut (pas seulement `active`) — cet
 *     export sert la traçabilité comptable/logistique complète, pas
 *     l'affichage d'un solde dû (différent de `summarizeCreditTotal`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignsTable, OrderCreditsTable, OrderStatus, OrdersTable, TaxRatesTable, TeamsTable } from '@/lib/db/types';
import { isOrderPaid, orderStatusLabelFr } from '@/lib/distribution/build-list';
import { beneficiaryLabelKey, loadBeneficiaryLabels } from '@/lib/cart/beneficiary-labels';
import { DEFAULT_BILLING_PROVINCE, findApplicableTaxRateBps, splitQcTax } from '@/lib/reports/campaign';
import { formatCents } from '@/lib/format-cents';
import { buildCsv } from '@/lib/export/csv';

export type OrderRow = OrdersTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];
export type TaxRateRow = TaxRatesTable['Row'];
export type CampaignRow = CampaignsTable['Row'];
export type TeamRow = TeamsTable['Row'];

// -----------------------------------------------------------------------------
// Accès — rôles autorisés
// -----------------------------------------------------------------------------

/** Fonction PURE. Même patron que `lib/dashboards/admin.ts#canViewAdminDashboard` :
 * RLS autorise déjà la lecture des commandes à `accounting`/`platform_admin`
 * (migration 0005, `orders_select_scoped`), mais ne bloque pas la PAGE elle-même
 * (RLS ne fait que scoper/vider un résultat) — d'où cette garde explicite,
 * testable indépendamment, vérifiée par la page et par la route d'export. */
export function canExportOrders(role: string | null | undefined): boolean {
  return role === 'platform_admin' || role === 'accounting';
}

// -----------------------------------------------------------------------------
// Filtres (purs)
// -----------------------------------------------------------------------------

export interface OrderExportFilters {
  campaignId: string | null;
  teamId: string | null;
  status: OrderStatus | null;
  /** Plage sur `orders.created_at` (ISO 8601), bornes incluses. `null` = pas de borne. */
  periodStartIso: string | null;
  periodEndIso: string | null;
}

export const EMPTY_ORDER_EXPORT_FILTERS: OrderExportFilters = {
  campaignId: null,
  teamId: null,
  status: null,
  periodStartIso: null,
  periodEndIso: null,
};

/** Toutes les valeurs valides de `OrderStatus` -- pas d'export public de cette
 * liste depuis `lib/db/types.ts` (un simple union type), donc dupliquée ici
 * pour valider les paramètres de requête (`status=...`) avant de les
 * transmettre au filtre. À tenir synchronisée si `OrderStatus` change. */
export const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  'payment_pending',
  'paid',
  'preparing',
  'ready',
  'delivered_to_team',
  'distributed',
  'completed',
  'cancelled',
  'refunded',
  'partially_refunded',
  'error',
];

function isValidOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}

/** Fonction PURE. Borne de début de journée (UTC) pour un filtre de période
 * exprimé en date seule (`YYYY-MM-DD`, ex. un `<input type="date">`). */
export function dayStartIso(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

/** Fonction PURE. Borne de fin de journée (UTC), bornes incluses -- voir
 * `dayStartIso`. */
export function dayEndIso(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999Z`;
}

export interface OrderExportSearchParams {
  campaignId?: string;
  teamId?: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
}

/** Fonction PURE : un seul point de conversion `searchParams` (page ET route
 * d'export CSV) → `OrderExportFilters`, pour qu'une valeur invalide/absente
 * soit traitée IDENTIQUEMENT aux deux endroits (garantit le critère
 * d'acceptation "l'export reflète exactement les filtres appliqués" -- la
 * page affiche et l'export télécharge toujours le même sous-ensemble). Un
 * `status` inconnu (paramètre trafiqué) est traité comme absent, jamais
 * comme une erreur silencieuse qui élargirait le résultat. */
export function parseOrderExportFilters(params: OrderExportSearchParams): OrderExportFilters {
  return {
    campaignId: params.campaignId ? params.campaignId : null,
    teamId: params.teamId ? params.teamId : null,
    status: params.status && isValidOrderStatus(params.status) ? params.status : null,
    periodStartIso: params.periodStart ? dayStartIso(params.periodStart) : null,
    periodEndIso: params.periodEnd ? dayEndIso(params.periodEnd) : null,
  };
}

type FilterableOrderFields = Pick<OrderRow, 'primary_campaign_id' | 'team_id' | 'status' | 'created_at'>;

/** Fonction PURE. */
export function matchesOrderExportFilters(order: FilterableOrderFields, filters: OrderExportFilters): boolean {
  if (filters.campaignId !== null && order.primary_campaign_id !== filters.campaignId) return false;
  if (filters.teamId !== null && order.team_id !== filters.teamId) return false;
  if (filters.status !== null && order.status !== filters.status) return false;
  if (filters.periodStartIso !== null && order.created_at < filters.periodStartIso) return false;
  if (filters.periodEndIso !== null && order.created_at > filters.periodEndIso) return false;
  return true;
}

/** Fonction PURE. Voir le commentaire de tête de ce fichier sur la double
 * application des filtres (requête + ce refiltrage en mémoire). */
export function applyOrderExportFilters<T extends FilterableOrderFields>(orders: T[], filters: OrderExportFilters): T[] {
  return orders.filter((order) => matchesOrderExportFilters(order, filters));
}

// -----------------------------------------------------------------------------
// Assemblage des lignes (pur)
// -----------------------------------------------------------------------------

export const ORDER_EXPORT_HEADERS = [
  'N° commande',
  'Date de création',
  'Date de paiement',
  'Campagne',
  'Équipe',
  'Statut',
  'Payée',
  'Sous-total',
  'TPS',
  'TVQ',
  'Livraison',
  'Total',
  'Crédit total',
  'Bénéficiaires',
];

function formatDateFr(dateIso: string | null): string {
  if (!dateIso) return '--';
  return new Date(dateIso).toLocaleDateString('fr-CA');
}

function formatBeneficiaries(credits: OrderCreditRow[], beneficiaryLabels: Map<string, string>): string {
  if (credits.length === 0) return '';
  return credits
    .map((credit) => {
      const key = beneficiaryLabelKey(credit.beneficiary_type, credit.beneficiary_id);
      const label = beneficiaryLabels.get(key) ?? 'Bénéficiaire inconnu';
      const suffix = credit.status === 'active' ? '' : ` (${credit.status})`;
      return `${label} ${formatCents(credit.amount_cents)}${suffix}`;
    })
    .join('; ');
}

export interface OrderExportRowsInput {
  orders: OrderRow[];
  credits: OrderCreditRow[];
  taxRates: Array<Pick<TaxRateRow, 'province' | 'rate_bps' | 'effective_at'>>;
  beneficiaryLabels: Map<string, string>;
  campaignNames: Map<string, string>;
  teamNames: Map<string, string>;
}

/**
 * Fonction PURE : assemble une ligne par commande (pas par produit — cet
 * export est au niveau de la commande, voir le cahier : "montants, taxes,
 * crédits, bénéficiaires et statut"). Ventilation TPS/TVQ commande par
 * commande, même logique que `lib/reports/campaign.ts#summarizeTaxBreakdown`
 * (taux applicable à `paid_at ?? created_at`), pour que la somme des
 * colonnes TPS/TVQ de l'export concorde exactement avec le rapport de
 * campagne sur le même sous-ensemble de commandes payées.
 */
export function buildOrderExportRows(input: OrderExportRowsInput): string[][] {
  const { orders, credits, taxRates, beneficiaryLabels, campaignNames, teamNames } = input;

  const creditsByOrder = new Map<string, OrderCreditRow[]>();
  for (const credit of credits) {
    const list = creditsByOrder.get(credit.order_id) ?? [];
    list.push(credit);
    creditsByOrder.set(credit.order_id, list);
  }

  return orders.map((order) => {
    const atIso = order.paid_at ?? order.created_at;
    const combinedRateBps = findApplicableTaxRateBps(taxRates, DEFAULT_BILLING_PROVINCE, atIso);
    const { tpsCents, tvqCents } = splitQcTax(order.tax_cents, combinedRateBps ?? 0);
    const orderCredits = creditsByOrder.get(order.id) ?? [];

    return [
      order.order_number,
      formatDateFr(order.created_at),
      formatDateFr(order.paid_at),
      order.primary_campaign_id ? campaignNames.get(order.primary_campaign_id) ?? '' : '',
      order.team_id ? teamNames.get(order.team_id) ?? '' : '',
      orderStatusLabelFr(order.status),
      isOrderPaid(order.status) ? 'Oui' : 'Non',
      formatCents(order.subtotal_cents),
      formatCents(tpsCents),
      formatCents(tvqCents),
      formatCents(order.shipping_cents),
      formatCents(order.total_cents),
      formatCents(order.credit_total_cents),
      formatBeneficiaries(orderCredits, beneficiaryLabels),
    ];
  });
}

export function buildOrderExportCsv(input: OrderExportRowsInput): string {
  return buildCsv(ORDER_EXPORT_HEADERS, buildOrderExportRows(input));
}

// -----------------------------------------------------------------------------
// Repo (I/O) + orchestration
// -----------------------------------------------------------------------------

export interface OrderExportRepo {
  listOrdersForExport(filters: OrderExportFilters): Promise<OrderRow[]>;
  listCreditsForOrders(orderIds: string[]): Promise<OrderCreditRow[]>;
  listAllTaxRates(): Promise<TaxRateRow[]>;
  loadCampaignNames(campaignIds: string[]): Promise<Map<string, string>>;
  loadTeamNames(teamIds: string[]): Promise<Map<string, string>>;
  /** Pour les filtres combinables de la page (listes déroulantes). */
  listCampaignsForFilters(): Promise<Array<Pick<CampaignRow, 'id' | 'name'>>>;
  listTeamsForFilters(): Promise<Array<Pick<TeamRow, 'id' | 'name'>>>;
}

export function createSupabaseOrderExportRepo(supabase: SupabaseClient): OrderExportRepo {
  return {
    async listOrdersForExport(filters) {
      let query = supabase.from('orders').select('*');
      if (filters.campaignId !== null) query = query.eq('primary_campaign_id', filters.campaignId);
      if (filters.teamId !== null) query = query.eq('team_id', filters.teamId);
      if (filters.status !== null) query = query.eq('status', filters.status);
      if (filters.periodStartIso !== null) query = query.gte('created_at', filters.periodStartIso);
      if (filters.periodEndIso !== null) query = query.lte('created_at', filters.periodEndIso);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      // Refiltrage défensif en mémoire -- voir le commentaire de tête de ce
      // fichier (double application des filtres).
      return applyOrderExportFilters((data as OrderRow[]) ?? [], filters);
    },
    async listCreditsForOrders(orderIds) {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase.from('order_credits').select('*').in('order_id', orderIds);
      if (error) throw error;
      return (data as OrderCreditRow[]) ?? [];
    },
    async listAllTaxRates() {
      const { data, error } = await supabase.from('tax_rates').select('*');
      if (error) throw error;
      return (data as TaxRateRow[]) ?? [];
    },
    async loadCampaignNames(campaignIds) {
      const ids = [...new Set(campaignIds)];
      if (ids.length === 0) return new Map();
      const { data, error } = await supabase.from('campaigns').select('id, name').in('id', ids);
      if (error) throw error;
      return new Map(((data as Array<{ id: string; name: string }>) ?? []).map((row) => [row.id, row.name]));
    },
    async loadTeamNames(teamIds) {
      const ids = [...new Set(teamIds)];
      if (ids.length === 0) return new Map();
      const { data, error } = await supabase.from('teams').select('id, name').in('id', ids);
      if (error) throw error;
      return new Map(((data as Array<{ id: string; name: string }>) ?? []).map((row) => [row.id, row.name]));
    },
    async listCampaignsForFilters() {
      const { data, error } = await supabase.from('campaigns').select('id, name').order('name', { ascending: true });
      if (error) throw error;
      return (data as Array<Pick<CampaignRow, 'id' | 'name'>>) ?? [];
    },
    async listTeamsForFilters() {
      const { data, error } = await supabase.from('teams').select('id, name').order('name', { ascending: true });
      if (error) throw error;
      return (data as Array<Pick<TeamRow, 'id' | 'name'>>) ?? [];
    },
  };
}

export interface OrderExportData {
  orders: OrderRow[];
  rows: string[][];
  csv: string;
}

/**
 * Orchestration complète : charge les commandes filtrées + tout ce qu'il
 * faut pour assembler les lignes (crédits, taux, noms de campagne/équipe,
 * libellés de bénéficiaires), puis construit les lignes et le CSV.
 */
export async function loadOrderExportData(
  filters: OrderExportFilters,
  repo: OrderExportRepo,
  supabase: SupabaseClient,
): Promise<OrderExportData> {
  const orders = await repo.listOrdersForExport(filters);
  const orderIds = orders.map((order) => order.id);

  const [credits, taxRates] = await Promise.all([repo.listCreditsForOrders(orderIds), repo.listAllTaxRates()]);

  const campaignIds = [...new Set(orders.map((o) => o.primary_campaign_id).filter((id): id is string => id !== null))];
  const teamIds = [...new Set(orders.map((o) => o.team_id).filter((id): id is string => id !== null))];
  const [campaignNames, teamNames] = await Promise.all([
    repo.loadCampaignNames(campaignIds),
    repo.loadTeamNames(teamIds),
  ]);

  const beneficiaries = [...new Set(credits.map((c) => beneficiaryLabelKey(c.beneficiary_type, c.beneficiary_id)))].map(
    (key) => {
      const credit = credits.find((c) => beneficiaryLabelKey(c.beneficiary_type, c.beneficiary_id) === key)!;
      return { beneficiaryType: credit.beneficiary_type, beneficiaryId: credit.beneficiary_id };
    },
  );
  const beneficiaryLabels = await loadBeneficiaryLabels(supabase, beneficiaries);

  const rowsInput: OrderExportRowsInput = { orders, credits, taxRates, beneficiaryLabels, campaignNames, teamNames };
  return {
    orders,
    rows: buildOrderExportRows(rowsInput),
    csv: buildOrderExportCsv(rowsInput),
  };
}
