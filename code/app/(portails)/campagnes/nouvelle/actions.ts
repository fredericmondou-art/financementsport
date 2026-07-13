/**
 * Server Actions de l'assistant de campagne en étapes (Tâche 1.6.B1). Même
 * style que la Tâche 1.7 : formulaires natifs, pas de "use client", "reshape"
 * du `FormData` puis délégation complète à `lib/campaigns/draft.ts` (sauvegarde
 * par étape) ou `lib/campaigns/create-campaign.ts` (création réelle, étape
 * finale uniquement) — CLAUDE.md section 6.
 *
 * Piège `redirect()` (digest `NEXT_REDIRECT`) : comme dans la Tâche 1.7, l'appel
 * de succès reste TOUJOURS hors du `try/catch` — voir `saveStepAndAdvance` et
 * `createCampaignFromDraftAction` ci-dessous, où seule la CONSTRUCTION du
 * résultat (parsing, accès DB) est protégée, jamais le `redirect()` final.
 *
 * Aucune vérification de rôle ici au-delà de "connecté" : un brouillon
 * (`campaign_drafts`) n'est jamais public et n'est promu en campagne réelle
 * qu'à `createCampaignFromDraftAction`, qui délègue à `createCampaign` — seul
 * point où `can()` (lib/auth/permissions.ts) est réellement vérifié. Voir
 * docs/DECISIONS.md.
 */
'use server';

import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createCampaign, createSupabaseCampaignRepo } from '@/lib/campaigns/create-campaign';
import {
  buildCampaignInputFromDraft,
  createSupabaseCampaignDraftRepo,
  mergeDraftData,
  nextStepId,
  parseStepInput,
  stepIndexFromStepId,
  type CampaignDraftStepId,
} from '@/lib/campaigns/draft';
import {
  bulkCreateAthletesFromPastedList,
  createSupabaseExistingAthleteRepo,
} from '@/lib/athletes/bulk-add';
import { createSupabaseAthleteRepo } from '@/lib/entities/athletes';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';
import type { AuthUser } from '@/lib/auth/permissions';

const NOUVELLE_CAMPAGNE_PATH = '/campagnes/nouvelle';

/** `''` → `null` : mêmes champs optionnels qu'à la Tâche 1.7 (montant
 * objectif, dates, message public) arrivent vides plutôt qu'absents. */
function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function toIsoOrNull(localDateTime: string | null): string | null {
  if (localDateTime === null) return null;
  // <input type="datetime-local"> n'inclut pas de fuseau ; interprété dans le
  // fuseau du serveur (Québec, CLAUDE.md section 2), sérialisé en ISO (UTC).
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessRuleError('Date invalide.');
  }
  return date.toISOString();
}

function redirectToStep(stepIndex: number, params: Record<string, string> = {}): never {
  const search = new URLSearchParams({ etape: String(stepIndex), ...params });
  redirect(`${NOUVELLE_CAMPAGNE_PATH}?${search.toString()}`);
}

function redirectWithError(stepIndex: number, error: unknown): never {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message ?? 'Entrée invalide.'
      : error instanceof BusinessRuleError ||
          error instanceof PermissionError ||
          error instanceof NotFoundError
        ? error.message
        : 'Une erreur est survenue.';
  redirectToStep(stepIndex, { erreur: message });
}

async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

/**
 * Valide les champs d'UNE étape, les fusionne dans le brouillon existant et
 * avance `current_step`. `buildRawInput` est appelé À L'INTÉRIEUR du
 * `try/catch` (contrairement au `redirect()` final) car certaines coercions
 * (`toIsoOrNull`, `Number(...)`) peuvent lever une erreur métier — elle doit
 * suivre le même chemin "redirige avec message" que les erreurs Zod.
 *
 * `retour` (Tâche 1.6.B3) : présent quand l'étape a été ouverte depuis le
 * lien « Modifier » du récapitulatif (champ caché `<ReturnToField>`, voir
 * app/(portails)/campagnes/nouvelle/page.tsx). Dans ce cas, on enregistre
 * toujours l'étape, mais on revient au récapitulatif au lieu d'avancer à
 * l'étape suivante — c'est ce qui rend la correction d'un champ "en un clic"
 * (un clic pour ouvrir l'étape, un clic pour enregistrer et revenir).
 */
