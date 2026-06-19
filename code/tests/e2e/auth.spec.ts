import { expect, test } from '@playwright/test';

/**
 * Parcours complet inscription → connexion → page protégée (Tâche 0.3).
 *
 * Comme pour tests/e2e/home.spec.ts (Tâche 0.1), ce test n'a pas pu être
 * exécuté dans le bac à sable de développement : le téléchargement du
 * navigateur Chromium par Playwright est bloqué par la politique réseau
 * (voir docs/DECISIONS.md). De plus, ce test précis appelle un vrai projet
 * Supabase (`*.supabase.co`), également bloqué par l'allowlist réseau du
 * bac à sable. À exécuter en CI ou en local avant la mise en production.
 */
test('inscription puis connexion donnent accès à la page protégée /compte', async ({ page }) => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';

  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Test E2E');
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/compte/);
  await expect(page.getByTestId('user-role')).toContainText('client');
});

test('un visiteur non connecté est redirigé de /compte vers /login', async ({ page }) => {
  await page.goto('/compte');
  await expect(page).toHaveURL(/\/login/);
});
