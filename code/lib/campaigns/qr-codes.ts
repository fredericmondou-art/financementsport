/**
 * Génération de code QR (Tâche 1.7) — couche DONNÉES uniquement.
 *
 * Le cahier (section « Après la Phase 1 ») liste « QR codes téléchargeables »
 * comme une fonctionnalité de la PHASE 1.5, pas de la Phase 1. Cette tâche se
 * limite donc à générer la ligne `qr_codes` (code court unique, cible
 * polymorphe) — la génération de l'image scannable, son téléchargement, et la
 * route de résolution `/q/<code>` (redirection + `scan_count`) sont déférées
 * à la Phase 1.5 (voir docs/DECISIONS.md, entrée « Tâche 1.7 »).
 *
 * Même structure que `lib/slug.ts` : fonction pure de génération + un
 * vérificateur d'unicité injecté par l'appelant, testable sans DB.
 */

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 8;

/** Génère un code court aléatoire (8 caractères alphanumériques minuscules). */
export function generateRandomQrCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export type QrCodeTakenChecker = (candidate: string) => boolean | Promise<boolean>;

/**
 * Retourne un code unique, en générant de nouveaux candidats aléatoires
 * jusqu'à en trouver un libre selon `isTaken`. Contrairement à
 * `pickUniqueSlug` (suffixe déterministe sur un nom lisible), le code QR n'a
 * pas de base lisible à dériver : on tire au hasard (espace de
 * 36^8 ≈ 2,8 × 10^12 combinaisons, collision quasi nulle en pratique — la
 * boucle n'est qu'un filet de sécurité).
 */
export async function pickUniqueQrCode(
  isTaken: QrCodeTakenChecker,
  maxAttempts = 20,
): Promise<string> {
  let attempt = 0;
  let candidate = generateRandomQrCode();

  while (await isTaken(candidate)) {
    attempt += 1;
    if (attempt >= maxAttempts) {
      throw new Error(`Impossible de générer un code QR unique après ${maxAttempts} tentatives.`);
    }
    candidate = generateRandomQrCode();
  }

  return candidate;
}