async function saveStepAndAdvance(
  stepId: CampaignDraftStepId,
  stepIndex: number,
  retour: string | null,
  buildRawInput: () => unknown,
): Promise<void> {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const draftRepo = createSupabaseCampaignDraftRepo(supabase);

  let targetStepIndex: number;
  try {
    const rawInput = buildRawInput();
    const patch = parseStepInput(stepId, rawInput);
    const existing = await draftRepo.getDraft(user.id);
    const merged = mergeDraftData(existing?.data ?? {}, patch);
    const next: CampaignDraftStepId = retour === 'recap' ? 'recap' : nextStepId(stepId) ?? stepId;
    await draftRepo.saveStep(user.id, next, merged);
    targetStepIndex = stepIndexFromStepId(next);
  } catch (error) {
    redirectWithError(stepIndex, error);
  }

  redirectToStep(targetStepIndex);
}

export async function saveTypeNomStepAction(formData: FormData): Promise<void> {
  await saveStepAndAdvance('type_nom', 1, emptyToNull(formData.get('retour')), () => ({
    type: formData.get('type'),
    name: emptyToNull(formData.get('name')),
    publicMessage: emptyToNull(formData.get('publicMessage')),
  }));
}

export async function saveBeneficiaireStepAction(formData: FormData): Promise<void> {
  await saveStepAndAdvance('beneficiaire', 2, emptyToNull(formData.get('retour')), () => ({
    teamId: emptyToNull(formData.get('teamId')),
    clubId: emptyToNull(formData.get('clubId')),
    beneficiaryType: formData.get('beneficiaryType'),
    beneficiaryId: emptyToNull(formData.get('beneficiaryId')),
  }));
}

export async function saveObjectifDatesStepAction(formData: FormData): Promise<void> {
  await saveStepAndAdvance('objectif_dates', 3, emptyToNull(formData.get('retour')), () => {
    const startsAtRaw = emptyToNull(formData.get('startsAt'));
    const endsAtRaw = emptyToNull(formData.get('endsAt'));
    return {
      goalCents: emptyToNull(formData.get('goalCents')) !== null ? Number(formData.get('goalCents')) : null,
      startsAt: toIsoOrNull(startsAtRaw),
      endsAt: toIsoOrNull(endsAtRaw),
    };
  });
}

export async function saveParticipantsStepAction(formData: FormData): Promise<void> {
  await saveStepAndAdvance('participants', 4, emptyToNull(formData.get('retour')), () => ({
    participantAthleteIds: formData.getAll('participantAthleteIds').map(String),
  }));
}

export async function savePacksStepAction(formData: FormData): Promise<void> {
  await saveStepAndAdvance('packs', 5, emptyToNull(formData.get('retour')), () => ({
    productIds: formData.getAll('productIds').map(String),
  }));
}

/**
 * Étape finale : assemble l'entrée complète depuis le brouillon
 * (`buildCampaignInputFromDraft`, qui fixe TOUJOURS `creditRule: null` —
 * principe du Bloc B) et délègue à `createCampaign` (Tâche 1.7), exactement
 * comme l'ancien formulaire unique. Le brouillon est supprimé après succès
 * (`discardDraft`) : une campagne créée n'a plus besoin de son brouillon, et
 * cela libère l'unique brouillon par gestionnaire pour une prochaine
 * campagne.
 *
 * Redirection (Tâche 1.6.B3) : vers l'écran de démarrage dédié
 * (`/campagnes/[campaignId]/demarrage`), qui remplace l'ancien message
 * `?succes=` affiché sur cette même page (Tâche 1.7) — « activer puis montrer
 * les prochaines actions concrètes », pas seulement une bannière de succès.
 */
