import { expect, test } from '@playwright/test';

/**
 * Tâche 1.4.5 : pages d'erreur et états vides.
 *
 * Comme pour `tests/e2e/auth.spec.ts` et `tests/e2e/public-profile.spec.ts`,
 * ce fichier n'a pas pu être exécuté dans le bac à sable de développement
 * (téléchargement du navigateur Chromium par Playwright bloqué par
 * l'allowlist réseau — voir docs/DECISIONS.md). À exécuter en CI ou en local
 * avant la mise en production.
 *
 * Le panier vide est testable sans jeu de données dédié : un navigateur sans
 * cookie de panier obtient toujours un panier neuf et vide (voir
 * `lib/cart/identity.ts`, `getOrCreateCart`). Le panier 500 (erreur serveur)
 * n'est volontairement pas déclenché ici : aucune route de test cassée
 * n'existe en V1 (CLAUDE.md section 10, ne pas anticiper de surface
 * supplémentaire) — `app/error.tsx` est couvert au niveau unitaire
 * (tests/unit/app-error.test.tsx).
 */
test('une route inexistante affiche la page 404 en français', async ({ page }) => {
  const response = await page.goto('/cette-page-n-existe-pas');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Retour à l.accueil/ })).toHaveAttribute('href', '/');
});

test('un panier neuf (sans cookie) affiche l’état vide "Votre panier est vide."', async ({ browser }) => {
  // Nouveau contexte isolé : pas de cookie de panier hérité d'un test
  // précédent (CLAUDE.md section 6 sur les tests indépendants).
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/panier');
  await expect(page.getByText('Votre panier est vide.')).toBeVisible();

  await context.close();
});
