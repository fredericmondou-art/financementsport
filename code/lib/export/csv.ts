/**
 * Export CSV générique (Tâche 1.5.4, docs/prompts/phase-1-5.md), pensé pour
 * être réutilisé tel quel par la Tâche 1.5.11 ("Réutilise `lib/export/*`
 * (tâche 1.5.4)") -- aucune connaissance du domaine (commandes, athlètes...)
 * ici, seulement des tableaux de chaînes déjà préparés par l'appelant
 * (ex. `lib/distribution/export.ts`).
 *
 * Fonctions PURES, sans aucune dépendance.
 */

/** Échappe un champ CSV (RFC 4180) : guillemets doublés, champ entouré de
 * guillemets si virgule/guillemet/retour à la ligne. */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

/**
 * Construit un CSV complet à partir d'en-têtes et de lignes déjà sous forme
 * de chaînes (l'appelant a déjà formaté les montants/dates -- ce module ne
 * fait aucune mise en forme métier). Séparateur virgule, fin de ligne CRLF
 * (RFC 4180), précédé d'un BOM UTF-8 : sans lui, Excel (FR, l'environnement
 * cible -- CLAUDE.md section 2) affiche les caractères accentués en
 * mojibake à l'ouverture directe du fichier.
 */
export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
