/**
 * Cycle de statut des versements (Tâche 1.5.10, docs/prompts/phase-1-5.md,
 * section 37) : `lib/payouts/workflow.ts` porte la logique de transition
 * AVANT toute écriture en base -- même patron que `lib/orders/status.ts`
 * (Tâche 1.5.5) / `lib/campaigns/close.ts` (Tâche 1.5.8).
 *
 * Le cahier ne décrit QUE le cycle principal `calculated → approved → paid`.
 * Le graphe complet ci-dessous (incluant `in_validation`/`adjusted`/
 * `disputed`/`closed`, les 4 autres statuts déjà définis dans le schéma --
 * migration 0001) a été conçu en autonomie -- voir docs/DECISIONS.md, Tâche
 * 1.5.10, pour la justification complète. Règle non négociable du cahier,
 * respectée par ce graphe : `paid` n'est atteignable QUE depuis `approved`
 * ou `adjusted` -- jamais automatiquement, jamais depuis `calculated`/
 * `in_validation` directement.
 *
 * MIROIR SQL : la fonction Postgres `public.advance_payout_status`
 * (migration 0019) réimplémente CE MÊME graphe en plpgsql et revalide TOUT
 * côté serveur (défense en profondeur, même compromis documenté que pour
 * 1.5.5/1.5.8 -- voir le commentaire de tête de cette migration).
 *
 * `platform_admin`/`accounting` seuls peuvent appeler cette transition --
 * RLS (`payouts_staff_write`, migration 0005) ne donne qu'un accès LECTURE
 * aux responsables de campagne/équipe (migration 0016) ; `advance_payout_
 * status` revérifie ce même scope côté serveur.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayoutsTable, PayoutStatus } from '@/lib/db/types';
import { logger } from '@/lib/logger/logger';

export type PayoutRow = PayoutsTable['Row'];

const PAYOUT_STATUS_LABELS_FR: Record<PayoutStatus, string> = {
  calculated: 'Calculé',
  in_validation: 'En validation',
  approved: 'Approuvé',
  paid: 'Payé',
  adjusted: 'Ajusté',
  disputed: 'Contesté',
  closed: 'Fermé',
};

/** Fonction PURE. */
export function payoutStatusLabelFr(status: PayoutStatus): string {
  return PAYOUT_STATUS_LABELS_FR[status];
}

/** MIROIR de la table de transitions plpgsql (migration 0019) -- toute
 * évolution de l'une doit être répercutée dans l'autre (commentaire laissé
 * aux deux endroits). */
export const VALID_PAYOUT_STATUS_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  calculated: ['in_validation', 'approved', 'disputed'],
  in_validation: ['approved', 'calculated', 'disputed'],
  approved: ['paid', 'disputed', 'adjusted'],
  paid: ['closed', 'disputed', 'adjusted'],
  adjusted: ['approved', 'paid', 'closed'],
  disputed: ['approved', 'adjusted', 'closed'],
  closed: [],
};

/** Statuts encore « ouverts » à un recalcul automatique du montant, AVANT
 * toute validation admin -- partagé avec `lib/payouts/calculate.ts` pour ne
 * jamais dupliquer cette liste. MIROIR du trigger `payouts_guard_amount_lock`
 * (migration 0019), qui bloque toute modification silencieuse de
 * `amount_cents`/`fee_held_cents` une fois un versement sorti de ces deux
 * statuts (sauf via la transition `adjusted`, qui change le statut en même
 * temps que le montant). */
export const PAYOUT_STATUSES_OPEN_FOR_RECALCULATION: ReadonlySet<PayoutStatus> = new Set([
  'calculated',
  'in_validation',
]);

/** Fonction PURE. */
export function isPayoutOpenForRecalculation(status: PayoutStatus): boolean {
  return PAYOUT_STATUSES_OPEN_FOR_RECALCULATION.has(status);
}

/** Fonction PURE. */
export function isValidPayoutStatusTransition(current: PayoutStatus, next: PayoutStatus): boolean {
  return VALID_PAYOUT_STATUS_TRANSITIONS[current].includes(next);
}

export class InvalidPayoutStatusTransitionError extends Error {
  constructor(
    public readonly currentStatus: PayoutStatus,
    public readonly attemptedStatus: PayoutStatus,
  ) {
    super(
      `Transition de statut de versement invalide : ${payoutStatusLabelFr(currentStatus)} vers ` +
        `${payoutStatusLabelFr(attemptedStatus)} n'est pas permis.`,
    );
    this.name = 'InvalidPayoutStatusTransitionError';
  }
}

/** Cahier (Tâche 1.5.10) : « ne jamais marquer payé automatiquement ... et
 * fournit une preuve ». Validé côté TypeScript avant tout aller-retour
 * réseau ; revalidé côté serveur par `advance_payout_status`. */
export class MissingPayoutProofError extends Error {
  constructor() {
    super('Une preuve de paiement (URL) est obligatoire pour marquer un versement payé.');
    this.name = 'MissingPayoutProofError';
  }
}

/** Cahier (section 37, « ajustement manuel ») : tout ajustement après
 * validation doit être tracé avec une raison ET un nouveau montant
 * explicite -- jamais un recalcul silencieux. */
