'use server';

/**
 * Server Action « Poser une dérogation » (P.7, SPEC-PARAMETRES-PLATEFORME.md
 * §6, tâche « interface admin minimale »). Même patron que
 * `app/(admin)/produits/nouveau/actions.ts` : extraction du `FormData`,
 * toute la validation/permission déléguée à `createDerogation` (lib/
 * derogations/derogations.ts) -- CLAUDE.md section 6, logique métier dans
 * `lib/`, pas dans les routes.
 *
 * `redirect()` reste TOUJOURS hors du try/catch -- même raison que les
 * autres Server Actions du projet (une redirection interrompt via une
 * exception interne `NEXT_REDIRECT` que le `catch` ci-dessous avalerait
 * sinon).
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createDerogation, createSupabaseDerogationsRepo } from '@/lib/derogations/derogations';
import { BusinessRuleError, PermissionError } from '@/lib/entities/errors';

function emptyToUndefined(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

function redirectWithError(message: string): never {
  redirect(`/derogations?erreur=${encodeURIComponent(message)}`);
}

export async function createDerogationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const rawInput = {
    cleParametre: emptyToUndefined(formData.get('cleParametre')) ?? '',
    entiteType: emptyToUndefined(formData.get('entiteType')) ?? '',
    entiteId: emptyToUndefined(formData.get('entiteId')) ?? '',
    valeurAppliquee: Number(emptyToUndefined(formData.get('valeurAppliquee')) ?? 'NaN'),
    justification: emptyToUndefined(formData.get('justification')) ?? '',
  };

  try {
    const supabase = createSupabaseServerClient();
    const repo = createSupabaseDerogationsRepo(supabase);
    await createDerogation(user, rawInput, repo);
  } catch (error) {
    if (error instanceof PermissionError || error instanceof BusinessRuleError) {
      redirectWithError(error.message);
    }
    if (error instanceof ZodError) {
      redirectWithError(error.issues[0]?.message ?? 'Données invalides.');
    }
    redirectWithError('Une erreur est survenue pendant l’enregistrement de la dérogation.');
  }

  // Aucune page publique/portail ne lit `derogations_parametres` directement
  // (elle passe toujours par la limite déjà en cache de `lib/parametres.ts`
  // ou par une lecture directe côté serveur au moment de la validation) --
  // rien à revalider ici en dehors de cet écran admin lui-même.
  revalidatePath('/derogations');
  redirect(`/derogations?avis=${encodeURIComponent('Dérogation enregistrée.')}`);
}
