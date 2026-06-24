import { expect, test } from '@playwright/test';

/**
 * Parcours « tuteur édite le profil de son enfant » (Tâche 1.6.C1,
 * docs/prompts/phase-1-6.md) : connexion → /compte/athletes → édition du
 * profil (message, photo, sport, ville) → la page publique reflète les
 * changements → activer un masquage `hide_*` retire bien le champ visé de la
 * page publique sans toucher au reste.
 *
 * Comme pour tests/e2e/public-profile.spec.ts / compte-dashboard.spec.ts, ce
 * test n'a pas pu être exécuté dans le bac à sable de développement : le
 * téléchargement du navigateur Chromium par Playwright et l'accès à un vrai
 * projet Supabase (`*.supabase.co`) sont tous deux bloqués par l'allowlist
 * réseau du bac à sable (voir docs/DECISIONS.md). À exécuter en CI ou en
 * local avant la mise en production.
 *
 * Prérequis (jeu de données e2e dédié, `supabase/seed-e2e.sql` -- toujours pas
 * créé à ce jour, même lacune déjà documentée dans
 * tests/e2e/public-profile.spec.ts) :
 *   - Un compte tuteur déjà connectable : courriel
 *     `parent-edition-e2e@example.com`, mot de passe `mot-de-passe-test-e2e`.
 *   - Un athlète mineur dont `guardian_id` est ce compte, déjà consenti
 *     (`parental_consent_at` non nul, donc publiquement visible dès le
 *     départ), slug `athlete-edition-e2e`, sans photo/message/ville initiaux
 *     pour que les assertions "apparaît après modification" soient sans
 *     ambiguïté.
 */
const GUARDIAN_EMAIL = 'parent-edition-e2e@example.com';
const GUARDIAN_PASSWORD = 'mot-de-passe-test-e2e';
const ATHLETE_SLUG = 'athlete-edition-e2e';

async function loginAsGuardian(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Courriel').fill(GUARDIAN_EMAIL);
  await page.getByLabel('Mot de passe').fill(GUARDIAN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte/);
}

test('un tuteur édite le message, la photo, le sport et la ville → la page publique les affiche', async ({
  page,
}) => {
  await loginAsGuardian(page);

  await page.goto('/compte/athletes');
  await page.getByRole('link', { name: 'Modifier le profil' }).first().click();
  await expect(page).toHaveURL(/\/compte\/athletes\/.+/);

  await page.getByLabel(/Message personnel/).fill('Merci de votre soutien, on se donne à 100% !');
  await page.getByLabel(/Photo/).fill('https://exemple.com/athlete-edition-e2e.jpg');
  await page.getByLabel('Sport (optionnel)').fill('Natation');
  await page.getByLabel('Ville (optionnel)').fill('Trois-Rivières');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByText('Profil mis à jour.')).toBeVisible();

  await page.goto(`/${ATHLETE_SLUG}`);
  await expect(page.getByText('Merci de votre soutien, on se donne à 100% !')).toBeVisible();
  await expect(page.getByText('Natation')).toBeVisible();
  await expect(page.getByText('Trois-Rivières')).toBeVisible();
  await expect(page.getByRole('img', { name: /athlete-edition-e2e/i })).toBeVisible();
});

test('activer "Masquer la photo" et "Masquer la ville" les retire de la page publique, sans masquer le message', async ({
  page,
}) => {
  await loginAsGuardian(page);

  await page.goto('/compte/athletes');
  await page.getByRole('link', { name: 'Modifier le profil' }).first().click();

  await page.getByLabel('Masquer la photo').check();
  await page.getByLabel('Masquer la ville').check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Profil mis à jour.')).toBeVisible();

  await page.goto(`/${ATHLETE_SLUG}`);
  // Le message personnel (champ non masqué) reste affiché...
  await expect(page.getByText('Merci de votre soutien, on se donne à 100% !')).toBeVisible();
  // ...mais la photo et la ville, désormais masquées, ont disparu.
  await expect(page.getByRole('img', { name: /athlete-edition-e2e/i })).toHaveCount(0);
  await expect(page.getByText('Trois-Rivières')).toHaveCount(0);
});
