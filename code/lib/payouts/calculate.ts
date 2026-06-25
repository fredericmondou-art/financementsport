/**
 * Calcul des montants dus aux bénéficiaires (Tâche 1.5.10, docs/prompts/
 * phase-1-5.md, section 37) : `lib/payouts/calculate.ts` porte le calcul PUR
 * (crédits → montants) et la logique d'upsert idempotente, AVANT toute
 * écriture en base -- même patron que `lib/reports/campaign.ts`/
 * `lib/dashboards/admin.ts` (fonctions pures testées sans base réelle, un
 * repo injecté pour l'I/O).
 *
 * Règle du cahier (Tâche 1.5.10) : « Montant dû = somme des order_credits en
 * statut `active` du bénéficiaire pour la campagne, moins fee_held_cents si
 * retenue. » Décision autonome sur le sens exact de cette soustraction (voir
 * docs/DECISIONS.md, Tâche 1.5.10) : `payouts.amount_cents` reste la somme
 * BRUTE des crédits actifs -- cohérent avec le commentaire SQL d'origine de
 * la colonne (migration 0001 : « somme des crédits actifs ») ET avec
 * `summarizeCreditsDue` (lib/dashboards/admin.ts, Tâche 1.5.7), qui soustrait
 * les versements PAYÉS de ce même montant BRUT pour calculer les « crédits
 * dus » du dashboard admin -- changer ce sens aurait cassé cette cohérence
 * explicitement exigée par le critère d'acceptation de CETTE tâche
 * (« le crédits dus du dashboard admin baisse quand un payout passe paid »).
 * `fee_held_cents` est donc une retenue SÉPARÉE, tracée à part : le montant
 * NET effectivement à verser au bénéficiaire est `amount_cents -
 * fee_held_cents`, calculé à l'affichage (`computeNetPayableCents`), jamais
 * stocké comme un troisième nombre.
 *
 * Aucune table/colonne de taux de frais n'existe en V1 (vérifié -- aucune
 * "fee_bps"/"platform_fee" nulle part dans le schéma) : la retenue calculée
 * automatiquement ici est donc TOUJOURS 0. Une retenue non nulle ne peut être
 * posée que par un admin, explicitement, via la transition `adjusted`
 * (`lib/payouts/workflow.ts`) -- jamais inventée à partir d'un pourcentage.
 *
 * Crédits `pending` : exclus du calcul (cahier : « ne pas les verser tant
 * qu'ils ne sont pas actifs ») -- même filtre strict que `summarizeCreditsDue`
 * (Tâche 1.5.7).
 *
 * Idempotence (cahier : « recalculer ne crée pas de doublon de payout pour la
 * même campagne/bénéficiaire ») : pour chaque bénéficiaire (qu'il ait ou non
 * un versement existant) --
 *   - aucun versement existant + montant dû > 0 → INSERT ;
 *   - un versement existant ENCORE OUVERT au recalcul (`calculated`/
 *     `in_validation`, voir `isPayoutOpenForRecalculation`) → UPDATE de
 *     `amount_cents` (y compris vers 0 si les crédits ont été annulés depuis
 *     le dernier calcul -- sinon le montant resterait figé sur une valeur
 *     périmée) ;
 *   - un versement existant déjà validé/payé/fermé → IGNORÉ : corriger un
 *     montant déjà validé passe exclusivement par la transition `adjusted`
 *     (raison obligatoire, trace d'audit), jamais par un recalcul silencieux
 *     -- même verrou que le trigger `payouts_guard_amount_lock` (migration
 *     0019), appliqué ICI ET en base (défense en profondeur).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType, CampaignsTable, OrderCreditsTable, PayoutsTable } from '@/lib/db/types';
import { isPayoutOpenForRecalculation } from '@/lib/payouts/workflow';
import { logger } from '@/lib/logger/logger';

export type OrderCreditRow = OrderCreditsTable['Row'];
export type PayoutRow = PayoutsTable['Row'];
export type CampaignRow = CampaignsTable['Row'];

function beneficiaryKey(beneficiaryType: BeneficiaryType, beneficiaryId: string): string {
  return `${beneficiaryType}:${beneficiaryId}`;
}

export interface BeneficiaryDueAmount {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  /** Somme BRUTE des `order_credits` actifs de ce bénéficiaire, pour cette
   * campagne (voir le commentaire de tête). */
  dueCents: number;
}

/** Fonction PURE. Filtre `campaign_id` ET `status === 'active'` -- les
 * crédits `pending`/`expired`/`cancelled`/`refunded` ne comptent jamais. */
