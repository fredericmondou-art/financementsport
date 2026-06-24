/**
 * Liste de distribution par équipe (Tâche 1.5.4, docs/prompts/phase-1-5.md) :
 * regroupe les commandes d'une campagne par athlète (bénéficiaire) puis par
 * client, avec produits/quantités/statut de paiement -- pour que le
 * responsable sache quoi remettre à qui à la livraison (section 24 du
 * cahier).
 *
 * Même séparation logique/I/O que `lib/orders/list-orders.ts` : un
 * `DistributionRepo` injecté pour l'I/O, des fonctions PURES
 * (`buildDistributionGroups`, `isOrderPaid`, ...) testées sans base de
 * données réelle.
 *
 * `distribution_lists` (table existant depuis 0001_initial_schema.sql, en
 * amorce de Phase 1.5) ne stocke qu'un statut de cycle de vie
 * ('draft'|'ready'|'distributed') -- jamais le contenu de la liste : le
 * contenu est TOUJOURS recalculé à la demande à partir de `orders`/
 * `order_items`/`order_credits`, qui restent la seule source de vérité
 * (CLAUDE.md section 4, "les soldes ne se stockent pas en dur"). Générer la
 * liste (`buildDistributionList`) fait passer le statut de 'draft' à 'ready'
 * s'il existe déjà un brouillon, ou en crée un si c'est la première fois --
 * jamais 'distributed', qui relève de la Tâche 1.5.5 (confirmation de
 * réception).
 *
 * Décision autonome importante (voir docs/DECISIONS.md, Tâche 1.5.4) :
 * regroupement par bénéficiaire à partir de TOUTES les lignes
 * `order_credits` de chaque commande (peu importe leur propre
 * `campaign_id`), pas seulement celles dont `campaign_id` correspond
 * exactement à la campagne demandée. Cette liste sert à distribuer des
 * PRODUITS PHYSIQUES, pas à ventiler de l'argent (déjà géré par
 * `order_credits`/les rapports financiers) : si une commande de cette
 * campagne a été répartie entre deux athlètes, les deux doivent voir cette
 * commande dans leur groupe pour le suivi de livraison, même si un des deux
 * était rattaché à une autre campagne au moment du calcul du crédit. Une
 * commande sans aucun crédit (état défensif, ne devrait pas arriver vu la
 * création atomique de la Tâche 1.3) atterrit dans un groupe de repli
 * `UNASSIGNED_GROUP_KEY`, plutôt que de disparaître silencieusement de la
 * liste.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BeneficiaryType,
  DistributionListsTable,
  OrderCreditsTable,
  OrderItemsTable,
  OrderStatus,
  OrdersTable,
} from '@/lib/db/types';
import { beneficiaryLabelKey, loadBeneficiaryLabels } from '@/lib/cart/beneficiary-labels';

export type OrderRow = OrdersTable['Row'];
export type OrderItemRow = OrderItemsTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];
export type DistributionListRow = DistributionListsTable['Row'];

/**
 * Statuts de commande considérés « payés » pour l'affichage de la liste de
 * distribution. `partially_refunded` reste compté payé : un remboursement
 * partiel ne signifie pas que rien n'a été livré -- la commande complète
 * reste pertinente pour la distribution physique. `payment_pending`,
 * `cancelled`, `refunded`, `error` restent « non payés » : une commande non
 * payée DOIT tout de même apparaître dans la liste (critère d'acceptation),
 * mais clairement signalée comme telle.
 */
const PAID_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'preparing',
  'ready',
  'delivered_to_team',
  'distributed',
  'completed',
  'partially_refunded',
]);

/** Fonction PURE. */
export function isOrderPaid(status: OrderStatus): boolean {
  return PAID_ORDER_STATUSES.has(status);
}

const ORDER_STATUS_LABELS_FR: Record<OrderStatus, string> = {
  payment_pending: 'Paiement en attente',
  paid: 'Payée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivered_to_team: 'Livrée à l\'équipe',
  distributed: 'Distribuée',
  completed: 'Complétée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
  partially_refunded: 'Partiellement remboursée',
  error: 'Erreur',
};

/** Fonction PURE. */
export function orderStatusLabelFr(status: OrderStatus): string {
  return ORDER_STATUS_LABELS_FR[status];
}

export const UNASSIGNED_GROUP_KEY = 'unassigned';

