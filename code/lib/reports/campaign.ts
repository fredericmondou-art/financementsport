/**
 * Rapport financier de campagne (Tâche 1.5.9, docs/prompts/phase-1-5.md,
 * section 36) : ventes brutes, taxes (ventilées TPS/TVQ), ventes nettes,
 * coût produits (si dispo), frais de paiement, livraison, crédit
 * équipe/bénéficiaires, profit estimé.
 *
 * Même séparation logique/I/O que `lib/dashboards/admin.ts`/`lib/dashboards/
 * team.ts` : fonctions PURES testées sans base réelle, un `CampaignReportRepo`
 * injecté pour l'I/O, assemblées par `buildCampaignReport` (pure) puis
 * `loadCampaignReport` (I/O, gère le figeage).
 *
 * Toutes les sommes proviennent de `orders`/`order_credits`/`payouts`/
 * `tax_rates` -- jamais stockées en dur (CLAUDE.md section 4), SAUF le
 * figeage explicite exigé par le cahier pour une campagne `closed` (voir
 * `loadCampaignReport` et la migration 0018).
 *
 * Décisions autonomes (voir docs/DECISIONS.md, Tâche 1.5.9) :
 *   - « Ventes » = commandes `isOrderPaid` (même définition partagée que
 *     `lib/distribution/build-list.ts`/`lib/dashboards/*`), scopées par
 *     `orders.primary_campaign_id = campaignId` (même convention que la
 *     Tâche 1.5.4). Le crédit total, lui, suit la formulation EXPLICITE du
 *     critère d'acceptation : somme des `order_credits` ACTIFS dont
 *     `campaign_id = campaignId` -- peut différer du regroupement des
 *     ventes pour une commande multi-bénéficiaires/multi-campagnes
 *     (limite préexistante héritée de la Tâche 1.4.6, pas introduite ici).
 *   - Ventilation TPS/TVQ : `tax_rates` ne stocke qu'un taux COMBINÉ (voir
 *     `lib/taxes/rates.ts`). La TPS fédérale est un taux LÉGALEMENT FIXE de
 *     5 % (déjà énoncé comme fait, pas comme paramètre, dans CLAUDE.md
 *     section 2) -- ce n'est PAS le taux combiné visé par la règle « jamais
 *     en dur » de la section 2 (qui concerne le taux utilisé pour CALCULER
 *     la taxe, pas cette ventilation a posteriori à l'affichage). Pour
 *     chaque commande, on retrouve le taux combiné applicable à la date de
 *     paiement, on en déduit `tpsCents = round(taxCents * 500 / combiné)`,
 *     et `tvqCents = taxCents - tpsCents` (le reste de l'arrondi absorbé par
 *     la TVQ) -- garantit `tpsCents + tvqCents === taxCents` pour CHAQUE
 *     commande, donc aussi en somme.
 *   - Aucune colonne de province sur `orders` (le panier ne capte pas
 *     d'adresse de facturation distincte -- voir `lib/checkout/
 *     create-checkout-session.ts`, qui calcule déjà toute taxe sur 'QC' par
 *     défaut). Ce module réutilise la même province par défaut pour
 *     retrouver le taux applicable -- même limite déjà acceptée pour le
 *     calcul de la taxe elle-même, pas une nouvelle hypothèse.
 *   - Coût produits : AUCUNE colonne de coût en V1 (même lacune déjà
 *     documentée par `lib/dashboards/admin.ts#computeGrossMargin`) --
 *     `computeProductCost` retourne `null` + motif, jamais une valeur
 *     inventée. Le profit estimé l'indique explicitement
 *     (`profitEstimateExcludesCost`).
 *   - Frais de paiement : somme de `payouts.fee_held_cents` pour TOUS les
 *     versements rattachés à la campagne (`payouts.campaign_id`), quel que
 *     soit leur statut -- `fee_held_cents` est la retenue déjà CALCULÉE
 *     (montant prévu, pas seulement réalisé), donc pertinente pour le
 *     rapport même avant qu'un versement soit effectivement payé.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CampaignReportsTable,
  CampaignsTable,
  OrderCreditsTable,
  OrdersTable,
  PayoutsTable,
  TaxRatesTable,
} from '@/lib/db/types';
import { isOrderPaid } from '@/lib/distribution/build-list';

export type OrderRow = OrdersTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];
export type PayoutRow = PayoutsTable['Row'];
export type CampaignRow = CampaignsTable['Row'];
export type TaxRateRow = TaxRatesTable['Row'];
export type CampaignReportRow = CampaignReportsTable['Row'];

/** Province de facturation par défaut -- voir le commentaire de tête de ce
 * fichier (aucune colonne de province sur `orders`, même limite que le
 * calcul de la taxe au moment du paiement). */