export function computeActiveCreditsDueByBeneficiary(
  credits: Array<Pick<OrderCreditRow, 'campaign_id' | 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>>,
  campaignId: string,
): BeneficiaryDueAmount[] {
  const totals = new Map<string, BeneficiaryDueAmount>();
  for (const credit of credits) {
    if (credit.campaign_id !== campaignId) continue;
    if (credit.status !== 'active') continue;
    const key = beneficiaryKey(credit.beneficiary_type, credit.beneficiary_id);
    const existing = totals.get(key) ?? {
      beneficiaryType: credit.beneficiary_type,
      beneficiaryId: credit.beneficiary_id,
      dueCents: 0,
    };
    existing.dueCents += credit.amount_cents;
    totals.set(key, existing);
  }
  return [...totals.values()];
}

/** Montant NET réellement à verser -- jamais négatif (CLAUDE.md section 4),
 * jamais stocké : toujours recalculé à l'affichage depuis les deux colonnes
 * persistées (`amount_cents`, `fee_held_cents`). Fonction PURE. */
export function computeNetPayableCents(payout: Pick<PayoutRow, 'amount_cents' | 'fee_held_cents'>): number {
  return Math.max(0, payout.amount_cents - payout.fee_held_cents);
}

export type PayoutRecalcAction =
  | { type: 'insert'; beneficiaryType: BeneficiaryType; beneficiaryId: string; amountCents: number }
  | {
      type: 'update';
      payoutId: string;
      beneficiaryType: BeneficiaryType;
      beneficiaryId: string;
      amountCents: number;
      previousAmountCents: number;
    }
  | {
      type: 'skip_locked';
      payoutId: string;
      beneficiaryType: BeneficiaryType;
      beneficiaryId: string;
      status: PayoutRow['status'];
      computedAmountCents: number;
    };

/**
 * Fonction PURE : compare les montants dus calculés aux versements déjà
 * existants pour la campagne, et décide l'action à appliquer pour CHAQUE
 * bénéficiaire concerné -- qu'il ait des crédits actifs, un versement
 * existant, ou les deux (union des deux ensembles, pas juste l'un ou
 * l'autre, pour pouvoir ramener à 0 un versement encore ouvert dont les
 * crédits actifs ont disparu depuis le dernier calcul). Ne touche jamais
 * `fee_held_cents` (retenue gérée exclusivement par `adjusted`, voir
 * commentaire de tête du fichier).
 */
export function planPayoutRecalculation(
  dueAmounts: BeneficiaryDueAmount[],
  existingPayouts: Array<Pick<PayoutRow, 'id' | 'beneficiary_type' | 'beneficiary_id' | 'amount_cents' | 'status'>>,
): PayoutRecalcAction[] {
  const dueByKey = new Map(dueAmounts.map((due) => [beneficiaryKey(due.beneficiaryType, due.beneficiaryId), due]));
  const existingByKey = new Map(
    existingPayouts.map((payout) => [beneficiaryKey(payout.beneficiary_type, payout.beneficiary_id), payout]),
  );
  const allKeys = new Set<string>([...dueByKey.keys(), ...existingByKey.keys()]);

  const actions: PayoutRecalcAction[] = [];
  for (const key of allKeys) {
    const due = dueByKey.get(key);
    const existing = existingByKey.get(key);
    const computedAmountCents = due?.dueCents ?? 0;
    const beneficiaryType = due?.beneficiaryType ?? (existing!.beneficiary_type as BeneficiaryType);
    const beneficiaryId = due?.beneficiaryId ?? existing!.beneficiary_id;

    if (!existing) {
      actions.push({ type: 'insert', beneficiaryType, beneficiaryId, amountCents: computedAmountCents });
      continue;
    }

    if (!isPayoutOpenForRecalculation(existing.status)) {
      actions.push({
        type: 'skip_locked',
        payoutId: existing.id,
        beneficiaryType,
        beneficiaryId,
        status: existing.status,
        computedAmountCents,
      });
      continue;
    }

    actions.push({
      type: 'update',
      payoutId: existing.id,
      beneficiaryType,
      beneficiaryId,
      amountCents: computedAmountCents,
      previousAmountCents: existing.amount_cents,
    });
  }
  return actions;
}

/** Accès aux données, injecté pour permettre des tests sans base réelle
 * (même patron que `AdminDashboardRepo`/`CampaignReportRepo`). Les écritures
 * passent par des appels Supabase ORDINAIRES (pas de RPC) : RLS
 * (`payouts_staff_write`, migration 0005) restreint déjà l'INSERT/UPDATE de
 * `payouts` à `platform_admin`/`accounting` -- voir le commentaire de tête
 * de la migration 0019 sur cette différence avec `orders`. */