export class MissingPayoutAdjustmentReasonError extends Error {
  constructor() {
    super('Une raison est obligatoire pour ajuster un versement.');
    this.name = 'MissingPayoutAdjustmentReasonError';
  }
}

export class MissingPayoutAdjustmentAmountError extends Error {
  constructor() {
    super('Un ajustement requiert un nouveau montant explicite (>= 0).');
    this.name = 'MissingPayoutAdjustmentAmountError';
  }
}

export interface AdvancePayoutStatusOptions {
  /** Preuve de paiement -- obligatoire (fournie ici OU déjà présente sur la
   * ligne) pour passer à `paid`. */
  proofUrl?: string;
  /** Raison de l'ajustement -- obligatoire pour `adjusted`, tracée dans
   * `payout_status_log.note`. Facultative (mais acceptée) pour les autres
   * transitions, comme simple commentaire libre. */
  note?: string;
  /** Nouveau montant -- obligatoire pour `adjusted`. */
  newAmountCents?: number;
  /** Nouvelle retenue de frais -- optionnelle, seulement appliquée pour
   * `adjusted`. */
  newFeeHeldCents?: number;
}

/** Lève l'erreur appropriée si la transition n'est pas permise -- sinon ne
 * fait rien. Fonction PURE, miroir CÔTÉ CLIENT de `advance_payout_status`
 * (migration 0019), qui revalide tout côté serveur (défense en profondeur,
 * même esprit que `lib/orders/status.ts`/`lib/campaigns/close.ts`). */
export function assertValidPayoutStatusTransition(
  currentStatus: PayoutStatus,
  nextStatus: PayoutStatus,
  options: AdvancePayoutStatusOptions,
  existingProofUrl: string | null,
): void {
  if (!isValidPayoutStatusTransition(currentStatus, nextStatus)) {
    throw new InvalidPayoutStatusTransitionError(currentStatus, nextStatus);
  }
  if (nextStatus === 'paid') {
    const proof = options.proofUrl ?? existingProofUrl;
    if (!proof || proof.trim() === '') {
      throw new MissingPayoutProofError();
    }
  }
  if (nextStatus === 'adjusted') {
    if (options.newAmountCents === undefined || options.newAmountCents === null || options.newAmountCents < 0) {
      throw new MissingPayoutAdjustmentAmountError();
    }
    if (!options.note || options.note.trim() === '') {
      throw new MissingPayoutAdjustmentReasonError();
    }
  }
}

/**
 * Erreur renvoyée par Postgres lorsque `advance_payout_status` refuse
 * l'appel -- faute d'autorisation, transition invalide, preuve/raison/montant
 * manquant. La fonction SQL revalide TOUT côté serveur ; on ne fait pas
 * confiance à la seule validation TypeScript faite avant l'appel (un client
 * pourrait appeler le RPC directement).
 */
export class PayoutWorkflowRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayoutWorkflowRpcError';
  }
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `OrderStatusRepo`/`CampaignClosureRepo`). */
export interface PayoutWorkflowRepo {
  /** Appelle la fonction Postgres gardée `advance_payout_status` (migration
   * 0019) : vérifie l'autorisation, la transition, la preuve et la raison
   * CÔTÉ SERVEUR, écrit le nouveau statut + `payout_status_log`, tout dans
   * une seule transaction atomique (un seul aller-retour réseau -- voir le
   * commentaire de tête de la migration sur pourquoi un trigger seul,
   * combiné à une variable de session, ne suffirait PAS ici). */
  advanceStatus(payoutId: string, nextStatus: PayoutStatus, options: AdvancePayoutStatusOptions): Promise<PayoutRow>;
}

export function createSupabasePayoutWorkflowRepo(supabase: SupabaseClient): PayoutWorkflowRepo {
  return {
    async advanceStatus(payoutId, nextStatus, options) {
      const { data, error } = await supabase.rpc('advance_payout_status', {
        p_payout_id: payoutId,
        p_new_status: nextStatus,
        p_proof_url: options.proofUrl ?? null,
        p_note: options.note ?? null,
        p_new_amount_cents: options.newAmountCents ?? null,
        p_new_fee_held_cents: options.newFeeHeldCents ?? null,
      });
      if (error) {
        logger.error('advance_payout_status refusé ou échoué', { payoutId, nextStatus, error: error.message });
        throw new PayoutWorkflowRpcError(error.message);
      }
      return data as PayoutRow;
    },
  };
}

/**
 * Fait avancer le statut d'un versement, en validant d'abord côté
 * TypeScript (message clair immédiat) puis en appelant la fonction Postgres
 * gardée -- qui revalide tout (défense en profondeur, voir
 * `PayoutWorkflowRpcError`).
 */
export async function advancePayoutStatus(
  repo: PayoutWorkflowRepo,
  currentStatus: PayoutStatus,
  existingProofUrl: string | null,
  payoutId: string,
  nextStatus: PayoutStatus,
  options: AdvancePayoutStatusOptions = {},
): Promise<PayoutRow> {
  assertValidPayoutStatusTransition(currentStatus, nextStatus, options, existingProofUrl);
  return repo.advanceStatus(payoutId, nextStatus, options);
}
