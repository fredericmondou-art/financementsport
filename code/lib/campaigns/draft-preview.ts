/**
 * Construit la section "campagne" de l'aperçu fidèle (Tâche 1.6.B3, étape
 * « Récapitulatif ») à partir du seul brouillon -- AUCUNE dépendance I/O,
 * fonction pure et testable (CLAUDE.md section 6/8), au même titre que
 * `lib/public/campaign-progress.ts` qu'elle réutilise directement.
 *
 * À ce stade, la campagne n'existe pas encore en base (elle n'est créée
 * qu'à l'activation -- voir `createCampaignFromDraftAction`) : `raisedCents`
 * est donc toujours 0 par construction, jamais lu d'une vue quelconque. Le
 * `campaign` injecté dans `PublicCampaignSection` n'est pas une vraie ligne
 * `v_public_campaign` -- seuls les champs réellement lus par
 * `PublicProfileView` (`name`, `public_message`) ont une valeur garantie ;
 * `id`/`slug` restent des valeurs d'aperçu (`'apercu'`), jamais affichées et
 * jamais utilisées pour un lien réel.
 */
import { computeCampaignProgress, computeDaysRemaining, type PublicCampaignRow } from '@/lib/public/campaign-progress';
import type { PublicCampaignSection } from '@/lib/public/profile';
import type { CampaignDraftData } from './draft';

export function buildDraftPreviewCampaignSection(data: CampaignDraftData): PublicCampaignSection | null {
  if (!data.name || !data.beneficiaryType || !data.beneficiaryId) {
    return null;
  }

  const previewCampaign: PublicCampaignRow = {
    id: 'apercu',
    type: data.type ?? 'team',
    name: data.name,
    slug: 'apercu',
    public_message: data.publicMessage ?? null,
    beneficiary_type: data.beneficiaryType,
    beneficiary_id: data.beneficiaryId,
    goal_cents: data.goalCents ?? null,
    starts_at: data.startsAt ?? null,
    ends_at: data.endsAt ?? null,
  };

  return {
    campaign: previewCampaign,
    progress: computeCampaignProgress(0, data.goalCents ?? null),
    daysRemaining: data.endsAt ? computeDaysRemaining(data.endsAt) : null,
  };
}
