'use server';

/**
 * Server Action « Faire avancer le statut de livraison » (Tâche 1.5.5,
 * docs/prompts/phase-1-5.md) -- un responsable d'équipe/club confirme la
 * réception groupée, puis la distribution, puis la complétion d'une
 * commande, une étape à la fois.
 *
 * Toute la validation (transition permise, autorisation, traçabilité,
 * notification `email_log`) vit dans `advanceOrderStatus`/la fonction
 * Postgres gardée `advance_order_status` (lib/orders/status.ts, migration
 * 0015) -- cette action ne fait qu'extraire les champs du `FormData` et
 * traduire les erreurs en message clair pour l'utilisateur, même patron que
 * `app/(portails)/compte/athletes/[athleteId]/actions.ts`.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  advanceOrderStatus,
  createSupabaseOrderStatusRepo,
  AdvanceOrderStatusError,
  InvalidOrderStatusTransitionError,
} from '@/lib/orders/status';
import type { OrderStatus } from '@/lib/db/types';

function redirectWithError(campaignId: string, error: unknown): never {
  const message =
    error instanceof AdvanceOrderStatusError || error instanceof InvalidOrderStatusTransitionError
      ? error.message
      : 'Une erreur est survenue pendant la mise à jour du statut.';
  redirect(`/campagnes/${campaignId}/livraison?erreur=${encodeURIComponent(message)}`);
}

export async function advanceOrderStatusAction(formData: FormData): Promise<void> {
  const campaignIdRaw = formData.get('campaignId');
  if (typeof campaignIdRaw !== 'string' || campaignIdRaw === '') {
    redirect('/campagnes');
  }
  const campaignId = campaignIdRaw;

  const orderIdRaw = formData.get('orderId');
  const currentStatusRaw = formData.get('currentStatus');
  const newStatusRaw = formData.get('newStatus');

  if (
    typeof orderIdRaw !== 'string' ||
    orderIdRaw === '' ||
    typeof currentStatusRaw !== 'string' ||
    currentStatusRaw === '' ||
    typeof newStatusRaw !== 'string' ||
    newStatusRaw === ''
  ) {
    redirectWithError(campaignId, new Error('Requête invalide.'));
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseOrderStatusRepo(supabase);
    await advanceOrderStatus(repo, currentStatusRaw as OrderStatus, orderIdRaw, newStatusRaw as OrderStatus);
  } catch (error) {
    redirectWithError(campaignId, error);
  }

  revalidatePath(`/campagnes/${campaignId}/livraison`);
  redirect(`/campagnes/${campaignId}/livraison?avis=${encodeURIComponent('Statut mis à jour.')}`);
}