export interface DistributionItemRow {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface DistributionOrderEntry {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  isPaid: boolean;
  buyerDisplayName: string;
  buyerSortKey: string;
  items: DistributionItemRow[];
  totalCents: number;
}

export interface DistributionGroup {
  beneficiaryType: BeneficiaryType | null;
  beneficiaryId: string | null;
  beneficiaryLabel: string;
  orders: DistributionOrderEntry[];
}

/** Dernier mot non vide de `name` -- approximation du nom de famille, faute
 * de colonnes prénom/nom séparées sur `profiles.full_name` (TEXT unique). */
function extractFamilyName(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  return words.length > 0 ? words[words.length - 1]! : name;
}

/** Nom d'affichage + clé de tri d'un acheteur, à partir de son `user_id`
 * (compte) ou de son `guest_email` (invité, jamais de nom disponible -- voir
 * docs/DECISIONS.md, Tâche 1.5.4 : pas de colonne nom sur `addresses` ni sur
 * `orders` pour un invité). Fonction PURE. */
export function resolveBuyerIdentity(
  order: Pick<OrderRow, 'user_id' | 'guest_email'>,
  buyerNames: Map<string, string>,
): { displayName: string; sortKey: string } {
  if (order.user_id) {
    const fullName = buyerNames.get(order.user_id);
    if (fullName) {
      return { displayName: fullName, sortKey: extractFamilyName(fullName) };
    }
  }
  const email = order.guest_email ?? 'Acheteur inconnu';
  return { displayName: `${email} (invité)`, sortKey: email };
}

/**
 * Regroupe commandes/lignes/crédits par bénéficiaire puis par client, triés
 * comme demandé par le cahier ("par athlète, puis nom de famille du
 * client"). Fonction PURE, testée indépendamment de tout repo.
 */
export function buildDistributionGroups(input: {
  orders: OrderRow[];
  items: OrderItemRow[];
  credits: OrderCreditRow[];
  beneficiaryLabels: Map<string, string>;
  buyerNames: Map<string, string>;
}): DistributionGroup[] {
  const { orders, items, credits, beneficiaryLabels, buyerNames } = input;

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  const creditsByOrder = new Map<string, OrderCreditRow[]>();
  for (const credit of credits) {
    const list = creditsByOrder.get(credit.order_id) ?? [];
    list.push(credit);
    creditsByOrder.set(credit.order_id, list);
  }

  interface MutableGroup {
    beneficiaryType: BeneficiaryType | null;
    beneficiaryId: string | null;
    beneficiaryLabel: string;
    sortKey: string;
    orderIds: Set<string>;
  }
  const groups = new Map<string, MutableGroup>();

  for (const order of orders) {
    const orderCredits = creditsByOrder.get(order.id) ?? [];
    const beneficiaryKeys =
      orderCredits.length > 0
        ? [...new Set(orderCredits.map((c) => beneficiaryLabelKey(c.beneficiary_type, c.beneficiary_id)))]
        : [UNASSIGNED_GROUP_KEY];

    for (const key of beneficiaryKeys) {
      let group = groups.get(key);
      if (!group) {
        if (key === UNASSIGNED_GROUP_KEY) {
          group = {
            beneficiaryType: null,
            beneficiaryId: null,
            beneficiaryLabel: 'Bénéficiaire non identifié',
            sortKey: '￿', // toujours trié en dernier
            orderIds: new Set(),
          };
        } else {
          const [beneficiaryType, beneficiaryId] = key.split(':') as [BeneficiaryType, string];
          const label = beneficiaryLabels.get(key) ?? 'Bénéficiaire inconnu';
          group = {
            beneficiaryType,
            beneficiaryId,
            beneficiaryLabel: label,
            sortKey: beneficiaryType === 'athlete' ? extractFamilyName(label) : label,
            orderIds: new Set(),
          };
        }
        groups.set(key, group);
      }
      group.orderIds.add(order.id);
    }
  }

  const ordersById = new Map(orders.map((order) => [order.id, order]));

  function buildOrderEntry(order: OrderRow): DistributionOrderEntry {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const { displayName, sortKey } = resolveBuyerIdentity(order, buyerNames);
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      statusLabel: orderStatusLabelFr(order.status),
      isPaid: isOrderPaid(order.status),
      buyerDisplayName: displayName,
      buyerSortKey: sortKey,
      items: orderItems.map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        lineTotalCents: item.line_total_cents,
      })),
      totalCents: order.total_cents,
    };
  }

  const result: DistributionGroup[] = Array.from(groups.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr-CA'))
    .map((group) => {
      const groupOrders = Array.from(group.orderIds)
        .map((id) => ordersById.get(id))
        .filter((order): order is OrderRow => order !== undefined)
        .map(buildOrderEntry)
        .sort((a, b) => a.buyerSortKey.localeCompare(b.buyerSortKey, 'fr-CA'));
      return {
        beneficiaryType: group.beneficiaryType,
        beneficiaryId: group.beneficiaryId,
        beneficiaryLabel: group.beneficiaryLabel,
        orders: groupOrders,
      };
    });

  return result;
}

