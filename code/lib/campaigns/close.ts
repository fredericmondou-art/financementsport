/**
 * Clôture / réouverture de campagne (Tâche 1.5.8, docs/prompts/phase-1-5.md) :
 * `lib/campaigns/close.ts` porte la logique de transition AVANT toute
 * écriture en base, même patron que `lib/orders/status.ts` (Tâche 1.5.5).
 *
 * Contrairement aux statuts de commande (une vraie machine à 11 états), la
 * clôture ne gouverne que DEUX transitions précises, dans les deux sens :
 *   - `active` → `closed` (clôture, accessible au responsable de la
 *     campagne OU à un admin) ;
 *   - `closed` → `active` (réouverture, RÉSERVÉE à `platform_admin`, avec
 *     une raison obligatoire — exigence du cahier : « action réversible
 *     uniquement par un admin »).
 * Les 7 autres statuts (`draft`, `pending_approval`, `scheduled`, `ended`,
 * `paid`, `cancelled`, `archived`) ne sont PAS touchés par ce module —
 * aucune fonction ici ne prétend gérer le cycle de vie complet d'une
 * campagne, seulement cette paire de transitions.
 *
 * MIROIR SQL : les fonctions Postgres `public.close_campaign`/
 * `public.reopen_campaign` (migration 0017) réimplémentent ces mêmes règles
 * en plpgsql et revalident TOUT côté serveur — voir le commentaire de tête
 * de cette migration sur la duplication TS/SQL (même compromis documenté
 * que pour 1.5.5, voir docs/DECISIONS.md, Tâche 1.5.8).
 *
 * `platform_admin` garde par ailleurs son accès direct en écriture sur
 * `campaigns` via les policies RLS déjà existantes (corrections diverses) —
 * ce module ne gouverne que le chemin normal de clôture/réouverture.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampaignsTable, CampaignStatus } from '@/lib/db/types';
import { logger } from '@/lib/logger/logger';

export type CampaignRow = CampaignsTable['Row'];

const CAMPAIGN_STATUS_LABELS_FR: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  pending_approval: 'En attente d’approbation',
  scheduled: 'Planifiée',
  active: 'Active',
  ended: 'Terminée',
  closed: 'Clôturée',
  paid: 'Versée',
  cancelled: 'Annulée',
  archived: 'Archivée',
};

/** Fonction PURE. */
export function campaignStatusLabelFr(status: CampaignStatus): string {
  return CAMPAIGN_STATUS_LABELS_FR[status];
}

/** Fonction PURE. Seule une campagne `active` peut être clôturée. */
export function isValidCampaignClosure(currentStatus: CampaignStatus): boolean {
  return currentStatus === 'active';
}

/** Fonction PURE. Seule une campagne `closed` peut être rouverte. */
export function isValidCampaignReopening(currentStatus: CampaignStatus): boolean {
  return currentStatus === 'closed';
}

export class InvalidCampaignClosureError extends Error {
  constructor(public readonly currentStatus: CampaignStatus) {
    super(
      `Seule une campagne active peut être clôturée (statut actuel : ` +
        `« ${campaignStatusLabelFr(currentStatus)} »).`,
    );
    this.name = 'InvalidCampaignClosureError';
  }
}

export class InvalidCampaignReopeningError extends Error {
  constructor(public readonly currentStatus: CampaignStatus) {
    super(
      `Seule une campagne clôturée peut être rouverte (statut actuel : ` +
        `« ${campaignStatusLabelFr(currentStatus)} »).`,
    );
    this.name = 'InvalidCampaignReopeningError';
  }
}

/** Cahier (Tâche 1.5.8) : la réouverture exige une raison tracée. Validé
 * côté TypeScript avant tout aller-retour réseau ; revalidé côté serveur par
 * `reopen_campaign` (défense en profondeur, même esprit que le reste du
 * module). */
export class MissingReopenReasonError extends Error {
  constructor() {
    super('La raison de la réouverture est obligatoire.');
    this.name = 'MissingReopenReasonError';
  }
}

