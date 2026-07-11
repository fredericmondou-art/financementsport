/**
 * R8 — Plafond annuel de crédit par athlète (SPEC-PARAMETRES-PLATEFORME.md
 * §4, tâche P.5) : `parametres_plateforme.athlete_credit_annuel_max`
 * (CENTIMES). Fonction PURE : ne fait aucune I/O -- reçoit les lignes déjà
 * construites par `buildOrderCreditInserts` (lib/credits/persist.ts) et le
 * total déjà attribué cette année civile par athlète (chargé séparément par
 * `loadAthleteAnnualCreditTotals`, lib/credits/load-annual-totals.ts).
 *
 * Portée (spec §4, R8 -- « Plafond annuel de crédit par ATHLÈTE ») :
 * uniquement `beneficiary_type === 'athlete'` -- équipes et clubs ne sont
 * jamais plafonnés par ce paramètre.
 *
 * Ne touche QUE les lignes `status === 'active'`. Une ligne déjà `pending`
 * (motif `campagne_inactive`, posée par `buildOrderCreditInserts`) n'est
 * JAMAIS re-scindée ici -- cf. le commentaire de la migration 0026 : un
 * excédent déjà mis en attente pour une autre raison ne doit pas interagir
 * avec R8 tant qu'il n'a pas été explicitement réactivé par un admin.
 *
 * Règle (spec) : « si credits_annee_civile + credit_calcule >
 * athlete_credit_annuel_max, attribuer la portion sous plafond normalement
 * et basculer l'excédent en credit_en_attente avec motif plafond_annuel ».
 * Une ligne qui dépasse le plafond est donc scindée en DEUX lignes
 * `order_credits` distinctes (le schéma n'impose aucune unicité sur
 * (order_id, beneficiary_id) -- une commande répartie sur 2 enfants produit
 * déjà 2 lignes, cf. commentaire de la table) : la portion sous plafond
 * (statut inchangé, `active`) et l'excédent (`pending` /
 * `plafond_annuel`). Si le plafond est déjà entièrement consommé, la ligne
 * entière bascule en excédent plutôt que de produire une ligne à 0 centime.
 *
 * Aucun blocage de l'achat dans tous les cas (spec §4 : « l'achat n'est
 * jamais bloqué ») -- cette fonction ne lève jamais d'erreur, elle ne fait
 * que répartir le même montant total entre deux statuts.
 */
import type { OrderCreditInsertPayload } from './persist';

/** Total déjà attribué cette année civile, par identifiant d'athlète
 * (CENTIMES). Ne doit inclure QUE les crédits réellement « attribués » au
 * sens de la spec : `active`, ou `pending` seulement parce que la campagne
 * n'est pas encore active (`pending_reason = 'campagne_inactive'`) -- jamais
 * un excédent déjà mis en attente pour `plafond_annuel` (qui, par
 * définition, n'a PAS été attribué -- l'inclure re-compterait le même
 * excédent d'une année sur l'autre à chaque nouvel achat). Voir
 * `loadAthleteAnnualCreditTotals`. */
export type AnnualCreditTotalsByAthlete = ReadonlyMap<string, number>;

export function applyAnnualCreditCap(
  inserts: OrderCreditInsertPayload[],
  annualTotalsByAthlete: AnnualCreditTotalsByAthlete,
  athleteCreditAnnuelMaxCents: number,
): OrderCreditInsertPayload[] {
  const result: OrderCreditInsertPayload[] = [];

  for (const insert of inserts) {
    if (insert.beneficiary_type !== 'athlete' || insert.status !== 'active' || insert.amount_cents <= 0) {
      result.push(insert);
      continue;
    }

    const priorTotalCents = annualTotalsByAthlete.get(insert.beneficiary_id) ?? 0;
    const remainingRoomCents = Math.max(athleteCreditAnnuelMaxCents - priorTotalCents, 0);

    if (insert.amount_cents <= remainingRoomCents) {
      // Entièrement sous le plafond -- rien à changer.
      result.push(insert);
      continue;
    }

    const underCapCents = remainingRoomCents;
    const excessCents = insert.amount_cents - underCapCents;

    if (underCapCents > 0) {
      result.push({ ...insert, amount_cents: underCapCents });
    }
    result.push({
      ...insert,
      amount_cents: excessCents,
      status: 'pending',
      pending_reason: 'plafond_annuel',
    });
  }

  return result;
}

/**
 * Notification interne à l'admin (spec §4, R8 : « Notification interne à
 * l'admin (traitement manuel, cohérent V1) »). Convention réutilisée telle
 * quelle plutôt qu'inventée : `orders.notes_internal`, DÉJÀ le mécanisme
 * existant pour signaler un cas nécessitant une action admin manuelle (voir
 * le cas « stock insuffisant » posé par `create_paid_order`, migration
 * 0006/0026) -- aucune autre infrastructure de notification (courriel,
 * table dédiée) n'existe dans le projet, et CLAUDE.md section 10 exclut
 * d'anticiper ce qui n'est pas explicitement demandé pour la V1.
 */
export interface AnnualCapExcessNotice {
  beneficiaryId: string;
  excessCents: number;
}

export function summarizeAnnualCapExcess(inserts: OrderCreditInsertPayload[]): AnnualCapExcessNotice[] {
  return inserts
    .filter(
      (insert) =>
        insert.beneficiary_type === 'athlete' &&
        insert.status === 'pending' &&
        insert.pending_reason === 'plafond_annuel',
    )
    .map((insert) => ({ beneficiaryId: insert.beneficiary_id, excessCents: insert.amount_cents }));
}

export function buildAnnualCapAdminNoteFr(excess: AnnualCapExcessNotice[]): string | null {
  if (excess.length === 0) {
    return null;
  }
  const details = excess
    .map((entry) => `athlète ${entry.beneficiaryId} : ${(entry.excessCents / 100).toFixed(2)} $`)
    .join(' ; ');
  return (
    'Plafond annuel de crédit atteint (R8) -- excédent basculé en crédit en attente, ' +
    `à libérer manuellement après validation : ${details}.`
  );
}
