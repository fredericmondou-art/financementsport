/**
 * Assemble la sortie du moteur de crédit (lib/credits/calculate.ts) en lignes
 * prêtes à être écrites dans `order_credits` (Tâche 1.5). Fonction PURE :
 * aucune écriture DB ici -- l'écriture atomique se fait dans
 * lib/orders/create-order.ts, via la fonction Postgres `create_paid_order`
 * (migration 0006). Décide aussi le statut de chaque crédit ('active' vs
 * 'pending') : logique métier explicitement visée par CLAUDE.md section 8
 * ("transitions de statut"), donc testée ici en Vitest plutôt que cachée
 * dans une fonction plpgsql non testable.
 */
import type { BeneficiaryCreditResult, LineCreditResult } from './calculate';
import type { CreditStatus } from '@/lib/db/types';

export interface OrderCreditInsertPayload {
  beneficiary_type: BeneficiaryCreditResult['beneficiaryType'];
  beneficiary_id: string;
  campaign_id: string | null;
  amount_cents: number;
  status: CreditStatus;
  applied_rule_id: string | null;
  computation_note: string;
}

/**
 * Cahier (Tâche 1.5) : « crédits en `active` (ou `pending` si campagne pas
 * encore active) ». Sans campagne de contexte (achat boutique permanent,
 * `campaignId === null`), rien ne conditionne le crédit : il est actif dès
 * que le paiement est confirmé.
 */
export function decideCreditStatus(campaignId: string | null, isCampaignActive: boolean): CreditStatus {
  if (campaignId === null) {
    return 'active';
  }
  return isCampaignActive ? 'active' : 'pending';
}

/**
 * Résume la traçabilité du calcul (`applied_rule_id` / `computation_note`)
 * pour UN bénéficiaire à partir des crédits par LIGNE de la commande. Une
 * ligne `order_credits` agrège potentiellement plusieurs produits ayant
 * chacun leur propre règle résolue : s'il n'y a qu'une seule règle
 * distincte sur l'ensemble des lignes, on la cite directement. S'il y en a
 * plusieurs (panier mixte, ex. un pack à crédit fixe + un produit à règle
 * percent), il n'existe pas "LA" règle qui a produit ce crédit --
 * `applied_rule_id` reste `null` (pas de traçabilité trompeuse) et
 * `computation_note` résume chaque ligne en texte, ce qui satisfait quand
 * même l'exigence de traçabilité du schéma sans sur-affirmer une seule
 * origine.
 */
function summarizeLineCredits(lineCredits: LineCreditResult[]): {
  appliedRuleId: string | null;
  note: string;
} {
  if (lineCredits.length === 0) {
    return { appliedRuleId: null, note: 'Aucune ligne.' };
  }
  const distinctRuleIds = new Set(lineCredits.map((line) => line.appliedRuleId));
  const appliedRuleId = distinctRuleIds.size === 1 ? lineCredits[0]!.appliedRuleId : null;
  const note = lineCredits.map((line) => line.computationNote).join(' ; ');
  return { appliedRuleId, note };
}

export function buildOrderCreditInserts(
  lineCredits: LineCreditResult[],
  beneficiaryCredits: BeneficiaryCreditResult[],
  campaignId: string | null,
  isCampaignActive: boolean,
): OrderCreditInsertPayload[] {
  const { appliedRuleId, note } = summarizeLineCredits(lineCredits);
  const status = decideCreditStatus(campaignId, isCampaignActive);

  return beneficiaryCredits.map((beneficiary) => ({
    beneficiary_type: beneficiary.beneficiaryType,
    beneficiary_id: beneficiary.beneficiaryId,
    campaign_id: campaignId,
    amount_cents: beneficiary.amountCents,
    status,
    applied_rule_id: appliedRuleId,
    computation_note: note,
  }));
}
