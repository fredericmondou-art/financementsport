/**
 * Écriture atomique commande + lignes + crédits (Tâche 1.5 — CŒUR).
 *
 * Toute la logique métier (calcul de crédit, statut actif/pending, calcul de
 * taxe, validation de la répartition) est déjà faite par l'appelant
 * (app/api/webhooks/stripe) via lib/credits/*, lib/taxes/* -- ce module ne
 * fait QUE persister, en appelant la fonction Postgres `create_paid_order`
 * (migration 0006) via `supabase.rpc()`. C'est le seul mécanisme
 * d'atomicité multi-tables disponible côté supabase-js (PostgREST ne permet
 * pas de transaction multi-instructions depuis le client) : toute la
 * fonction s'exécute dans une seule transaction Postgres, rollback complet
 * si une exception non interceptée survient (CLAUDE.md section 4).
 *
 * Idempotence : l'appelant doit fournir `stripeEventId` (id d'évènement
 * Stripe). La fonction SQL gère elle-même la déduplication -- ce module ne
 * fait aucune vérification préalable (cela introduirait une fenêtre de
 * course ; voir le commentaire de la migration 0006).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrdersTable } from '@/lib/db/types';
import type { OrderCreditInsertPayload } from '@/lib/credits/persist';
import { logger } from '@/lib/logger/logger';

export type OrderRow = OrdersTable['Row'];

export interface OrderItemInsertPayload {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

export interface CreatePaidOrderInput {
  stripeEventId: string;
  stripeEventType: string;
  stripePaymentIntentId: string;
  userId: string | null;
  guestEmail: string | null;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddressId: string | null;
  primaryCampaignId: string | null;
  teamId: string | null;
  items: OrderItemInsertPayload[];
  credits: OrderCreditInsertPayload[];
  /** Évènement Stripe brut, pour audit/litige -- jamais de secret dedans
   * (CLAUDE.md section 5 : aucun secret en dur, et le webhook ne reçoit de
   * toute façon que des données déjà publiques côté Stripe). */
  eventPayload?: unknown;
}

/**
 * Crée la commande payée (et ses lignes/crédits) de façon atomique et
 * idempotente. Retourne la commande -- soit nouvellement créée, soit celle
 * déjà créée par un appel antérieur portant le même `stripeEventId`.
 */
export async function createPaidOrder(
  supabase: SupabaseClient,
  input: CreatePaidOrderInput,
): Promise<OrderRow> {
  const { data, error } = await supabase.rpc('create_paid_order', {
    p_stripe_event_id: input.stripeEventId,
    p_stripe_event_type: input.stripeEventType,
    p_stripe_payment_intent_id: input.stripePaymentIntentId,
    p_user_id: input.userId,
    p_guest_email: input.guestEmail,
    p_subtotal_cents: input.subtotalCents,
    p_tax_cents: input.taxCents,
    p_shipping_cents: input.shippingCents,
    p_total_cents: input.totalCents,
    p_shipping_address_id: input.shippingAddressId,
    p_primary_campaign_id: input.primaryCampaignId,
    p_team_id: input.teamId,
    p_items: input.items,
    p_credits: input.credits,
    p_event_payload: input.eventPayload ?? null,
  });

  if (error) {
    logger.error('création de commande atomique échouée (create_paid_order)', {
      stripeEventId: input.stripeEventId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      error: error.message,
    });
    throw error;
  }

  return data as OrderRow;
}
