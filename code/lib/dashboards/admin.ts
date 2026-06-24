/**
 * Dashboard admin plateforme (Tâche 1.5.7, docs/prompts/phase-1-5.md, section
 * 35) : vue d'ensemble opérationnelle ET financière, réservée à
 * `platform_admin` -- revenus totaux, commandes totales, marge brute (si
 * coûts disponibles), crédits dus, crédits payés, campagnes actives,
 * campagnes à risque, produits populaires, paiements échoués, remboursements,
 * panier moyen.
 *
 * Même séparation logique/I/O que `lib/dashboards/team.ts` (Tâche 1.5.6) :
 * fonctions PURES testées sans base réelle, un `AdminDashboardRepo` injecté
 * pour l'I/O, assemblées par `buildAdminDashboard` (pure) puis
 * `loadAdminDashboard` (I/O). Lecture seule -- aucune action destructrice
 * depuis ce dashboard (règle explicite de la tâche).
 *
 * Contrairement au dashboard équipe, l'admin n'a PAS de scope : il voit
 * TOUTES les commandes/crédits/versements/campagnes. Aucune nouvelle
 * migration RLS n'a été nécessaire pour cette tâche -- relecture des policies
 * déjà déployées (migration 0005) avant d'écrire le moindre code :
 * `orders_select_scoped`, `order_items_select_scoped`,
 * `order_credits_select_staff`, `payouts_staff_read`, `campaigns_select_scoped`
 * accordent déjà TOUTES un accès SELECT total et inconditionnel à
 * `private.is_platform_admin()`, sans aucune restriction supplémentaire. Voir
 * docs/DECISIONS.md, Tâche 1.5.7.
 *
 * Le rôle n'étant pas scopé par une donnée liée (pas de "manages_X" comme
 * pour team_manager/club_admin), RLS seul ne suffit pas à protéger la PAGE :
 * un non-admin obtiendrait des tableaux vides plutôt qu'un refus net. La page
 * (`app/(admin)/dashboard/page.tsx`) ajoute donc une vérification explicite
 * du rôle via `canViewAdminDashboard`, exportée et testée ici.
 *
 * Toutes les valeurs sont recalculées à la demande depuis `orders`/
 * `order_items`/`order_credits`/`payouts`/`campaigns` -- AUCUN solde stocké
 * en dur (CLAUDE.md section 4).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CampaignsTable,
  OrderCreditsTable,
  OrderItemsTable,
  OrdersTable,
  OrderStatus,
  PayoutsTable,
} from '@/lib/db/types';
import { isOrderPaid } from '@/lib/distribution/build-list';

export type OrderRow = OrdersTable['Row'];
export type OrderItemRow = OrderItemsTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];
export type PayoutRow = PayoutsTable['Row'];
export type CampaignRow = CampaignsTable['Row'];

// -----------------------------------------------------------------------------
// Revenus totaux / commandes totales / panier moyen
// -----------------------------------------------------------------------------

export interface RevenueSummary {
  /** Somme des `total_cents` des commandes PAYÉES (`isOrderPaid`, même
   * définition que `lib/distribution/build-list.ts` -- réutilisée pour ne
   * pas dupliquer/diverger, comme pour le dashboard équipe). */
  totalRevenueCents: number;
  /** Nombre de commandes payées -- sert au calcul du panier moyen. */
  paidOrderCount: number;
  /** Nombre TOTAL de commandes, tous statuts confondus (incluant
   * `payment_pending`/`cancelled`/`refunded`/`error`) -- décision autonome :
   * « commandes totales » est une métrique OPÉRATIONNELLE distincte de
   * « revenus totaux », l'admin veut voir le volume complet de commandes
   * créées, pas seulement celles qui ont abouti à un paiement. Voir
   * docs/DECISIONS.md, Tâche 1.5.7. */
  totalOrderCount: number;
  /** Arrondi au centime le plus proche (CLAUDE.md section 4 : jamais de
   * float). 0 sans commande payée. */
  averageBasketCents: number;
}

