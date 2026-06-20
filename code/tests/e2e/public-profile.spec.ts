import { expect, test } from '@playwright/test';

/**
 * Parcours public (Tâche 1.6) : visiter une page publique, cliquer
 * "Encourager", arriver au panier avec le bon bénéficiaire pré-attaché ;
 * vérifier le respect d'un masquage (`hide_amounts`).
 *
 * Comme pour `tests/e2e/auth.spec.ts`, ce test n'a pas pu être exécuté dans
 * le bac à sable de développement : le téléchargement du navigateur
 * Chromium par Playwright et l'accès à un vrai projet Supabase
 * (`*.supabase.co`) sont tous deux bloqués par l'allowlist réseau du bac à
 * sable (voir docs/DECISIONS.md). À exécuter en CI ou en local avant la
 * mise en production. Les slugs `equipe-faucons-e2e`/`athlete-masque-e2e`
 * supposent un jeu de seed e2e dédié (un athlète normal pour le premier test,
 * un athlète avec `hide_amounts = true` pour le second) — à créer dans
 * `supabase/seed-e2e.sql` si ce fichier n'existe pas encore.
 */
test('visiter la page d’une équipe, cliquer "Encourager" attache le bon bénéficiaire au panier', async ({
  page,
}) => {
  await page.goto('/team/equipe-faucons-e2e');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('link', { name: /Encourager/ }).first().click();
  await expect(page).toHaveURL(/\/boutique\?beneficiaryType=team&beneficiaryId=/);

  await page.getByRole('button', { name: 'Ajouter au panier' }).first().click();

  await page.goto('/panier');
  // La répartition doit avoir été pré-remplie à 100% pour ce bénéficiaire
  // (voir `app/(shop)/panier/actions.ts`, `setCartBeneficiarySplit`).
  await expect(page.getByText('100%')).toBeVisible();
});

test('une page athlète avec hide_amounts=true n’affiche jamais de montant réel', async ({ page }) => {
  await page.goto('/athlete-masque-e2e');

  // Aucun montant en dollars ne doit apparaître sur la page (la section
  // affiche "Cette campagne est active." plutôt qu'une barre de progression
  // chiffrée — voir `lib/public/campaign-progress.ts`, `applyAmountsMask`).
  await expect(page.getByText('Cette campagne est active.')).toBeVisible();
  await expect(page.getByText(/amassés sur un objectif/)).toHaveCount(0);
});

test('un slug athlète avec show_team_only=true n’a aucune page individuelle (404)', async ({ page }) => {
  const response = await page.goto('/athlete-equipe-seulement-e2e');
  expect(response?.status()).toBe(404);
});