export async function createCampaignFromDraftAction(_formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const draftRepo = createSupabaseCampaignDraftRepo(supabase);

  let createdCampaignId: string;
  try {
    const draft = await draftRepo.getDraft(user.id);
    const rawInput = buildCampaignInputFromDraft(draft?.data ?? {});
    const result = await createCampaign(user, rawInput, createSupabaseCampaignRepo(supabase));
    await draftRepo.discardDraft(user.id);
    createdCampaignId = result.campaign.id;
  } catch (error) {
    redirectWithError(stepIndexFromStepId('recap'), error);
  }

  redirect(`/campagnes/${createdCampaignId}/demarrage`);
}

/**
 * Saisie en lot d'athlètes (Tâche 1.6.B2) : colle une liste, crée les
 * athlètes valides pour l'équipe déjà choisie à l'étape « Bénéficiaire »
 * (`data.teamId`), les ajoute automatiquement aux participants du brouillon,
 * puis revient à l'étape « Athlètes participants » avec un message
 * récapitulatif (créés / doublons ignorés / mineurs en attente de
 * consentement) — voir `lib/athletes/bulk-add.ts`.
 *
 * Utilise le paramètre `info` (et non `succes`, réservé au message de
 * création de campagne) pour ce message, afin de ne pas mélanger les deux
 * sémantiques dans la même page.
 */
export async function addAthletesBulkAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const draftRepo = createSupabaseCampaignDraftRepo(supabase);
  const athleteRepo = createSupabaseAthleteRepo(supabase);
  const existingAthleteRepo = createSupabaseExistingAthleteRepo(supabase);

  let infoMessage: string;
  try {
    const teamId = emptyToNull(formData.get('teamId'));
    if (teamId === null) {
      throw new BusinessRuleError(
        "Choisissez d'abord une équipe à l'étape « Bénéficiaire » avant d'ajouter des athlètes en lot.",
      );
    }
    const pastedList = String(formData.get('pastedList') ?? '');
    const existingAthletes = await existingAthleteRepo.listAthletesByTeam(teamId);
    const result = await bulkCreateAthletesFromPastedList(user, teamId, pastedList, existingAthletes, athleteRepo);

    const existingDraft = await draftRepo.getDraft(user.id);
    const mergedParticipantIds = [
      ...new Set([...(existingDraft?.data.participantAthleteIds ?? []), ...result.created.map((a) => a.id)]),
    ];
    const merged = mergeDraftData(existingDraft?.data ?? {}, { participantAthleteIds: mergedParticipantIds });
    await draftRepo.saveStep(user.id, 'participants', merged);

    const parts: string[] = [];
    if (result.created.length > 0) parts.push(`${result.created.length} athlète(s) ajouté(s)`);
    if (result.skippedDuplicates.length > 0) parts.push(`${result.skippedDuplicates.length} doublon(s) ignoré(s)`);
    if (result.unpublishableMinors.length > 0) {
      parts.push(`${result.unpublishableMinors.length} en attente de consentement parental (non publié(s) pour l'instant)`);
    }
    infoMessage = parts.length > 0 ? `${parts.join(', ')}.` : 'Aucun athlète valide trouvé dans la liste collée.';
  } catch (error) {
    redirectWithError(stepIndexFromStepId('participants'), error);
  }

  redirectToStep(stepIndexFromStepId('participants'), { info: infoMessage });
}

/** Permet à un gestionnaire de repartir de zéro sans attendre l'expiration
 * d'un quelconque TTL — supprime simplement la ligne `campaign_drafts` et
 * renvoie à l'étape 1. Aucune campagne n'existe encore à ce stade : rien
 * d'autre à nettoyer (cohérent avec "un brouillon n'est jamais public"). */
export async function discardDraftAction(_formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  await createSupabaseCampaignDraftRepo(supabase).discardDraft(user.id);
  redirect(`${NOUVELLE_CAMPAGNE_PATH}?etape=1`);
}