/** Fonction PURE. */
export function summarizeRevenue(orders: Array<Pick<OrderRow, 'status' | 'total_cents'>>): RevenueSummary {
  const paidOrders = orders.filter((order) => isOrderPaid(order.status));
  const totalRevenueCents = paidOrders.reduce((sum, order) => sum + order.total_cents, 0);
  const paidOrderCount = paidOrders.length;
  const averageBasketCents = paidOrderCount === 0 ? 0 : Math.round(totalRevenueCents / paidOrderCount);
  return { totalRevenueCents, paidOrderCount, totalOrderCount: orders.length, averageBasketCents };
}

// -----------------------------------------------------------------------------
// Marge brute
// -----------------------------------------------------------------------------

export interface GrossMarginResult {
  availableCents: null;
  reason: string;
}

/**
 * Fonction PURE (sans entrée -- documente explicitement l'absence de
 * données). Le schéma actuel (`products`, `order_items`, `orders`,
 * migration 0001) ne contient AUCUNE colonne de coût (`cost_cents` ou
 * équivalent) : la marge brute n'est donc PAS CALCULABLE en V1. Le prompt
 * 1.5.7 anticipe explicitement ce cas (« si coûts disponibles ») -- décision
 * autonome : afficher "non disponible" plutôt qu'inventer un coût ou
 * masquer la section, voir docs/DECISIONS.md, Tâche 1.5.7.
 */
export function computeGrossMargin(): GrossMarginResult {
  return {
    availableCents: null,
    reason: 'Marge brute non disponible : aucune colonne de coût (*_cents) en V1.',
  };
}

// -----------------------------------------------------------------------------
// Crédits dus / crédits payés
// -----------------------------------------------------------------------------

export interface CreditsDueSummary {
  /** Somme, par bénéficiaire, de max(0, crédits ACTIFS - versements PAYÉS) --
   * jamais négatif pour un bénéficiaire donné (un versement ne « rembourse »
   * pas un futur crédit). Diminue mécaniquement quand un versement passe à
   * `paid` (critère d'acceptation explicite de la tâche). */
  dueCents: number;
  /** Somme de TOUS les versements au statut `paid`, tous bénéficiaires
   * confondus (montant déjà sorti de la plateforme). */
  paidCents: number;
}

function beneficiaryKey(beneficiaryType: string, beneficiaryId: string): string {
  return `${beneficiaryType}:${beneficiaryId}`;
}

/**
 * Fonction PURE. Seul le statut `active` compte comme « dû » -- volontairement
 * PLUS STRICT que `CREDIT_STATUSES_COUNTED` (`active`+`pending`) de
 * `lib/dashboards/team.ts` : le prompt 1.5.7 dit explicitement « crédits
 * ACTIFS non encore versés » (ligne 222), pas « actifs ou en attente ». Un
 * crédit `pending` n'est pas encore confirmé, donc pas encore "dû". Décision
 * documentée dans docs/DECISIONS.md, Tâche 1.5.7.
 */
export function summarizeCreditsDue(
  credits: Array<Pick<OrderCreditRow, 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>>,
  payouts: Array<Pick<PayoutRow, 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>>,
): CreditsDueSummary {
  const activeByBeneficiary = new Map<string, number>();
  for (const credit of credits) {
    if (credit.status !== 'active') continue;
    const key = beneficiaryKey(credit.beneficiary_type, credit.beneficiary_id);
    activeByBeneficiary.set(key, (activeByBeneficiary.get(key) ?? 0) + credit.amount_cents);
  }

  const paidByBeneficiary = new Map<string, number>();
  let paidCents = 0;
  for (const payout of payouts) {
    if (payout.status !== 'paid') continue;
    paidCents += payout.amount_cents;
    const key = beneficiaryKey(payout.beneficiary_type, payout.beneficiary_id);
    paidByBeneficiary.set(key, (paidByBeneficiary.get(key) ?? 0) + payout.amount_cents);
  }

  let dueCents = 0;
  for (const [key, activeCents] of activeByBeneficiary) {
    const paidForBeneficiary = paidByBeneficiary.get(key) ?? 0;
    dueCents += Math.max(0, activeCents - paidForBeneficiary);
  }

  return { dueCents, paidCents };
}

// -----------------------------------------------------------------------------
// Campagnes actives / campagnes à risque
// -----------------------------------------------------------------------------

