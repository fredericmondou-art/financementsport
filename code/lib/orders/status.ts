/**
 * Machine de transitions de statut de commande (Tâche 1.5.5, docs/prompts/
 * phase-1-5.md) : `lib/orders/status.ts` exigé par la tâche pour porter la
 * logique de transition AVANT toute écriture en base.
 *
 * Couvre les 11 statuts du type `order_status` (migration 0001), pas
 * seulement la portion « livraison » (ready → delivered_to_team →
 * distributed → completed) exposée par la page
 * `app/(portails)/campagnes/[campaignId]/livraison` -- la règle « interdire
 * les sauts illégaux (ex. payment_pending → distributed) » du cahier
 * suppose que la fonction de validation connaisse TOUS les statuts, pas
 * uniquement ceux que cette tâche expose dans l'UI.
 *
 * MIROIR SQL : la fonction Postgres `public.advance_order_status` (migration
 * 0015) réimplémente cette même table de transitions en plpgsql, parce
 * qu'une fonction TypeScript ne peut pas être appelée depuis l'intérieur
 * d'une fonction Postgres SECURITY DEFINER. Garder les deux synchronisés
 * manuellement -- voir le commentaire de tête de la migration 0015. Cette
 * duplication est un compromis documenté (voir docs/DECISIONS.md, Tâche
 * 1.5.5), pas un oubli.
 *
 * `platform_admin` garde par ailleurs un accès direct en écriture sur
 * `orders` via la policy RLS `orders_admin_update` (migration 0003,
 * commentaire : « platform_admin peut corriger un statut (ex. litige) via
 * UPDATE ») -- cette machine de transitions ne gouverne QUE le chemin
 * normal (webhook de paiement, puis responsable de campagne via la page
 * livraison) ; elle ne retire rien à cet échappatoire déjà existant et
 * volontaire pour les cas de litige/correction manuelle.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderStatus, OrdersTable } from '@/lib/db/types';
import { logger } from '@/lib/logger/logger';

export type OrderRow = OrdersTable['Row'];

/**
 * Table des transitions valides. `[]` = statut terminal pour ce flux normal
 * (un changement ultérieur, s'il est nécessaire, passe par la correction
 * manuelle platform_admin décrite ci-dessus, pas par cette machine).
 */
export const VALID_ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  payment_pending: ['paid', 'cancelled', 'error'],
  paid: ['preparing', 'cancelled', 'refunded'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered_to_team', 'cancelled'],
  delivered_to_team: ['distributed'],
  distributed: ['completed', 'partially_refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
  partially_refunded: [],
  error: [],
};

/** Étapes du flux de livraison groupée exposé par la page livraison
 * (Tâche 1.5.5). Sert à proposer la prochaine action au responsable --
 * la validation réelle passe toujours par `isValidOrderStatusTransition`. */
export const DELIVERY_STATUS_FLOW: readonly OrderStatus[] = [
  'ready',
  'delivered_to_team',
  'distributed',
  'completed',
];

const ORDER_STATUS_LABELS_FR: Record<OrderStatus, string> = {
  payment_pending: 'Paiement en attente',
  paid: 'Payée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivered_to_team: "Livrée à l'équipe",
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

/** Fonction PURE. */
export function getValidNextStatuses(current: OrderStatus): readonly OrderStatus[] {
  return VALID_ORDER_STATUS_TRANSITIONS[current];
}

/** Fonction PURE. */
export function isValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export class InvalidOrderStatusTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(
      `Transition de statut invalide : « ${orderStatusLabelFr(from)} » (${from}) vers ` +
        `« ${orderStatusLabelFr(to)} » (${to}) n'est pas permis.`,
    );
    this.name = 'InvalidOrderStatusTransitionError';
  }
}

/** Lève `InvalidOrderStatusTransitionError` (message clair, en français) si
 * la transition n'est pas dans la table -- sinon ne fait rien. Fonction
 * PURE (aucune I/O), à appeler avant toute écriture. */
