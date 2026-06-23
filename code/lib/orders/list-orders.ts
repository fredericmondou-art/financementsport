/**
 * Lecture des commandes d'un client pour l'espace parent (Tâche 1.6.A3,
 * docs/prompts/phase-1-6.md) : historique de commandes, impact par
 * bénéficiaire, et chargement d'une commande précise pour le reçu ou le
 * rachat.
 *
 * Même séparation logique/I/O que `lib/orders/create-order.ts` /
 * `lib/cart/cart.ts` : un `OrdersRepo` injecté, et des fonctions PURES
 * (`groupOrderDetails`, `summarizeImpactByBeneficiary`) testées sans base de
 * données réelle.
 *
 * Décision autonome importante (voir docs/DECISIONS.md, Tâche 1.6.A3) : ce
 * module lit `orders`/`order_items`/`order_credits` avec le client RLS
 * normal (`createSupabaseServerClient`), PAS `service_role` -- contrairement
 * à `lib/cart/cart.ts` (paniers, sans policy RLS dédiée). Cette lecture
 * n'était possible pour `order_credits` qu'après la migration
 * `0009_order_credits_select_own_order.sql`, qui ajoute la policy manquante
 * permettant à un client de lire le crédit de SES PROPRES commandes
 * (`private.owns_order(order_id)`) -- gap découvert en construisant cette
 * tâche, voir le commentaire de cette migration pour le détail.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType, OrderCreditsTable, OrderItemsTable, OrdersTable } from '@/lib/db/types';
import { NotFoundError } from '@/lib/entities/errors';

export type OrderRow = OrdersTable['Row'];
export type OrderItemRow = OrderItemsTable['Row'];
export type OrderCreditRow = OrderCreditsTable['Row'];

export interface OrderWithDetails {
  order: OrderRow;
  items: OrderItemRow[];
  credits: OrderCreditRow[];
}

/** Accès aux données `orders`/`order_items`/`order_credits`, injecté pour
 * permettre des tests unitaires/d'intégration sans base de données réelle. */
export interface OrdersRepo {
  /** Toutes les commandes du client, peu importe le statut -- en V1 une
   * commande n'existe que si elle a été créée par `create_paid_order`
   * (Tâche 1.5, déclenché par le webhook Stripe), donc déjà payée ; un statut
   * `cancelled`/`refunded` éventuel (remboursement manuel par un admin)
   * reste affiché dans l'historique plutôt que masqué -- "le parent voit ses
   * commandes" (docs/prompts/phase-1-6.md), pas seulement les actives. */
  listOrdersForUser(userId: string): Promise<OrderRow[]>;
  getOrderById(orderId: string): Promise<OrderRow | null>;
  listItemsForOrders(orderIds: string[]): Promise<OrderItemRow[]>;
  listCreditsForOrders(orderIds: string[]): Promise<OrderCreditRow[]>;
}

export function createSupabaseOrdersRepo(supabase: SupabaseClient): OrdersRepo {
  return {
    async listOrdersForUser(userId) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as OrderRow[]) ?? [];
    },
    async getOrderById(orderId) {
      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error) throw error;
      return (data as OrderRow) ?? null;
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
  };
}

/**
 * Regroupe des lignes/crédits à plat sous chaque commande. Fonction PURE,
 * testée indépendamment de tout repo.
 */
export function groupOrderDetails(
  orders: OrderRow[],
  items: OrderItemRow[],
  credits: OrderCreditRow[],
): OrderWithDetails[] {
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

  return orders.map((order) => ({
    order,
    items: itemsByOrder.get(order.id) ?? [],
    credits: creditsByOrder.get(order.id) ?? [],
  }));
}

/** Charge l'historique complet (commandes + lignes + crédits) d'un client. */
export async function listOrdersWithDetailsForUser(
  userId: string,
  repo: OrdersRepo,
): Promise<OrderWithDetails[]> {
  const orders = await repo.listOrdersForUser(userId);
  if (orders.length === 0) {
    return [];
  }
  const orderIds = orders.map((order) => order.id);
  const [items, credits] = await Promise.all([
    repo.listItemsForOrders(orderIds),
    repo.listCreditsForOrders(orderIds),
  ]);
  return groupOrderDetails(orders, items, credits);
}

/**
 * Charge UNE commande avec ses détails, après avoir vérifié qu'elle
 * appartient bien à `userId` -- défense en profondeur en plus de RLS
 * (`orders_select_scoped`/`order_credits_select_own_order`), même principe
 * que `assertCartOwnership` (lib/cart/cart.ts) : ne jamais révéler qu'une
 * commande d'un tiers existe (même message d'erreur qu'un id inexistant).
 * Utilisé par la page de reçu et par le rachat (Tâche 1.6.A3).
 */
export async function getOrderWithDetailsForUser(
  orderId: string,
  userId: string,
  repo: OrdersRepo,
): Promise<OrderWithDetails> {
  const order = await repo.getOrderById(orderId);
  if (!order || order.user_id !== userId) {
    throw new NotFoundError('Commande introuvable.');
  }
  const [items, credits] = await Promise.all([
    repo.listItemsForOrders([order.id]),
    repo.listCreditsForOrders([order.id]),
  ]);
  return { order, items, credits };
}

export interface BeneficiaryImpact {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  totalAmountCents: number;
}

/**
 * Somme le crédit généré par bénéficiaire, sur l'ensemble des commandes
 * fournies (« tu as généré X $ pour [athlète/équipe] », docs/prompts/
 * phase-1-6.md). N'additionne que les statuts `active`/`pending` -- même
 * convention que la vue `v_campaign_progress` (migration 0001) -- pour ne
 * jamais afficher un crédit `cancelled`/`refunded`/`expired` comme un impact
 * réel. Fonction PURE, triée du plus grand au plus petit impact.
 */
export function summarizeImpactByBeneficiary(details: OrderWithDetails[]): BeneficiaryImpact[] {
  const totals = new Map<string, BeneficiaryImpact>();

  for (const detail of details) {
    for (const credit of detail.credits) {
      if (credit.status !== 'active' && credit.status !== 'pending') {
        continue;
      }
      const key = `${credit.beneficiary_type}:${credit.beneficiary_id}`;
      const existing = totals.get(key);
      if (existing) {
        existing.totalAmountCents += credit.amount_cents;
      } else {
        totals.set(key, {
          beneficiaryType: credit.beneficiary_type,
          beneficiaryId: credit.beneficiary_id,
          totalAmountCents: credit.amount_cents,
        });
      }
    }
  }

  return Array.from(totals.values()).sort((a, b) => b.totalAmountCents - a.totalAmountCents);
}