/** Seuils de « campagne à risque » -- AUCUNE convention préexistante dans le
 * code (vérifié, voir docs/DECISIONS.md, Tâche 1.5.7) : seuils définis ici en
 * toute autonomie, conformément au prompt 1.5.7 (« définir le seuil, le noter
 * dans DECISIONS.md »).
 *   - « proche de la fin » : 14 jours ou moins avant `ends_at` (et pas déjà
 *     terminée -- `daysRemaining >= 0`).
 *   - « loin de l'objectif » : moins de 50 % du `goal_cents` amassé.
 * Une campagne active SANS `ends_at` ou SANS `goal_cents` ne peut être
 * évaluée par ces deux critères -- exclue par défensive plutôt que de
 * deviner. */
export const AT_RISK_DAYS_THRESHOLD = 14;
export const AT_RISK_PROGRESS_RATIO_THRESHOLD = 0.5;

const CREDIT_STATUSES_FOR_PROGRESS = new Set(['active', 'pending']);

/** Fonction PURE. Même filtre que la vue `v_campaign_progress` (migration
 * 0001) : `active` + `pending`, regroupés par `campaign_id`. Recalculé en
 * mémoire plutôt que de dépendre de la vue SQL, pour rester testable sans
 * base réelle (même esprit que tout le reste de ce fichier). */
export function computeRaisedCentsByCampaign(
  credits: Array<Pick<OrderCreditRow, 'campaign_id' | 'amount_cents' | 'status'>>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const credit of credits) {
    if (!credit.campaign_id || !CREDIT_STATUSES_FOR_PROGRESS.has(credit.status)) continue;
    totals.set(credit.campaign_id, (totals.get(credit.campaign_id) ?? 0) + credit.amount_cents);
  }
  return totals;
}

/** Fonction PURE. */
export function countActiveCampaigns(campaigns: Array<Pick<CampaignRow, 'status'>>): number {
  return campaigns.filter((campaign) => campaign.status === 'active').length;
}

export interface AtRiskCampaign {
  campaignId: string;
  name: string;
  endsAt: string;
  daysRemaining: number;
  goalCents: number;
  raisedCents: number;
  progressRatio: number;
}

/** Fonction PURE. `now` injecté (jamais `new Date()` en dur dans une fonction
 * pure) pour rester testable de façon déterministe. Triée des campagnes les
 * plus urgentes (moins de jours restants) aux moins urgentes. */
