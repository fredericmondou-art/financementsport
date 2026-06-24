'use server';

/**
 * Server Action « Modifier le profil » (Tâche 1.6.C1, docs/prompts/
 * phase-1-6.md) — un seul formulaire pour les champs de profil (message
 * personnel, photo, sport, ville) ET, pour qui en a le droit, les champs de
 * confidentialité (`hide_*`) et le consentement parental.
 *
 * Toute la validation et les permissions vivent dans `updateAthlete`
 * (lib/entities/athletes.ts) — cette action ne fait qu'extraire les champs
 * du `FormData` vers l'objet `AthleteUpdateInput` partiel attendu. Les
 * champs `hide_*`/`parentalConsentGiven` ne sont ajoutés au patch QUE s'ils
 * sont présents dans le formulaire : la page ne les rend que si
 * `canEditHiddenAthleteFields` est vrai pour l'utilisateur courant, donc leur
 * absence signifie « cette section n'a pas été affichée », jamais « remettre
 * à zéro ». Défense en profondeur : `updateAthlete` refuse de toute façon ces
 * champs à qui n'a pas le droit, même si on les envoyait quand même.
 *
 * Consentement parental : pour préserver la date ORIGINALE du consentement
 * (utile en cas de litige/revue légale, voir CLAUDE.md section 2 -- point
 * juridique signalé, pas tranché ici), la page renvoie la valeur actuelle
 * dans un champ caché `parentalConsentAtOriginal` ; si la case reste cochée,
 * on la réutilise telle quelle plutôt que de la rafraîchir à chaque
 * sauvegarde. Décocher la case efface le consentement (révocation, CLAUDE.md
 * section 5 -- respecter les demandes de suppression).
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { updateAthlete, createSupabaseAthleteRepo, type AthleteUpdateInput } from '@/lib/entities/athletes';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = value.toString().trim();
  return trimmed === '' ? null : trimmed;
}

function redirectWithError(athleteId: string, error: unknown): never {
  const message =
    error instanceof BusinessRuleError || error instanceof PermissionError || error instanceof NotFoundError
      ? error.message
      : 'Une erreur est survenue pendant la mise à jour du profil.';
  redirect(`/compte/athletes/${athleteId}?erreur=${encodeURIComponent(message)}`);
}

export async function updateAthleteProfileAction(formData: FormData): Promise<void> {
  const athleteIdRaw = formData.get('athleteId');
  if (typeof athleteIdRaw !== 'string' || athleteIdRaw === '') {
    redirect('/compte/athletes');
  }
  const athleteId = athleteIdRaw;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const patch: Partial<AthleteUpdateInput> = {
    personalMessage: emptyToNull(formData.get('personalMessage')),
    photoUrl: emptyToNull(formData.get('photoUrl')),
    sport: emptyToNull(formData.get('sport')),
    city: emptyToNull(formData.get('city')),
  };

  if (formData.get('hideLastName') !== null) {
    patch.hideLastName = formData.get('hideLastName') === 'true';
  }
  if (formData.get('hidePhoto') !== null) {
    patch.hidePhoto = formData.get('hidePhoto') === 'true';
  }
  if (formData.get('hideCity') !== null) {
    patch.hideCity = formData.get('hideCity') === 'true';
  }
  if (formData.get('hideAmounts') !== null) {
    patch.hideAmounts = formData.get('hideAmounts') === 'true';
  }
  if (formData.get('showTeamOnly') !== null) {
    patch.showTeamOnly = formData.get('showTeamOnly') === 'true';
  }
  const consentGivenRaw = formData.get('parentalConsentGiven');
  if (consentGivenRaw !== null) {
    patch.parentalConsentAt =
      consentGivenRaw === 'true'
        ? emptyToNull(formData.get('parentalConsentAtOriginal')) ?? new Date().toISOString()
        : null;
  }

  try {
    const supabase = createSupabaseServerClient();
    await updateAthlete(user, athleteId, patch, createSupabaseAthleteRepo(supabase));
  } catch (error) {
    redirectWithError(athleteId, error);
  }

  revalidatePath(`/compte/athletes/${athleteId}`);
  revalidatePath('/compte/athletes');
  redirect(`/compte/athletes/${athleteId}?avis=${encodeURIComponent('Profil mis à jour.')}`);
}
