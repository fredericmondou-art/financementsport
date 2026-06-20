/**
 * Logique pure de progression de campagne publique (Tâche 1.6) : sélection
 * de la campagne pertinente pour un bénéficiaire, calcul de la barre de
 * progression et des jours restants, masquage des montants. Aucune
 * dépendance I/O — testable directement (voir CLAUDE.md section 6/8).
 */
import type { VPublicCampaignView } from '@/lib/db/types';

export type PublicCampaignRow = VPublicCampaignView['Row'];

/**
 * Rien dans le schéma n'empêche plusieurs campagnes simultanément `active`
 * pour le même bénéficiaire direct (`beneficiary_type`/`beneficiary_id`).
 * Choix déterministe pour la page publique (un seul objectif affiché à la
 * fois) : la plus récemment démarrée (`starts_at` décroissant, une campagne
 * sans date de début est traitée comme "jamais démarrée" donc classée en
 * dernier), départagée de façon stable par `id` en cas d'égalité exacte. Pas
 * de notion de priorité éditoriale dans le schéma actuel — à revisiter
 * explicitement si ce cas réel se présente (voir docs/DECISIONS.md).
 */
export function pickMostRelevantCampaign(campaigns: PublicCampaignRow[]): PublicCampaignRow | null {
  if (campaigns.length === 0) {
    return null;
  }
  const sorted = [...campaigns].sort((a, b) => {
    const startsA = a.starts_at ? new Date(a.starts_at).getTime() : -Infinity;
    const startsB = b.starts_at ? new Date(b.starts_at).getTime() : -Infinity;
    if (startsB !== startsA) {
      return startsB - startsA;
    }
    return a.id.localeCompare(b.id);
  });
  // `sorted` est garanti non vide (vérifié ligne 22) : l'accès `[0]` est sûr
  // même avec `noUncheckedIndexedAccess` (CLAUDE.md section 6, TypeScript strict).
  return sorted[0] ?? null;
}

export interface CampaignProgress {
  raisedCents: number;
  /** `null` si aucun objectif n'est défini (goal_cents NULL ou <= 0) — la
   * page ne doit alors pas afficher de barre de progression. */
  goalCents: number | null;
  /** Pourcentage entier 0-100, plafonné à 100 même si l'objectif est
   * dépassé (voir `isGoalExceeded` pour le détecter). `null` si `goalCents`
   * est `null`. */
  percent: number | null;
  isGoalExceeded: boolean;
}

export function computeCampaignProgress(raisedCents: number, goalCents: number | null): CampaignProgress {
  if (goalCents === null || goalCents <= 0) {
    return { raisedCents, goalCents: null, percent: null, isGoalExceeded: false };
  }
  const rawPercent = (raisedCents / goalCents) * 100;
  return {
    raisedCents,
    goalCents,
    percent: Math.min(100, Math.round(rawPercent)),
    isGoalExceeded: raisedCents > goalCents,
  };
}

/**
 * Remplace tous les montants par des valeurs neutres lorsque
 * `athletes.hide_amounts = true` (seule table porteuse de ce champ — voir
 * docs/DECISIONS.md). Appliqué à la couche de chargement des données, pas
 * seulement à l'affichage : un montant masqué ne doit jamais atteindre la
 * page, même par erreur de rendu (CLAUDE.md section 5).
 */
export function applyAmountsMask(progress: CampaignProgress, hideAmounts: boolean): CampaignProgress {
  if (!hideAmounts) {
    return progress;
  }
  return { raisedCents: 0, goalCents: null, percent: null, isGoalExceeded: false };
}

/**
 * Jours restants avant `endsAt`, plafonné à 0 (jamais négatif) : une
 * campagne encore au statut `active` mais dont la date de fin est dépassée
 * affiche "0 jour restant", pas un nombre négatif. `null` si aucune date de
 * fin n'est définie (campagne sans échéance).
 */
export function computeDaysRemaining(endsAt: string | null, now: Date = new Date()): number | null {
  if (endsAt === null) {
    return null;
  }
  const diffMs = new Date(endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