export function findAtRiskCampaigns(
  campaigns: Array<Pick<CampaignRow, 'id' | 'name' | 'status' | 'ends_at' | 'goal_cents'>>,
  raisedCentsByCampaignId: Map<string, number>,
  now: Date,
): AtRiskCampaign[] {
  const results: AtRiskCampaign[] = [];
  for (const campaign of campaigns) {
    if (campaign.status !== 'active') continue;
    if (!campaign.ends_at || campaign.goal_cents === null || campaign.goal_cents <= 0) continue;

    const endsAtMs = new Date(campaign.ends_at).getTime();
    const daysRemaining = (endsAtMs - now.getTime()) / 86_400_000;
    if (daysRemaining < 0 || daysRemaining > AT_RISK_DAYS_THRESHOLD) continue;

    const raisedCents = raisedCentsByCampaignId.get(campaign.id) ?? 0;
    const progressRatio = raisedCents / campaign.goal_cents;
    if (progressRatio >= AT_RISK_PROGRESS_RATIO_THRESHOLD) continue;

    results.push({
      campaignId: campaign.id,
      name: campaign.name,
      endsAt: campaign.ends_at,
      daysRemaining,
      goalCents: campaign.goal_cents,
      raisedCents,
      progressRatio,
    });
  }
  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// -----------------------------------------------------------------------------
// Produits populaires
// -----------------------------------------------------------------------------

export interface PopularProduct {
  productId: string;
  productName: string;
  unitsSold: number;
  revenueCents: number;
}

/**
 * Fonction PURE. Jointure faite EN MÉMOIRE (`orderStatusById`) plutôt qu'en
 * SQL, pour rester testable sans base réelle -- même esprit que le reste de
 * ce fichier. Réutilise `isOrderPaid` (ensemble LARGE de statuts payés) plutôt
 * que `status = 'paid'` strict utilisé par
 * `lib/catalog/products.ts#getUnitsSoldByProductId` -- décision autonome
 * d'harmonisation avec `summarizeRevenue` ci-dessus (même définition de
 * "vente" partout dans CE dashboard), documentée dans docs/DECISIONS.md,
 * Tâche 1.5.7 (incohérence préexistante notée, pas corrigée ailleurs pour ne
 * pas modifier le comportement d'une tâche déjà livrée hors-scope).
 */
export function summarizePopularProducts(
  orderItems: Array<Pick<OrderItemRow, 'product_id' | 'product_name' | 'quantity' | 'line_total_cents' | 'order_id'>>,
  orderStatusById: Map<string, OrderStatus>,
  limit = 5,
): PopularProduct[] {
  const byProduct = new Map<string, PopularProduct>();
  for (const item of orderItems) {
    const status = orderStatusById.get(item.order_id);
    if (!status || !isOrderPaid(status)) continue;

    const existing = byProduct.get(item.product_id) ?? {
      productId: item.product_id,
      productName: item.product_name,
      unitsSold: 0,
      revenueCents: 0,
    };
    existing.unitsSold += item.quantity;
    existing.revenueCents += item.line_total_cents;
    existing.productName = item.product_name;
    byProduct.set(item.product_id, existing);
  }

  return [...byProduct.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents || a.productName.localeCompare(b.productName, 'fr-CA'))
    .slice(0, limit);
}

// -----------------------------------------------------------------------------
// Paiements échoués / remboursements
// -----------------------------------------------------------------------------

export interface FailedPaymentsSummary {
  count: number;
  attemptedTotalCents: number;
}

/** Fonction PURE. `error` est l'unique statut représentant un paiement
 * explicitement échoué dans le schéma actuel (`payment_pending` signifie
 * "pas encore confirmé", pas "échoué" -- voir `lib/orders/status.ts`).
 * Aucune table `stripe_events`/`payment_failures` séparée n'est utilisée ici
 * : `orders.status` reste la source de vérité unique, cohérent avec
 * CLAUDE.md section 4 (« le crédit ne se déclenche que sur paiement confirmé
 * par le webhook Stripe », l'échec webhook fait transiter la commande vers
 * `error`). Voir docs/DECISIONS.md, Tâche 1.5.7. */
export function summarizeFailedPayments(orders: Array<Pick<OrderRow, 'status' | 'total_cents'>>): FailedPaymentsSummary {
  const failed = orders.filter((order) => order.status === 'error');
  return {
    count: failed.length,
    attemptedTotalCents: failed.reduce((sum, order) => sum + order.total_cents, 0),
  };
}

export interface RefundsSummary {
  count: number;
  totalCents: number;
}

const REFUNDED_STATUSES: ReadonlySet<OrderStatus> = new Set(['refunded', 'partially_refunded']);

/** Fonction PURE. `totalCents` utilise `orders.total_cents` (montant complet
 * de la commande) comme approximation -- le schéma actuel n'a AUCUNE colonne
 * dédiée au montant effectivement remboursé (ex. `refunded_amount_cents`).
 * Pour une commande `partially_refunded`, ceci SURESTIME donc le montant
 * réellement remboursé -- limite connue, documentée dans docs/DECISIONS.md
 * et le rapport de cette tâche, à corriger si une colonne dédiée est ajoutée
 * plus tard. */
export function summarizeRefunds(orders: Array<Pick<OrderRow, 'status' | 'total_cents'>>): RefundsSummary {
  const refunded = orders.filter((order) => REFUNDED_STATUSES.has(order.status));
  return {
    count: refunded.length,
    totalCents: refunded.reduce((sum, order) => sum + order.total_cents, 0),
  };
}

// -----------------------------------------------------------------------------
// Accès (garde de page)
// -----------------------------------------------------------------------------

/** Fonction PURE. Réservé à `platform_admin` (règle explicite du prompt
 * 1.5.7). RLS seul ne bloque pas l'accès à la PAGE (l'admin n'a pas de scope
 * "manages_X" -- voir l'en-tête de ce fichier) : cette fonction est le garde
 * applicatif explicite utilisé par `app/(admin)/dashboard/page.tsx`. */
export function canViewAdminDashboard(role: string | null | undefined): boolean {
  return role === 'platform_admin';
}

// -----------------------------------------------------------------------------
// Assemblage (pur) + orchestration (I/O)
// -----------------------------------------------------------------------------

export interface AdminDashboard {
  revenue: RevenueSummary;
  grossMargin: GrossMarginResult;
  creditsDue: CreditsDueSummary;
  activeCampaignsCount: number;
  atRiskCampaigns: AtRiskCampaign[];
  popularProducts: PopularProduct[];
  failedPayments: FailedPaymentsSummary;
  refunds: RefundsSummary;
}

/** Fonction PURE : assemble toutes les sections à partir de données déjà
 * chargées. Testée indépendamment de tout repo. `now` optionnel (défaut
 * `new Date()`) -- injectable pour des tests déterministes. */
export function buildAdminDashboard(input: {
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  credits: OrderCreditRow[];
  payouts: PayoutRow[];
  campaigns: CampaignRow[];
  now?: Date;
}): AdminDashboard {
  const now = input.now ?? new Date();
  const orderStatusById = new Map(input.orders.map((order) => [order.id, order.status]));
  const raisedCentsByCampaignId = computeRaisedCentsByCampaign(input.credits);

  return {
    revenue: summarizeRevenue(input.orders),
    grossMargin: computeGrossMargin(),
    creditsDue: summarizeCreditsDue(input.credits, input.payouts),
    activeCampaignsCount: countActiveCampaigns(input.campaigns),
    atRiskCampaigns: findAtRiskCampaigns(input.campaigns, raisedCentsByCampaignId, now),
    popularProducts: summarizePopularProducts(input.orderItems, orderStatusById),
    failedPayments: summarizeFailedPayments(input.orders),
    refunds: summarizeRefunds(input.orders),
  };
}

/** Accès aux données, injecté pour permettre des tests sans base réelle (même
 * patron que `TeamDashboardRepo`). Pas de filtrage par bénéficiaire/équipe :
 * l'admin voit tout, RLS (`private.is_platform_admin()`) l'autorise déjà
 * intégralement sur les cinq tables ci-dessous (voir en-tête du fichier). */
export interface AdminDashboardRepo {
  listAllOrders(): Promise<OrderRow[]>;
  listAllOrderItems(): Promise<OrderItemRow[]>;
  listAllOrderCredits(): Promise<OrderCreditRow[]>;
  listAllPayouts(): Promise<PayoutRow[]>;
  listAllCampaigns(): Promise<CampaignRow[]>;
}

export function createSupabaseAdminDashboardRepo(supabase: SupabaseClient): AdminDashboardRepo {
  return {
    async listAllOrders() {
      const { data, error } = await supabase.from('orders').select('*');
      if (error) throw error;
      return (data as OrderRow[]) ?? [];
    },
    async listAllOrderItems() {
      const { data, error } = await supabase.from('order_items').select('*');
      if (error) throw error;
      return (data as OrderItemRow[]) ?? [];
    },
    async listAllOrderCredits() {
      const { data, error } = await supabase.from('order_credits').select('*');
      if (error) throw error;
      return (data as OrderCreditRow[]) ?? [];
    },
    async listAllPayouts() {
      const { data, error } = await supabase.from('payouts').select('*');
      if (error) throw error;
      return (data as PayoutRow[]) ?? [];
    },
    async listAllCampaigns() {
      const { data, error } = await supabase.from('campaigns').select('*');
      if (error) throw error;
      return (data as CampaignRow[]) ?? [];
    },
  };
}

/** Charge et assemble le dashboard admin complet. Ne retourne jamais `null`
 * (pas de notion de "scope absent" pour l'admin) -- le garde d'accès
 * (`canViewAdminDashboard`) est vérifié par l'APPELANT (la page), avant
 * d'appeler cette fonction, pas par elle-même. */
export async function loadAdminDashboard(repo: AdminDashboardRepo): Promise<AdminDashboard> {
  const [orders, orderItems, credits, payouts, campaigns] = await Promise.all([
    repo.listAllOrders(),
    repo.listAllOrderItems(),
    repo.listAllOrderCredits(),
    repo.listAllPayouts(),
    repo.listAllCampaigns(),
  ]);

  return buildAdminDashboard({ orders, orderItems, credits, payouts, campaigns });
}
