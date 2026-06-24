/**
 * Tâche 1.5.1 — résolution de la destination d'un code QR scanné.
 *
 * Logique PURE (injectable, testable sans DB — CLAUDE.md section 6) : étant
 * donné la ligne `qr_codes` (cible polymorphe `target_type`/`target_id`,
 * `redirect_url` optionnel) et un repo de lecture, retourne le CHEMIN public
 * vers lequel rediriger. L'incrémentation de `scan_count` elle-même est
 * atomique côté SQL (`resolve_and_count_qr_scan`, migration 0012) — cette
 * fonction ne fait que décider OÙ rediriger une fois la ligne déjà lue.
 *
 * Décisions autonomes (voir docs/DECISIONS.md, Tâche 1.5.1) :
 * - `target_type = 'product'` : aucune page produit individuelle n'existe
 *   dans ce projet (la boutique est une liste unique, `/boutique`, Tâche
 *   1.2) — on redirige donc systématiquement vers `/boutique` pour ce type.
 * - `target_type = 'campaign'` avec `status !== 'active'` (terminée,
 *   fermée, payée, archivée, annulée, ou encore brouillon/à venir) : on
 *   traite tout statut non `active` comme "campagne pas disponible
 *   publiquement" (le cahier ne nomme explicitement que
 *   ended/closed/cancelled, mais `draft`/`pending_approval`/`scheduled`
 *   n'ont pas non plus de page publique active, et `paid`/`archived`
 *   suivent toujours `closed` — même décision élargie, par cohérence).
 * - Code QR inconnu, cible introuvable, ou bénéficiaire non visible
 *   publiquement (mineur sans consentement, `v_public_athlete` ne le
 *   renvoie pas) : on retombe TOUJOURS sur `redirectUrl` (si défini) puis
 *   `/boutique` — jamais une page d'erreur : un QR imprimé doit toujours
 *   mener quelque part d'utile, même si la cible précise n'est plus
 *   disponible.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType } from '@/lib/db/types';
import {
  buildBeneficiaryPublicPath,
  createSupabaseBeneficiaryPreviewRepo,
  loadBeneficiaryPreviewIdentity,
} from '@/lib/public/preview';

export const QR_FALLBACK_PATH = '/boutique';

export interface QrCampaignInfo {
  status: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
}

/** Repo de lecture seule injectable — voir `createSupabaseQrResolveRepo` pour
 * l'implémentation réelle (vues publiques `v_public_*`, jamais les tables
 * brutes, CLAUDE.md section 5). */
export interface QrResolveRepo {
  getCampaign(campaignId: string): Promise<QrCampaignInfo | null>;
  /** `null` si le bénéficiaire n'existe pas OU n'est pas visible publiquement
   * (ex. athlète mineur sans consentement parental — `v_public_athlete` ne le
   * renvoie alors pas, CLAUDE.md section 5). */
  getBeneficiaryPublicPath(beneficiaryType: BeneficiaryType, beneficiaryId: string): Promise<string | null>;
}

export interface QrScanTarget {
  targetType: string;
  targetId: string | null;
  redirectUrl: string | null;
  /** ISO 8601, ou `null` si le code n'expire jamais. */
  expiresAt: string | null;
}

const BENEFICIARY_TARGET_TYPES: ReadonlySet<string> = new Set(['athlete', 'team', 'club']);

function isBeneficiaryType(value: string): value is BeneficiaryType {
  return BENEFICIARY_TARGET_TYPES.has(value);
}

/**
 * Résout le chemin de redirection pour une ligne `qr_codes` déjà lue.
 * Ne lève jamais d'exception pour une cible manquante/invalide — retombe sur
 * `redirectUrl` puis `QR_FALLBACK_PATH` (voir décisions ci-dessus).
 */
export async function resolveQrScanPath(target: QrScanTarget, repo: QrResolveRepo): Promise<string> {
  const fallback = target.redirectUrl ?? QR_FALLBACK_PATH;

  if (target.expiresAt && new Date(target.expiresAt).getTime() < Date.now()) {
    return fallback;
  }

  if (target.targetType === 'product') {
    return fallback;
  }

  if (target.targetType === 'campaign') {
    if (!target.targetId) {
      return fallback;
    }
    const campaign = await repo.getCampaign(target.targetId);
    if (!campaign || campaign.status !== 'active') {
      return fallback;
    }
    const path = await repo.getBeneficiaryPublicPath(campaign.beneficiaryType, campaign.beneficiaryId);
    return path ?? fallback;
  }

  if (isBeneficiaryType(target.targetType) && target.targetId) {
    const path = await repo.getBeneficiaryPublicPath(target.targetType, target.targetId);
    return path ?? fallback;
  }

  return fallback;
}

interface CampaignStatusRow {
  status: string;
  beneficiary_type: BeneficiaryType;
  beneficiary_id: string;
}

/**
 * Implémentation réelle de `QrResolveRepo`. Réutilise EXACTEMENT
 * `loadBeneficiaryPreviewIdentity`/`buildBeneficiaryPublicPath`
 * (lib/public/preview.ts, Tâche 1.6.B3) — mêmes vues `v_public_*`, donc même
 * respect des `hide_*`/consentement mineur, sans dupliquer cette logique.
 * `supabase` doit être le client SERVICE_ROLE ici (résolution publique d'un
 * scan, jamais via `anon` — voir commentaire RLS de la migration 0003,
 * section 11, et `app/api/qr/[code]/route.ts`).
 */
export function createSupabaseQrResolveRepo(supabase: SupabaseClient): QrResolveRepo {
  const previewRepo = createSupabaseBeneficiaryPreviewRepo(supabase);
  return {
    async getCampaign(campaignId) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('status, beneficiary_type, beneficiary_id')
        .eq('id', campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as CampaignStatusRow;
      return { status: row.status, beneficiaryType: row.beneficiary_type, beneficiaryId: row.beneficiary_id };
    },
    async getBeneficiaryPublicPath(beneficiaryType, beneficiaryId) {
      const identity = await loadBeneficiaryPreviewIdentity(beneficiaryType, beneficiaryId, previewRepo);
      if (!identity) return null;
      return buildBeneficiaryPublicPath(beneficiaryType, identity.slug);
    },
  };
}
