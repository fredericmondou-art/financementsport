'use server';

/**
 * Server Actions « Clôturer » / « Rouvrir » une campagne (Tâche 1.5.8,
 * docs/prompts/phase-1-5.md) -- même patron que
 * `app/(portails)/campagnes/[campaignId]/livraison/actions.ts` (Tâche 1.5.5) :
 * toute la validation (transition permise, autorisation, raison obligatoire
 * pour la réouverture, traçabilité) vit dans `lib/campaigns/close.ts` + les
 * fonctions Postgres gardées `close_campaign`/`reopen_campaign` (migration
 * 0017) -- ces actions ne font qu'extraire les champs du `FormData` et
 * traduire les erreurs en message clair pour l'utilisateur.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  closeCampaign,
  reopenCampaign,
  createSupabaseCampaignClosureRepo,
  CampaignClosureRpcError,
  InvalidCampaignClosureError,
  InvalidCampaignReopeningError,
  MissingReopenReasonError,
} from '@/lib/campaigns/close';
import type { CampaignStatus } from '@/lib/db/types';

function redirectWithError(campaignId: string, error: unknown): never {
  const message =
    error instanceof CampaignClosureRpcError ||
    error instanceof InvalidCampaignClosureError ||
    error instanceof InvalidCampaignReopeningError ||
    error instanceof MissingReopenReasonError
      ? error.message
      : 'Une erreur est survenue pendant la mise à jour du statut de la campagne.';
  redirect(`/campagnes/${campaignId}/cloturer?erreur=${encodeURIComponent(message)}`);
}

export async function closeCampaignAction(formData: FormData): Promise<void> {
  const campaignIdRaw = formData.get('campaignId');
  if (typeof campaignIdRaw !== 'string' || campaignIdRaw === '') {
    redirect('/campagnes');
  }
  const campaignId = campaignIdRaw;

  const currentStatusRaw = formData.get('currentStatus');
  if (typeof currentStatusRaw !== 'string' || currentStatusRaw === '') {
    redirectWithError(campaignId, new Error('Requête invalide.'));
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseCampaignClosureRepo(supabase);
    await closeCampaign(repo, currentStatusRaw as CampaignStatus, campaignId);
  } catch (error) {
    redirectWithError(campaignId, error);
  }

  revalidatePath(`/campagnes/${campaignId}/cloturer`);
  redirect(`/campagnes/${campaignId}/cloturer?avis=${encodeURIComponent('Campagne clôturée.')}`);
}

export async function reopenCampaignAction(formData: FormData): Promise<void> {
  const campaignIdRaw = formData.get('campaignId');
  if (typeof campaignIdRaw !== 'string' || campaignIdRaw === '') {
    redirect('/campagnes');
  }
  const campaignId = campaignIdRaw;

  const currentStatusRaw = formData.get('currentStatus');
  const reasonRaw = formData.get('reason');
  if (
    typeof currentStatusRaw !== 'string' ||
    currentStatusRaw === '' ||
    typeof reasonRaw !== 'string'
  ) {
    redirectWithError(campaignId, new Error('Requête invalide.'));
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  // Défense en profondeur côté UI -- l'autorisation réelle est vérifiée par
  // `reopen_campaign` (réservée platform_admin) ; on évite simplement
  // d'envoyer la requête pour un rôle qui échouera de toute façon.
  if (user.role !== 'platform_admin') {
    redirectWithError(campaignId, new Error('Seul un administrateur de la plateforme peut rouvrir une campagne.'));
  }

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseCampaignClosureRepo(supabase);
    await reopenCampaign(repo, currentStatusRaw as CampaignStatus, campaignId, reasonRaw as string);
  } catch (error) {
    redirectWithError(campaignId, error);
  }

  revalidatePath(`/campagnes/${campaignId}/cloturer`);
  redirect(`/campagnes/${campaignId}/cloturer?avis=${encodeURIComponent('Campagne rouverte.')}`);
}
