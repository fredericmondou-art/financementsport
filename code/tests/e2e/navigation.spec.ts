import { expect, test } from '@playwright/test';

/**
 * Tâche 1.4.3 : parcours de navigation principal (en-tête, menu mobile,
 * lien actif), desktop ET mobile (viewport réduit) — voir
 * `components/nav/*`. Comme les autres tests e2e du projet (voir
 * `tests/e2e/public-profile.spec.ts`), n'a pas pu être exécuté dans le bac à
 * sable de développement : téléchargement du navigateur Chromium par
 * Playwright et accès réseau à un vrai projet Supabase (`*.supabase.co`)
 * tous deux bloqués par l'allowlist réseau du bac à sable (voir
 * docs/DECISIONS.md). À exécuter en CI ou en local avant mise en production.
 *
 * Utilise l'athlète "thomas-u11" du seed réel (`supabase/seed.sql`, sans
 * masquage particulier) — pas besoin d'un jeu de seed e2e dédié pour ce test.
 */

test.describe('navigation principale (desktop)', () => {
  test('accueil → boutique → page athlète → panier, sans rechargement complet', async ({ page }) => {
    await page.goto('/');

    // Un marqueur posé en mémoire ne survit qu'à une navigation CLIENTE
    // (next/link, sans rechargement HTTP complet) — c'est la preuve qu'il
    // n'y a pas de « rechargement brutal » entre les pages (critère
    // d'acceptation 1.4.3), sans dépendre d'une API interne de Next.js.
    await page.evaluate(() => {
      (window as unknown as { __noReloadMarker?: string }).__noReloadMarker = 'present';
    });

    await page.getByRole('link', { name: 'Boutique' }).first().click();
    await expect(page).toHaveURL('/boutique');
    await expect(page.getByRole('heading', { name: 'Boutique' })).toBeVisible();
    // Page active mise en évidence (aria-current, voir components/nav/nav-link.tsx).
    await expect(page.getByRole('link', { name: 'Boutique', current: 'page' })).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __noReloadMarker?: string }).__noReloadMarker),
    ).toBe('present');

    await page.goto('/thomas-u11');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __noReloadMarker2?: string }).__noReloadMarker2 = 'present';
    });
    await page.getByRole('link', { name: 'Panier' }).first().click();
    await expect(page).toHaveURL('/panier');
    expect(
      await page.evaluate(() => (window as unknown as { __noReloadMarker2?: string }).__noReloadMarker2),
    ).toBe('present');
  });

  test('le menu mobile est masqué sur desktop, la navigation complète est visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Accueil' }).first()).toBeVisible();
    await expect(page.locator('summary.mobile-nav__toggle')).toBeHidden();
  });
});

test.describe('navigation principale (mobile, viewport réduit)', () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test('le menu mobile fonctionne et est utilisable au pouce', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('summary.mobile-nav__toggle');
    await expect(toggle).toBeVisible();

    // Cible tactile >= 44px (recommandation d'accessibilité mobile, voir
    // app/globals.css .mobile-nav__toggle).
    const box = await toggle.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);

    await expect(page.locator('details.mobile-nav')).not.toHaveAttribute('open', '');
    await toggle.click();
    await expect(page.locator('details.mobile-nav')).toHaveAttribute('open', '');

    await page.locator('.mobile-nav__panel').getByRole('link', { name: 'Boutique' }).click();
    await expect(page).toHaveURL('/boutique');
  });
});