/** Accès aux données, injecté pour permettre des tests sans base réelle. */
export interface DistributionRepo {
  listOrdersForCampaign(campaignId: string, teamId?: string | null): Promise<OrderRow[]>;
  listItemsForOrders(orderIds: string[]): Promise<OrderItemRow[]>;
  listCreditsForOrders(orderIds: string[]): Promise<OrderCreditRow[]>;
  loadBuyerNames(userIds: string[]): Promise<Map<string, string>>;
  /** Lit le brouillon de liste existant (s'il y en a un) pour cette
   * campagne/équipe, ou en crée un nouveau en statut 'ready'. */
  getOrCreateDistributionList(campaignId: string, teamId: string | null): Promise<DistributionListRow>;
}

export function createSupabaseDistributionRepo(supabase: SupabaseClient): DistributionRepo {
  return {
    async listOrdersForCampaign(campaignId, teamId) {
      let query = supabase.from('orders').select('*').eq('primary_campaign_id', campaignId);
      if (teamId) {
        query = query.eq('team_id', teamId);
      }
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      return (data as OrderRow[]) ?? [];
    },
    async listItemsForOrders(orderIds) {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase.from('order_items').select('*').in('order_id', orderIds);
      if (error) throw error;
      return (data as OrderItemRow[]) ?? [];
    },
    async listCreditsForOrders(orderIds) {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase.from('order_credits').select('*').in('order_id', orderIds);
      if (error) throw error;
      return (data as OrderCreditRow[]) ?? [];
    },
    async loadBuyerNames(userIds) {
      const ids = [...new Set(userIds)];
      if (ids.length === 0) return new Map();
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      if (error) throw error;
      const names = new Map<string, string>();
      for (const row of (data as Array<{ id: string; full_name: string | null }>) ?? []) {
        if (row.full_name) {
          names.set(row.id, row.full_name);
        }
      }
      return names;
    },
    async getOrCreateDistributionList(campaignId, teamId) {
      const existingQuery = supabase
        .from('distribution_lists')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('generated_at', { ascending: false })
        .limit(1);
      const { data: existing, error: existingError } = teamId
        ? await existingQuery.eq('team_id', teamId)
        : await existingQuery;
      if (existingError) throw existingError;
      const current = (existing as DistributionListRow[] | null)?.[0];
      if (current) {
        if (current.status === 'draft') {
          const { data, error } = await supabase
            .from('distribution_lists')
            .update({ status: 'ready' })
            .eq('id', current.id)
            .select('*')
            .single();
          if (error) throw error;
          return data as DistributionListRow;
        }
        return current;
      }
      const { data, error } = await supabase
        .from('distribution_lists')
        .insert({ campaign_id: campaignId, team_id: teamId, status: 'ready' })
        .select('*')
        .single();
      if (error) throw error;
      return data as DistributionListRow;
    },
  };
}

export interface DistributionList {
  list: DistributionListRow;
  groups: DistributionGroup[];
}

/**
 * Construit la liste de distribution complète d'une campagne (et,
 * optionnellement, d'une équipe précise au sein de cette campagne). Utilisé
 * par la page portail et par les exports PDF/CSV (mêmes données, voir
 * `lib/export/csv.ts`/`lib/export/pdf.ts`).
 */
export async function buildDistributionList(
  campaignId: string,
  teamId: string | null,
  repo: DistributionRepo,
  supabase: SupabaseClient,
): Promise<DistributionList> {
  const orders = await repo.listOrdersForCampaign(campaignId, teamId);
  const orderIds = orders.map((order) => order.id);
  const [items, credits, list] = await Promise.all([
    repo.listItemsForOrders(orderIds),
    repo.listCreditsForOrders(orderIds),
    repo.getOrCreateDistributionList(campaignId, teamId),
  ]);

  const buyerUserIds = orders.map((order) => order.user_id).filter((id): id is string => id !== null);
  const buyerNames = await repo.loadBuyerNames(buyerUserIds);

  const beneficiaries = [...new Set(credits.map((c) => beneficiaryLabelKey(c.beneficiary_type, c.beneficiary_id)))].map(
    (key) => {
      const credit = credits.find((c) => beneficiaryLabelKey(c.beneficiary_type, c.beneficiary_id) === key)!;
      return { beneficiaryType: credit.beneficiary_type, beneficiaryId: credit.beneficiary_id };
    },
  );
  const beneficiaryLabels = await loadBeneficiaryLabels(supabase, beneficiaries);

  const groups = buildDistributionGroups({ orders, items, credits, beneficiaryLabels, buyerNames });
  return { list, groups };
}