export const DEFAULT_BILLING_PROVINCE = 'QC';

/** Taux fédéral de TPS, FIXE par la loi (5 %) -- énoncé comme fait dans
 * CLAUDE.md section 2, pas comme paramètre métier. Ne couvre QUE la
 * ventilation TPS/TVQ d'un taux combiné déjà calculé ; ne sert jamais à
 * calculer une taxe (ça reste exclusivement `tax_rates`). */
export const QC_TPS_RATE_BPS = 500;

// -----------------------------------------------------------------------------
// Ventilation TPS / TVQ
// -----------------------------------------------------------------------------

export interface TaxSplit {
  tpsCents: number;
  tvqCents: number;
}

/**
 * Fonction PURE. Garantit `tpsCents + tvqCents === taxCents` (le reste de
 * l'arrondi est absorbé par la TVQ, même esprit que l'arrondi
 * multi-bénéficiaires de CLAUDE.md section 4). Défensif si
 * `combinedRateBps <= 0` (ne devrait jamais arriver : `tax_rates.rate_bps`
 * est toujours positif dans les données seed) -- attribue alors tout à la
 * TVQ plutôt que de diviser par zéro.
 */
export function splitQcTax(taxCents: number, combinedRateBps: number): TaxSplit {
  if (taxCents === 0) return { tpsCents: 0, tvqCents: 0 };
  if (combinedRateBps <= 0) return { tpsCents: 0, tvqCents: taxCents };
  const tpsCents = Math.round((taxCents * QC_TPS_RATE_BPS) / combinedRateBps);
  return { tpsCents, tvqCents: taxCents - tpsCents };
}

/**
 * Fonction PURE. Même règle de résolution que `lib/taxes/rates.ts` (la ligne
 * `effective_at` la plus récente déjà passée), mais opérant sur une liste
 * déjà chargée en mémoire -- permet de résoudre le taux applicable pour
 * PLUSIEURS commandes (dates différentes) sans un aller-retour DB par
 * commande.
 */
export function findApplicableTaxRateBps(
  rates: Array<Pick<TaxRateRow, 'province' | 'rate_bps' | 'effective_at'>>,
  province: string,
  atIso: string,
): number | null {
  const candidates = rates
    .filter((rate) => rate.province === province && rate.effective_at <= atIso)
    .sort((a, b) => (a.effective_at < b.effective_at ? 1 : -1));
  return candidates[0]?.rate_bps ?? null;
}

// -----------------------------------------------------------------------------
// Ventes / taxes / livraison
// -----------------------------------------------------------------------------

export interface SalesSummary {
  orderCount: number;
  grossSalesCents: number;
  taxCents: number;
  shippingCents: number;
  /** `grossSalesCents - taxCents` (critère d'acceptation explicite). */
  netSalesCents: number;
}

/** Fonction PURE. Mêmes commandes que `lib/distribution/build-list.ts`
 * (`isOrderPaid`), scopées par `primary_campaign_id` (même convention que la
 * Tâche 1.5.4). */
export function summarizeSales(
  orders: Array<Pick<OrderRow, 'status' | 'total_cents' | 'tax_cents' | 'shipping_cents'>>,
): SalesSummary {
  const paid = orders.filter((order) => isOrderPaid(order.status));
  const grossSalesCents = paid.reduce((sum, order) => sum + order.total_cents, 0);
  const taxCents = paid.reduce((sum, order) => sum + order.tax_cents, 0);
  const shippingCents = paid.reduce((sum, order) => sum + order.shipping_cents, 0);
  return {
    orderCount: paid.length,
    grossSalesCents,
    taxCents,
    shippingCents,
    netSalesCents: grossSalesCents - taxCents,
  };
}

/** Fonction PURE. Ventile la taxe COMMANDE PAR COMMANDE (taux applicable à
 * sa date de paiement) puis somme -- exact même si le taux combiné a changé
 * pendant la durée de la campagne, et garantit `tpsCents + tvqCents` égal à
 * la somme des `tax_cents` des commandes effectivement ventilées. */
