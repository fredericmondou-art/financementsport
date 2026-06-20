/**
 * Server Action de l'assistant de création de campagne (Tâche 1.7). Même
 * style que `app/(shop)/panier/actions.ts` : formulaire natif, pas de
 * "use client", "reshape" du FormData puis délégation complète à
 * `lib/campaigns/create-campaign.ts` (CLAUDE.md section 6).
 */
'use server';

import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createCampaign, createSupabaseCampaignRepo } from '@/lib/campaigns/create-campaign';
import { BusinessRuleError, NotFoundError, PermissionError } from '@/lib/entities/errors';

const NOUVELLE_CAMPAGNE_PATH = '/campagnes/nouvelle';

function redirectWithError(error: unknown): never {
  const message =
    error instanceof ZodError
      ? error.issues[0]?.message ?? 'Entrée invalide.'
      : error instanceof BusinessRuleError ||
          error instanceof PermissionError ||
          error instanceof NotFoundError
        ? error.message
        : 'Une erreur est survenue.';
  redirect(`${NOUVELLE_CAMPAGNE_PATH}?erreur=${encodeURIComponent(message)}`);
}

/** `''` → `undefined`/`null` : les champs optionnels du formulaire (montant
 * objectif, date de fin, message public, règle de crédit) arrivent vides
 * plutôt qu'absents — on les normalise ici avant de passer la main à
 * `campaignInputSchema`, qui ne doit traiter QUE de la validation métier. */
function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function toIsoOrNull(localDateTime: string | null): string | null {
  if (localDateTime === null) return null;
  // <input type="datetime-local"> n'inclut pas de fuseau ; on l'interprète
  // dans le fuseau du serveur (Québec, CLAUDE.md section 2) en laissant le
  // constructeur Date le résoudre, puis on sérialise en ISO (UTC) — cohérent
  // avec `timestamptz` en base.
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessRuleError('Date invalide.');
  }
  return date.toISOString();
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  // `redirect()` lève une exception spéciale (digest NEXT_REDIRECT) qui DOIT
  // remonter sans être interceptée : on garde donc cette vérification HORS du
  // try/catch ci-dessous (même piège que pour `redirectWithError`, qui n'est
  // lui-même jamais appelé depuis l'intérieur d'un autre try).
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  let createdSlug: string;
  try {
    const startsAtRaw = emptyToNull(formData.get('startsAt'));
    const endsAtRaw = emptyToNull(formData.get('endsAt'));

    const percentBpsRaw = emptyToNull(formData.get('creditPercentBps'));
    const flatCentsRaw = emptyToNull(formData.get('creditFlatCents'));
    const minBasketCentsRaw = emptyToNull(formData.get('creditMinBasketCents'));
    const bonusPercentBpsRaw = emptyToNull(formData.get('creditBonusPercentBps'));
    const hasCreditRule = [percentBpsRaw, flatCentsRaw].some((v) => v !== null);

    const input = {
      type: formData.get('type'),
      name: emptyToNull(formData.get('name')),
      publicMessage: emptyToNull(formData.get('publicMessage')),
      beneficiaryType: formData.get('beneficiaryType'),
      beneficiaryId: emptyToNull(formData.get('beneficiaryId')),
      clubId: emptyToNull(formData.get('clubId')),
      teamId: emptyToNull(formData.get('teamId')),
      goalCents: emptyToNull(formData.get('goalCents')) !== null ? Number(formData.get('goalCents')) : null,
      startsAt: toIsoOrNull(startsAtRaw),
      endsAt: toIsoOrNull(endsAtRaw),
      participantAthleteIds: formData.getAll('participantAthleteIds').map(String),
      productIds: formData.getAll('productIds').map(String),
      creditRule: hasCreditRule
        ? {
            percentBps: percentBpsRaw !== null ? Number(percentBpsRaw) : null,
            flatCents: flatCentsRaw !== null ? Number(flatCentsRaw) : null,
            minBasketCents: minBasketCentsRaw !== null ? Number(minBasketCentsRaw) : null,
            bonusPercentBps: bonusPercentBpsRaw !== null ? Number(bonusPercentBpsRaw) : null,
          }
        : null,
    };

    const supabase = createSupabaseServerClient();
    const result = await createCampaign(user, input, createSupabaseCampaignRepo(supabase));
    createdSlug = result.campaign.slug;
  } catch (error) {
    redirectWithError(error);
  }

  redirect(`${NOUVELLE_CAMPAGNE_PATH}?succes=${encodeURIComponent(createdSlug)}`);
}
