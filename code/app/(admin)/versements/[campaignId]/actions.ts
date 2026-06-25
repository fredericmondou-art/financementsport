'use server';

/**
 * Server Actions « Versements » (Tâche 1.5.10, docs/prompts/phase-1-5.md) --
 * même patron que `app/(portails)/campagnes/[campaignId]/cloturer/actions.ts`
 * (Tâche 1.5.8) : toute la validation (transition permise, montants,
 * autorisation, traçabilité) vit dans `lib/payouts/calculate.ts` /
 * `lib/payouts/workflow.ts` + la fonction Postgres gardée
 * `advance_payout_status` (migration 0019) -- ces actions ne font qu'extraire
 * les champs du `FormData`, vérifier le garde applicatif `can()`, et traduire
 * les erreurs en message clair.
 *
 * Montants saisis par l'admin (ajustement) acceptés directement EN CENTIMES
 * (pas en dollars) -- décision autonome (voir docs/DECISIONS.md, Tâche
 * 1.5.10) : aucun utilitaire de conversion dollars→centimes fiable n'existe
 * encore dans le projet, et inventer une conversion par `parseFloat`/`* 100`
 * pour un montant d'argent réel violerait l'esprit de CLAUDE.md section 4
 * (jamais de float pour de l'argent) -- plus sûr de demander l'entier
 * directement à un admin déjà formé au système (montants `*_cents` partout
 * ailleurs dans le back-office) que d'introduire un point d'arrondi flottant
 * non testé sur le seul écran qui permet de RÉÉCRIRE un montant validé.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { can } from '@/lib/auth/permissions';
import {
  recalculatePayoutsForCampaign,
  createSupabasePayoutCalculationRepo,
  CampaignNotClosedError,
  CampaignNotFoundError,
} from '@/lib/payouts/calculate';
import {
  advancePayoutStatus,
  createSupabasePayoutWorkflowRepo,
  PayoutWorkflowRpcError,
  InvalidPayoutStatusTransitionError,
  MissingPayoutProofError,
  MissingPayoutAdjustmentReasonError,
  MissingPayoutAdjustmentAmountError,
} from '@/lib/payouts/workflow';
import type { PayoutStatus, PayoutsTable } from '@/lib/db/types';

type PayoutRow = PayoutsTable['Row'];

function redirectWithError(campaignId: string, error: unknown): never {
  const message =
    error instanceof CampaignNotClosedError ||
    error instanceof CampaignNotFoundError ||
    error instanceof InvalidPayoutStatusTransitionError ||
    error instanceof MissingPayoutProofError ||
    error instanceof MissingPayoutAdjustmentReasonError ||
    error instanceof MissingPayoutAdjustmentAmountError ||
    error instanceof PayoutWorkflowRpcError
      ? error.message
      : 'Une erreur est survenue pendant la mise à jour des versements.';
  redirect(`/versements/${campaignId}?erreur=${encodeURIComponent(message)}`);
}

/** Garde applicatif partagé par les deux actions ci-dessous -- réservé à
 * `platform_admin` (voir `lib/auth/permissions.ts` : `accounting` n'a que la
 * LECTURE sur la ressource `payout`, décision déjà testée dans
 * `tests/unit/permissions.test.ts`, non remise en cause par cette tâche). */
async function requirePayoutWriteAccess(campaignId: string): ReturnType<typeof getCurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'update', { type: 'payout' })) {
    redirectWithError(campaignId, new Error("Seul un administrateur de la plateforme peut gérer les versements."));
  }
  return user;
}

export async function recalculatePayoutsAction(formData: FormData): Promise<void> {
  const campaignIdRaw = formData.get('campaignId');
  if (typeof campaignIdRaw !== 'string' || campaignIdRaw === '') {
    redirect('/versements');
  }
  const campaignId = campaignIdRaw;

  await requirePayoutWriteAccess(campaignId);

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabasePayoutCalculationRepo(supabase);
    await recalculatePayoutsForCampaign(repo, campaignId);
  } catch (error) {
    redirectWithError(campaignId, error);
  }

  revalidatePath(`/versements/${campaignId}`);
  redirect(`/versements/${campaignId}?avis=${encodeURIComponent('Versements recalculés.')}`);
}

function parseOptionalNonNegativeInt(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Montant invalide -- un entier positif en centimes est requis.');
  }
  return value;
}

export async function advancePayoutStatusAction(formData: FormData): Promise<void> {
  const campaignIdRaw = formData.get('campaignId');
  if (typeof campaignIdRaw !== 'string' || campaignIdRaw === '') {
    redirect('/versements');
  }
  const campaignId = campaignIdRaw;

  await requirePayoutWriteAccess(campaignId);

  const payoutId = formData.get('payoutId');
  const currentStatus = formData.get('currentStatus');
  const nextStatus = formData.get('nextStatus');
  const existingProofUrl = formData.get('existingProofUrl');
  if (
    typeof payoutId !== 'string' ||
    payoutId === '' ||
    typeof currentStatus !== 'string' ||
    currentStatus === '' ||
    typeof nextStatus !== 'string' ||
    nextStatus === ''
  ) {
    redirectWithError(campaignId, new Error('Requête invalide.'));
  }

  const proofUrlRaw = formData.get('proofUrl');
  const noteRaw = formData.get('note');

  try {
    const newAmountCents = parseOptionalNonNegativeInt(formData.get('newAmountCents'));
    const newFeeHeldCents = parseOptionalNonNegativeInt(formData.get('newFeeHeldCents'));

    const supabase = createSupabaseServerClient();
    const repo = createSupabasePayoutWorkflowRepo(supabase);
    await advancePayoutStatus(
      repo,
      currentStatus as PayoutStatus,
      typeof existingProofUrl === 'string' && existingProofUrl !== '' ? existingProofUrl : null,
      payoutId,
      nextStatus as PayoutStatus,
      {
        proofUrl: typeof proofUrlRaw === 'string' && proofUrlRaw.trim() !== '' ? proofUrlRaw.trim() : undefined,
        note: typeof noteRaw === 'string' && noteRaw.trim() !== '' ? noteRaw.trim() : undefined,
        newAmountCents,
        newFeeHeldCents,
      },
    );
  } catch (error) {
    redirectWithError(campaignId, error);
  }

  revalidatePath(`/versements/${campaignId}`);
  redirect(`/versements/${campaignId}?avis=${encodeURIComponent('Statut du versement mis à jour.')}`);
}

export type { PayoutRow };