export function summarizeTaxBreakdown(
  orders: Array<Pick<OrderRow, 'status' | 'tax_cents' | 'paid_at' | 'created_at'>>,
  taxRates: Array<Pick<TaxRateRow, 'province' | 'rate_bps' | 'effective_at'>>,
  province: string = DEFAULT_BILLING_PROVINCE,
): TaxSplit {
  let tpsCents = 0;
  let tvqCents = 0;
  for (const order of orders) {
    if (!isOrderPaid(order.status) || order.tax_cents === 0) continue;
    const atIso = order.paid_at ?? order.created_at;
    const combinedRateBps = findApplicableTaxRateBps(taxRates, province, atIso);
    const split = splitQcTax(order.tax_cents, combinedRateBps ?? 0);
    tpsCents += split.tpsCents;
    tvqCents += split.tvqCents;
  }
  return { tpsCents, tvqCents };
}

// -----------------------------------------------------------------------------
// Frais de paiement
// -----------------------------------------------------------------------------

/** Fonction PURE. Voir le commentaire de tête de ce fichier sur le choix de
 * sommer `fee_held_cents` quel que soit le statut du versement. */
export function summarizePaymentFees(payouts: Array<Pick<PayoutRow, 'fee_held_cents'>>): number {
  return payouts.reduce((sum, payout) => sum + payout.fee_held_cents, 0);
}

// -----------------------------------------------------------------------------
// Crédit total
// -----------------------------------------------------------------------------

/** Fonction PURE. Suit la formulation EXACTE du critère d'acceptation :
 * « crédit total = somme des order_credits ACTIFS de la campagne ». Les
 * lignes passées en entrée doivent déjà être filtrées sur
 * `campaign_id = campaignId` par l'appelant (le repo). */
export function summarizeCreditTotal(credits: Array<Pick<OrderCreditRow, 'amount_cents' | 'status'>>): number {
  return credits.filter((credit) => credit.status === 'active').reduce((sum, credit) => sum + credit.amount_cents, 0);
}

// -----------------------------------------------------------------------------
// Coût produits (non disponible en V1)
// -----------------------------------------------------------------------------

export interface ProductCostResult {
  costCents: null;
  reason: string;
}

/** Fonction PURE (sans entrée). Même lacune que `lib/dashboards/
 * admin.ts#computeGrossMargin` : aucune colonne de coût (`cost_cents` ou
 * équivalent) sur `products`/`order_items` en V1. */
export function computeProductCost(): ProductCostResult {
  return {
    costCents: null,
    reason: 'Coût produits non disponible : aucune colonne de coût (*_cents) en V1.',
  };
}

// -----------------------------------------------------------------------------
// Profit estimé
// -----------------------------------------------------------------------------

export interface ProfitEstimateInput {
  netSalesCents: number;
  paymentFeesCents: number;
  shippingCents: number;
  creditTotalCents: number;
  productCostCents: number | null;
}

export interface ProfitEstimateResult {
  profitEstimateCents: number;
  /** `true` tant qu'aucune colonne de coût n'existe (toujours `true` en
   * V1) -- le rapport DOIT l'indiquer pour ne jamais laisser croire que le
   * profit affiché est net du coût des produits. */
  profitEstimateExcludesCost: boolean;
}

/** Fonction PURE. `profit = ventes nettes - frais de paiement - livraison -
 * crédit total - coût produits (si dispo, sinon 0, et signalé par
 * `profitEstimateExcludesCost`)`. */
export function computeProfitEstimate(input: ProfitEstimateInput): ProfitEstimateResult {
  const profitEstimateCents =
    input.netSalesCents -
    input.paymentFeesCents -
    input.shippingCents -
    input.creditTotalCents -
    (input.productCostCents ?? 0);
  return {
    profitEstimateCents,
    profitEstimateExcludesCost: input.productCostCents === null,
  };
}

// -----------------------------------------------------------------------------
// Assemblage (pur) + orchestration (I/O)
// -----------------------------------------------------------------------------