/** Lève l'erreur appropriée si la clôture n'est pas permise — sinon ne fait
 * rien. Fonction PURE, à appeler avant toute écriture. */
export function assertValidCampaignClosure(currentStatus: CampaignStatus): void {
  if (!isValidCampaignClosure(currentStatus)) {
    throw new InvalidCampaignClosureError(currentStatus);
  }
}

/** Lève l'erreur appropriée si la réouverture n'est pas permise (statut
 * invalide OU raison manquante/vide) — sinon ne fait rien. Fonction PURE. */
export function assertValidCampaignReopening(currentStatus: CampaignStatus, reason: string): void {
  if (!isValidCampaignReopening(currentStatus)) {
    throw new InvalidCampaignReopeningError(currentStatus);
  }
  if (reason.trim() === '') {
    throw new MissingReopenReasonError();
  }
}

/**
 * Erreur renvoyée par Postgres lorsque `close_campaign`/`reopen_campaign`
 * refuse l'appel — faute d'autorisation, transition invalide, raison
 * manquante, ou commande(s) en attente de paiement (clôture). La fonction
 * SQL revalide TOUT côté serveur ; on ne fait pas confiance à la seule
 * validation TypeScript faite avant l'appel (un client pourrait appeler le
 * RPC directement).
 */
export class CampaignClosureRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignClosureRpcError';
  }
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `OrderStatusRepo`, Tâche 1.5.5). */
export interface CampaignClosureRepo {
  /** Appelle la fonction Postgres gardée `close_campaign` (migration 0017) :
   * vérifie l'autorisation, le statut courant et l'absence de commande en
   * attente de paiement CÔTÉ SERVEUR, écrit `closed`/`closed_at` +
   * `campaign_status_log`, tout dans une seule transaction. */
  closeCampaign(campaignId: string): Promise<CampaignRow>;
  /** Appelle la fonction Postgres gardée `reopen_campaign` (migration 0017) :
   * réservée platform_admin, raison obligatoire, écrit `active`/
   * `closed_at = NULL` + `campaign_status_log`, tout dans une seule
   * transaction. */
  reopenCampaign(campaignId: string, reason: string): Promise<CampaignRow>;
}

export function createSupabaseCampaignClosureRepo(supabase: SupabaseClient): CampaignClosureRepo {
  return {
    async closeCampaign(campaignId) {
      const { data, error } = await supabase.rpc('close_campaign', { p_campaign_id: campaignId });
      if (error) {
        logger.error('close_campaign refusé ou échoué', { campaignId, error: error.message });
        throw new CampaignClosureRpcError(error.message);
      }
      return data as CampaignRow;
    },
    async reopenCampaign(campaignId, reason) {
      const { data, error } = await supabase.rpc('reopen_campaign', {
        p_campaign_id: campaignId,
        p_reason: reason,
      });
      if (error) {
        logger.error('reopen_campaign refusé ou échoué', { campaignId, error: error.message });
        throw new CampaignClosureRpcError(error.message);
      }
      return data as CampaignRow;
    },
  };
}

/**
 * Clôture une campagne, en validant d'abord côté TypeScript (message clair
 * immédiat) puis en appelant la fonction Postgres gardée — qui revalide tout
 * (défense en profondeur, voir `CampaignClosureRpcError`).
 */
export async function closeCampaign(
  repo: CampaignClosureRepo,
  currentStatus: CampaignStatus,
  campaignId: string,
): Promise<CampaignRow> {
  assertValidCampaignClosure(currentStatus);
  return repo.closeCampaign(campaignId);
}

/**
 * Rouvre une campagne clôturée. `reason` est obligatoire (tracé dans
 * `campaign_status_log`) — exigence du cahier, pas une simple convention
 * d'UI : la fonction SQL refuse aussi une raison vide.
 */
export async function reopenCampaign(
  repo: CampaignClosureRepo,
  currentStatus: CampaignStatus,
  campaignId: string,
  reason: string,
): Promise<CampaignRow> {
  assertValidCampaignReopening(currentStatus, reason);
  return repo.reopenCampaign(campaignId, reason);
}