export interface PayoutCalculationRepo {
  getCampaign(campaignId: string): Promise<CampaignRow | null>;
  listActiveCreditsForCampaign(campaignId: string): Promise<OrderCreditRow[]>;
  listPayoutsForCampaign(campaignId: string): Promise<PayoutRow[]>;
  insertPayout(
    campaignId: string,
    beneficiaryType: BeneficiaryType,
    beneficiaryId: string,
    amountCents: number,
  ): Promise<PayoutRow>;
  updatePayoutAmount(payoutId: string, amountCents: number): Promise<PayoutRow>;
}

export function createSupabasePayoutCalculationRepo(supabase: SupabaseClient): PayoutCalculationRepo {
  return {
    async getCampaign(campaignId) {
      const { data, error } = await supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle();
      if (error) throw error;
      return (data as CampaignRow | null) ?? null;
    },
    async listActiveCreditsForCampaign(campaignId) {
      const { data, error } = await supabase
        .from('order_credits')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'active');
      if (error) throw error;
      return (data as OrderCreditRow[]) ?? [];
    },
    async listPayoutsForCampaign(campaignId) {
      const { data, error } = await supabase.from('payouts').select('*').eq('campaign_id', campaignId);
      if (error) throw error;
      return (data as PayoutRow[]) ?? [];
    },
    async insertPayout(campaignId, beneficiaryType, beneficiaryId, amountCents) {
      const { data, error } = await supabase
        .from('payouts')
        .insert({
          campaign_id: campaignId,
          beneficiary_type: beneficiaryType,
          beneficiary_id: beneficiaryId,
          amount_cents: amountCents,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as PayoutRow;
    },
    async updatePayoutAmount(payoutId, amountCents) {
      const { data, error } = await supabase
        .from('payouts')
        .update({ amount_cents: amountCents })
        .eq('id', payoutId)
        .select('*')
        .single();
      if (error) throw error;
      return data as PayoutRow;
    },
  };
}

export class CampaignNotClosedError extends Error {
  constructor() {
    super("Le calcul des versements n'est disponible qu'après la clôture de la campagne.");
    this.name = 'CampaignNotClosedError';
  }
}

export class CampaignNotFoundError extends Error {
  constructor() {
    super('Campagne introuvable.');
    this.name = 'CampaignNotFoundError';
  }
}

/** Statuts de campagne pour lesquels le calcul des versements est autorisé.
 * Décision autonome (voir docs/DECISIONS.md, Tâche 1.5.10) : le cahier dit
 * explicitement « calculer le montant dû à chaque bénéficiaire à LA
 * CLÔTURE », pas avant -- `closed` (migration 0017) est donc le statut
 * normal d'entrée. `paid` (étape suivante du cycle de vie de la campagne,
 * migration 0001) reste autorisé pour permettre un recalcul de contrôle
 * après coup, sans pour autant ouvrir le calcul aux campagnes encore
 * `active` (crédits potentiellement encore mouvants -- verser avant la
 * clôture risquerait de sous-verser puis nécessiter des `adjusted` en
 * cascade). */
const CAMPAIGN_STATUSES_ELIGIBLE_FOR_PAYOUT_CALCULATION = new Set(['closed', 'paid']);

/**
 * Recalcule et applique (via le repo) les versements dus pour TOUS les
 * bénéficiaires d'une campagne CLÔTURÉE.
 */
export async function recalculatePayoutsForCampaign(
  repo: PayoutCalculationRepo,
  campaignId: string,
): Promise<PayoutRecalcAction[]> {
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) {
    throw new CampaignNotFoundError();
  }
  if (!CAMPAIGN_STATUSES_ELIGIBLE_FOR_PAYOUT_CALCULATION.has(campaign.status)) {
    throw new CampaignNotClosedError();
  }

  const [credits, existingPayouts] = await Promise.all([
    repo.listActiveCreditsForCampaign(campaignId),
    repo.listPayoutsForCampaign(campaignId),
  ]);

  const dueAmounts = computeActiveCreditsDueByBeneficiary(credits, campaignId);
  const plan = planPayoutRecalculation(dueAmounts, existingPayouts);

  for (const action of plan) {
    if (action.type === 'insert') {
      await repo.insertPayout(campaignId, action.beneficiaryType, action.beneficiaryId, action.amountCents);
    } else if (action.type === 'update') {
      if (action.amountCents !== action.previousAmountCents) {
        await repo.updatePayoutAmount(action.payoutId, action.amountCents);
      }
    } else {
      logger.warn('Recalcul de versement ignoré : statut déjà validé', {
        payoutId: action.payoutId,
        status: action.status,
        computedAmountCents: action.computedAmountCents,
      });
    }
  }

  return plan;
}
