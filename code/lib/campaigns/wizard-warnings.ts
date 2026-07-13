/**
 * Avertissements NON bloquants de l'assistant de création de campagne (P.6,
 * SPEC-PARAMETRES-PLATEFORME.md §4, R5/R6). Fonctions PURES -- décision
 * seule, aucune I/O ici (les paramètres sont déjà chargés par l'appelant via
 * `getParametres`, lib/parametres.ts) -- même séparation pure/I-O que
 * `lib/checkout/campaign-order-cap.ts` (R4), testable sans DB
 * (CLAUDE.md section 8).
 *
 * Les deux règles couvertes ici sont explicitement « souples » (spec §4) :
 * « SRV : aucune validation bloquante » (R6) / seul le DÉPASSEMENT du
 * maximum est bloquant côté serveur pour R5 (déjà géré par
 * `lib/campaigns/create-campaign.ts#assertPlatformParameterRules`) -- ces
 * fonctions ne gèrent QUE le seuil d'avertissement, jamais le blocage dur.
 */
import { formatCents } from '@/lib/format-cents';

/**
 * R6 — Objectif par athlète (souple). Avertit (sans bloquer) quand
 * l'objectif saisi dépasse `campagne_objectif_athlete_avertissement`.
 * Retourne `null` si aucun objectif n'est fixé (« optionnel », spec §4) ou
 * si l'objectif reste sous le seuil d'avertissement.
 */
export function buildObjectifAmbitieuxMessage(
  goalCents: number | null,
  avertissementCents: number,
  suggere: { min: number; max: number },
): string | null {
  if (goalCents === null || goalCents <= avertissementCents) {
    return null;
  }
  return (
    `Objectif ambitieux : la moyenne réaliste se situe entre ${formatCents(suggere.min)} et ` +
    `${formatCents(suggere.max)} par athlète. Un objectif atteignable motive davantage — vous ` +
    'pourrez le dépasser !'
  );
}

/**
 * R5 — Produits distincts. Avertit (sans bloquer) dès que le nombre de
 * produits sélectionnés dépasse `campagne_produits_recommande` (le blocage
 * dur au-delà de `campagne_produits_max` reste de la responsabilité de
 * `assertPlatformParameterRules`, déclenché à la soumission finale du
 * récapitulatif -- même architecture que R1/R2/R3/R7/R9, aucune validation
 * bloquante n'est dupliquée ici).
 */
export function buildProduitsRecommandeMessage(productCount: number, recommandeMax: number): string | null {
  if (productCount <= recommandeMax) {
    return null;
  }
  return (
    `Plus de ${recommandeMax} produits complique le tri à la livraison. Les campagnes simples ` +
    'performent mieux.'
  );
}
