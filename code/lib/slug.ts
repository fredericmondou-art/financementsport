/**
 * Génération de slug unique (Tâche 1.1).
 *
 * Cœur PUR, sans dépendance DB — `pickUniqueSlug` reçoit un vérificateur
 * d'unicité injecté par l'appelant (généralement une requête Supabase dans
 * `lib/entities/*.ts`). Cette séparation permet de tester la logique de
 * collision sans base de données (voir CLAUDE.md section 6 : logique métier
 * dans `lib/`, testable, pas couplée à l'I/O).
 */

const DIACRITICS_REGEX = /[̀-ͯ]/g;

/**
 * Dérive un slug "propre" à partir d'un texte libre : retire les accents,
 * met en minuscules, remplace tout caractère non alphanumérique par un
 * tiret, et retire les tirets en début/fin.
 *
 * Exemples : "Thomas U11" -> "thomas-u11", "Les Corsaires de l'Est" ->
 * "les-corsaires-de-l-est".
 */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '') // retire les diacritiques (é -> e, ç -> c, ...)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // Filet de sécurité : un nom composé uniquement de caractères spéciaux
  // (ex: "!!!") produirait un slug vide, invalide pour une contrainte UNIQUE
  // NOT NULL.
  return base.length > 0 ? base : 'item';
}

/**
 * Vérifie si un slug candidat est déjà pris. Implémentation injectée par
 * l'appelant (ex: requête `SELECT 1 FROM clubs WHERE slug = ...`).
 */
export type SlugTakenChecker = (candidate: string) => boolean | Promise<boolean>;

/**
 * Retourne un slug unique dérivé de `name` : essaie d'abord le slug de base,
 * puis suffixe `-2`, `-3`, ... jusqu'à trouver un slug libre selon
 * `isTaken`. Deux entrées identiques ("Thomas U11" et "Thomas U11") donnent
 * donc deux slugs distincts : `thomas-u11` puis `thomas-u11-2`.
 */
export async function pickUniqueSlug(
  name: string,
  isTaken: SlugTakenChecker,
  maxAttempts = 1000,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 1;

  while (await isTaken(candidate)) {
    attempt += 1;
    if (attempt > maxAttempts) {
      throw new Error(
        `Impossible de générer un slug unique pour "${name}" après ${maxAttempts} tentatives.`,
      );
    }
    candidate = `${base}-${attempt}`;
  }

  return candidate;
}
