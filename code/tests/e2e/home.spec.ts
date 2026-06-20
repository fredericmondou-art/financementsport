import { test, expect } from '@playwright/test';

/**
 * Mis à jour à la Tâche 1.6 : la page d'accueil n'est plus le placeholder
 * "en construction" (Tâche 0.1) — voir `app/page.tsx`.
 */
test('la page d’accueil affiche le slogan et un lien vers la boutique', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Achetez vos essentiels. Financez le sport des jeunes.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir la boutique' })).toBeVisible();
});
