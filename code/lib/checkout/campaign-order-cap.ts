/**
 * P.4 (SPEC-PARAMETRES-PLATEFORME.md, R4) : logique PURE de décision du
 * plafond de commandes payées par campagne, extraite de
 * `lib/checkout/create-checkout-session.ts` pour être testable aux bornes
 * SANS I/O (CLAUDE.md section 6 : « logique métier dans lib/, pas dans les
 * routes » ; section 8 : « aucune fonctionnalité touchant l'argent n'est
 * considérée faite sans tests qui couvrent les cas limites »).
 *
 * `create-checkout-session.ts` reste responsable de TOUT l'I/O (lecture de
 * `v_campaign_paid_order_count`, lecture de `parametres_plateforme`, écriture
 * du détachement dans `cart_beneficiaries`) -- ce module ne fait QUE la
 * comparaison, seule partie qui a besoin d'être vérifiée aux bornes
 * (max-1/max/max+1).
 */

/**
 * Le plafond est atteint (bascule vers la boutique permanente, spec R4 :
 * « commandes_payees >= campagne_commandes_max ») dès que le nombre de
 * commandes déjà payées est >= le maximum configuré -- jamais strictement
 * supérieur. Autrement dit : la commande qui AMÈNE le compte au plafond est
 * elle-même encore acceptée sous la campagne (ex. max=250, 249 commandes
 * payées -> la 250e est acceptée) ; c'est la commande SUIVANTE (la 251e
 * tentative, alors que 250 sont déjà payées) qui bascule.
 */
export function isCampaignOrderCapReached(paidOrderCount: number, campagneCommandesMax: number): boolean {
  return paidOrderCount >= campagneCommandesMax;
}