export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  /** `true` si ce rapport provient du figeage `campaign_reports` (campagne
   * `closed`, déjà généré une fois) -- `false` s'il vient d'être recalculé
   * en direct (campagne active, ou première vue après clôture). */
  frozen: boolean;
  generatedAt: string;
  orderCount: number;
  grossSalesCents: number;
  taxTotalCents: number;
  tpsCents: number;
  tvqCents: number;
  netSalesCents: number;
  productCostCents: number | null;
  productCostReason: string | null;
  paymentFeesCents: number;
  shippingCents: number;
  creditTotalCents: number;
  profitEstimateCents: number;
  profitEstimateExcludesCost: boolean;
}

/** Fonction PURE : assemble le rapport complet à partir de données déjà
 * chargées. Testée indépendamment de tout repo. `frozen`/`generatedAt` sont
 * fournis par l'appelant (l'orchestration sait s'il s'agit d'un figeage relu
 * ou d'un calcul frais). */
export function buildCampaignReport(input: {
  campaignId: string;
  campaignName: string;
  orders: OrderRow[];
  credits: OrderCreditRow[];
  payouts: PayoutRow[];
  taxRates: TaxRateRow[];
  frozen: boolean;
  generatedAt: string;
}): CampaignReport {
  const sales = summarizeSales(input.orders);
  const taxSplit = summarizeTaxBreakdown(input.orders, input.taxRates);
  const paymentFeesCents = summarizePaymentFees(input.payouts);
  const creditTotalCents = summarizeCreditTotal(input.credits);
  const productCost = computeProductCost();
  const profit = computeProfitEstimate({
    netSalesCents: sales.netSalesCents,
    paymentFeesCents,
    shippingCents: sales.shippingCents,
    creditTotalCents,
    productCostCents: productCost.costCents,
  });

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    frozen: input.frozen,
    generatedAt: input.generatedAt,
    orderCount: sales.orderCount,
    grossSalesCents: sales.grossSalesCents,
    taxTotalCents: sales.taxCents,
    tpsCents: taxSplit.tpsCents,
    tvqCents: taxSplit.tvqCents,
    netSalesCents: sales.netSalesCents,
    productCostCents: productCost.costCents,
    productCostReason: productCost.reason,
    paymentFeesCents,
    shippingCents: sales.shippingCents,
    creditTotalCents,
    profitEstimateCents: profit.profitEstimateCents,
    profitEstimateExcludesCost: profit.profitEstimateExcludesCost,
  };
}

/** Accès aux données, injecté pour permettre des tests sans base réelle (même
 * patron que `AdminDashboardRepo`/`TeamDashboardRepo`). */
export interface CampaignReportRepo {
  getCampaign(campaignId: string): Promise<CampaignRow | null>;
  listOrdersForCampaign(campaignId: string): Promise<OrderRow[]>;
  listActiveCreditsForCampaign(campaignId: string): Promise<OrderCreditRow[]>;
  listPayoutsForCampaign(campaignId: string): Promise<PayoutRow[]>;
  listAllTaxRates(): Promise<TaxRateRow[]>;
  getCachedReport(campaignId: string, closedAt: string): Promise<CampaignReportRow | null>;
  saveReport(row: CampaignReportsTable['Insert']): Promise<CampaignReportRow>;
}

export function createSupabaseCampaignReportRepo(supabase: SupabaseClient): CampaignReportRepo {
  return {
    async getCampaign(campaignId) {
      const { data, error } = await supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle();
      if (error) throw error;
      return (data as CampaignRow) ?? null;
    },
    async listOrdersForCampaign(campaignId) {
      const { data, error } = await supabase.from('orders').select('*').eq('primary_campaign_id', campaignId);
      if (error) throw error;
      return (data as OrderRow[]) ?? [];
    },
    async listActiveCreditsForCampaign(campaignId) {
      const { data, error } = await supabase
        .from('order_credits')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'active');
      if (error) throw error;
      return (data as OrderCreditRow[]) ?? [];
    },
    async listPayoutsForCampaign(campaignId) {
      const { data, error } = await supabase.from('payouts').select('*').eq('campaign_id', campaignId);
      if (error) throw error;
      return (data as PayoutRow[]) ?? [];
    },
    async listAllTaxRates() {
      const { data, error } = await supabase.from('tax_rates').select('*');
      if (error) throw error;
      return (data as TaxRateRow[]) ?? [];
    },
    async getCachedReport(campaignId, closedAt) {
      const { data, error } = await supabase
        .from('campaign_reports')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('closed_at', closedAt)
        .maybeSingle();
      if (error) throw error;
      return (data as CampaignReportRow) ?? null;
    },
    async saveReport(row) {
      const { data, error } = await supabase.from('campaign_reports').insert(row).select('*').single();
      if (error) throw error;
      return data as CampaignReportRow;
    },
  };
}

