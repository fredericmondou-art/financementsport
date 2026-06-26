import { expect, test } from '@playwright/test';

/**
 * Tâche 1.4b.2 : les trois portes d'entrée de l'accueil + la FAQ.
 * Comme les autres tests e2e du projet (voir tests/e2e/navigation.spec.ts),
 * non exécutable dans le bac à sable de développement (Chromium/Supabase
 * bloqués par l'allowlist réseau) -- à exécuter en CI ou en local.
 */

test('l’accueil affiche les trois portes d’entrée et mène à la bonne page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Trouver un athlète' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lancer une campagne' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir la boutique' })).toBeVisible();

  await page.getByRole('link', { name: 'Trouver un athlète' }).click();
  await expect(page).toHaveURL('/trouver');
  await expect(page.getByRole('heading', { name: 'Trouver un athlète' })).toBeVisible();
});

test('le bouton « Lancer une campagne » redirige vers la connexion si non authentifié', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Lancer une campagne' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('l’exemple chiffré et la FAQ de l’accueil sont visibles et interactifs', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText("Achat d'un Pack Saison (120,00 $)")).toBeVisible();
  await expect(page.getByText('18,00 $ versés au bénéficiaire choisi')).toBeVisible();

  const firstQuestion = page.locator('details.faq__item').first();
  await expect(firstQuestion.locator('p')).toBeHidden();
  await firstQuestion.locator('summary').click();
  await expect(firstQuestion.locator('p')).toBeVisible();
});