export function assertValidOrderStatusTransition(from: OrderStatus, to: OrderStatus): void {
  if (!isValidOrderStatusTransition(from, to)) {
    throw new InvalidOrderStatusTransitionError(from, to);
  }
}

/** Prochaine étape du flux de livraison groupée après `current`, ou `null`
 * si `current` n'est pas (ou plus) dans ce flux. Fonction PURE, purement
 * informative pour l'UI (libellé du bouton "Confirmer..."). */
export function nextDeliveryStatus(current: OrderStatus): OrderStatus | null {
  const index = DELIVERY_STATUS_FLOW.indexOf(current);
  if (index === -1 || index === DELIVERY_STATUS_FLOW.length - 1) {
    return null;
  }
  return DELIVERY_STATUS_FLOW[index + 1]!;
}

/** Statuts qui déclenchent une notification journalisée dans `email_log`
 * (cahier, Tâche 1.5.5 : « Notifier... le client à distribué/complété »).
 * Fonction PURE. */
export function statusRequiresClientNotification(status: OrderStatus): boolean {
  return status === 'distributed' || status === 'completed';
}

/** Nom de gabarit `email_log.template` pour un statut notifiable. Fonction
 * PURE. Lève une erreur si appelée pour un statut non notifiable -- erreur
 * de programmation de l'appelant, pas un cas à gérer silencieusement. */
export function notificationTemplateForStatus(status: OrderStatus): 'order_distributed' | 'order_completed' {
  if (status === 'distributed') return 'order_distributed';
  if (status === 'completed') return 'order_completed';
  throw new Error(`Le statut "${status}" ne déclenche aucune notification.`);
}

/**
 * Erreur renvoyée par Postgres lorsque la fonction `advance_order_status`
 * refuse l'appel -- soit faute d'autorisation, soit transition invalide
 * (la fonction SQL valide À NOUVEAU la transition côté serveur ; voir le
 * commentaire de tête de ce fichier sur la duplication TS/SQL). On ne fait
 * pas confiance à la seule validation TypeScript faite avant l'appel : un
 * client pourrait appeler le RPC directement.
 */
export class AdvanceOrderStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdvanceOrderStatusError';
  }
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `DistributionRepo`, Tâche 1.5.4). */
export interface OrderStatusRepo {
  /** Appelle la fonction Postgres gardée `advance_order_status` (migration
   * 0015) : vérifie l'autorisation et la transition CÔTÉ SERVEUR, écrit le
   * nouveau statut + `order_status_log` + `email_log` (si notifiable), tout
   * dans une seule transaction. */
  advanceOrderStatus(orderId: string, newStatus: OrderStatus): Promise<OrderRow>;
}

export function createSupabaseOrderStatusRepo(supabase: SupabaseClient): OrderStatusRepo {
  return {
    async advanceOrderStatus(orderId, newStatus) {
      const { data, error } = await supabase.rpc('advance_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
      });
      if (error) {
        logger.error('advance_order_status refusé ou échoué', {
          orderId,
          newStatus,
          error: error.message,
        });
        throw new AdvanceOrderStatusError(error.message);
      }
      return data as OrderRow;
    },
  };
}

/**
 * Fait avancer une commande vers `newStatus`, en validant d'abord la
 * transition côté TypeScript (message clair immédiat, sans aller-retour
 * réseau pour un cas évidemment invalide) puis en appelant la fonction
 * Postgres gardée -- qui revalide tout (défense en profondeur, voir
 * `AdvanceOrderStatusError`).
 */
export async function advanceOrderStatus(
  repo: OrderStatusRepo,
  currentStatus: OrderStatus,
  orderId: string,
  newStatus: OrderStatus,
): Promise<OrderRow> {
  assertValidOrderStatusTransition(currentStatus, newStatus);
  return repo.advanceOrderStatus(orderId, newStatus);
}