function mapCachedRowToReport(row: CampaignReportRow, campaignName: string): CampaignReport {
  return {
    campaignId: row.campaign_id,
    campaignName,
    frozen: true,
    generatedAt: row.generated_at,
    orderCount: row.order_count,
    grossSalesCents: row.gross_sales_cents,
    taxTotalCents: row.tax_total_cents,
    tpsCents: row.tps_cents,
    tvqCents: row.tvq_cents,
    netSalesCents: row.net_sales_cents,
    productCostCents: row.product_cost_cents,
    productCostReason:
      row.product_cost_cents === null
        ? 'Coût produits non disponible : aucune colonne de coût (*_cents) en V1.'
        : null,
    paymentFeesCents: row.payment_fees_cents,
    shippingCents: row.shipping_cents,
    creditTotalCents: row.credit_total_cents,
    profitEstimateCents: row.profit_estimate_cents,
    profitEstimateExcludesCost: row.profit_estimate_excludes_cost,
  };
}

/**
 * Charge (et, pour une campagne `closed`, fige au besoin) le rapport
 * complet d'une campagne. Retourne `null` si la campagne n'existe pas
 * (l'appelant -- la page/la route -- décide alors d'un 404).
 *
 * Campagne ACTIVE (ou tout statut autre que `closed`) : toujours recalculé
 * en direct, jamais mis en cache -- les chiffres d'une campagne en cours
 * DOIVENT bouger (CLAUDE.md section 4, source de vérité = les lignes de
 * crédit).
 *
 * Campagne `closed` : relit d'abord `campaign_reports` pour
 * `(campaignId, closed_at)` (voir migration 0018). Trouvé -> retourné tel
 * quel (figé, `frozen: true`). Absent -> calculé une première fois puis
 * persisté avant d'être retourné -- toute vue SUIVANTE pour la même clôture
 * relira ce même figeage, jamais un recalcul.
 */
export async function loadCampaignReport(
  campaignId: string,
  repo: CampaignReportRepo,
  options: { now?: Date; generatedBy?: string | null } = {},
): Promise<CampaignReport | null> {
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) return null;

  if (campaign.status === 'closed' && campaign.closed_at) {
    const cached = await repo.getCachedReport(campaignId, campaign.closed_at);
    if (cached) return mapCachedRowToReport(cached, campaign.name);

    const fresh = await computeFreshReport(campaignId, campaign.name, repo, options.now);
    const saved = await repo.saveReport({
      campaign_id: campaignId,
      closed_at: campaign.closed_at,
      order_count: fresh.orderCount,
      gross_sales_cents: fresh.grossSalesCents,
      tax_total_cents: fresh.taxTotalCents,
      tps_cents: fresh.tpsCents,
      tvq_cents: fresh.tvqCents,
      net_sales_cents: fresh.netSalesCents,
      product_cost_cents: fresh.productCostCents,
      payment_fees_cents: fresh.paymentFeesCents,
      shipping_cents: fresh.shippingCents,
      credit_total_cents: fresh.creditTotalCents,
      profit_estimate_cents: fresh.profitEstimateCents,
      profit_estimate_excludes_cost: fresh.profitEstimateExcludesCost,
      generated_by: options.generatedBy ?? null,
    });
    return mapCachedRowToReport(saved, campaign.name);
  }

  return computeFreshReport(campaignId, campaign.name, repo, options.now);
}

async function computeFreshReport(
  campaignId: string,
  campaignName: string,
  repo: CampaignReportRepo,
  now?: Date,
): Promise<CampaignReport> {
  const [orders, credits, payouts, taxRates] = await Promise.all([
    repo.listOrdersForCampaign(campaignId),
    repo.listActiveCreditsForCampaign(campaignId),
    repo.listPayoutsForCampaign(campaignId),
    repo.listAllTaxRates(),
  ]);

  return buildCampaignReport({
    campaignId,
    campaignName,
    orders,
    credits,
    payouts,
    taxRates,
    frozen: false,
    generatedAt: (now ?? new Date()).toISOString(),
  });
}
