import { test, expect } from '@playwright/test';

test('la page d’accueil affiche le message attendu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Plateforme de financement sportif — en construction')).toBeVisible();
});
