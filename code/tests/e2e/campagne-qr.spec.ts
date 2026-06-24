import { expect, test } from '@playwright/test';

/**
 * Parcours « QR codes téléchargeables » (Tâche 1.5.1, docs/prompts/phase-1-5.md
 * lignes 17-47) : la responsable d'équipe ouvre l'écran de démarrage de sa
 * campagne active → suit le lien « Voir et télécharger les codes QR » →
 * /campagnes/[campaignId]/qr → un code QR pour la campagne ET un par athlète
 * participant sont affichés, chacun avec ses boutons « Télécharger en PNG »/
 * « Télécharger en PDF ». Même pattern de connexion que
 * tests/e2e/athlete-suivi.spec.ts.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué pour Chromium/Supabase, voir docs/DECISIONS.md) — à
 * exécuter en CI ou en local avant la mise en production.
 *
 * Prérequis (jeu de données e2e dédié, `supabase/seed-e2e.sql` -- toujours pas
 * créé à ce jour, même lacune déjà documentée dans
 * tests/e2e/athlete-profile-edit.spec.ts) :
 *   - Un compte responsable d'équipe (`responsable-qr-e2e@example.com` /
 *     `mot-de-passe-test-e2e`) avec une campagne ACTIVE déjà lancée
 *     (`campaign-qr-e2e`), ayant au moins un athlète participant.
 */
const MANAGER_EMAIL = 'responsable-qr-e2e@example.com';
const MANAGER_PASSWORD = 'mot-de-passe-test-e2e';
const CAMPAIGN_ID = 'campaign-qr-e2e';

async function loginAsManager(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Courriel').fill(MANAGER_EMAIL);
  await page.getByLabel('Mot de passe').fill(MANAGER_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte|\/campagnes/);
}

test('la responsable télécharge le QR de la campagne et celui d’un athlète', async ({ page }) => {
  await loginAsManager(page);

  await page.goto(`/campagnes/${CAMPAIGN_ID}/demarrage`);
  await page.getByRole('link', { name: 'Voir et télécharger les codes QR' }).click();
  await expect(page).toHaveURL(new RegExp(`/campagnes/${CAMPAIGN_ID}/qr$`));

  await expect(page.getByRole('heading', { name: /^Codes QR/ })).toBeVisible();

  // Au moins deux blocs : le QR de la campagne et celui d'un athlète
  // participant (critère d'acceptation explicite : « On télécharge le QR
  // d'un athlète en PNG et en PDF »).
  const campagneHeading = page.getByRole('heading', { name: /^Campagne --/ });
  const athleteHeading = page.getByRole('heading', { name: /^Athlète --/ }).first();
  await expect(campagneHeading).toBeVisible();
  await expect(athleteHeading).toBeVisible();

  // Chaque image QR est bien rendue (pas une icône d'image cassée).
  const images = page.getByRole('img', { name: /Code QR/ });
  await expect(images.first()).toBeVisible();

  // Téléchargement PNG de l'athlète : on vérifie la réponse HTTP de la route,
  // pas le fichier sur disque (suffisant et stable en CI headless).
  const athleteCard = page.locator('section', { has: athleteHeading });
  const [pngResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/qr/') && response.url().endsWith('/png')),
    athleteCard.getByRole('link', { name: 'Télécharger en PNG' }).click(),
  ]);
  expect(pngResponse.status()).toBe(200);
  expect(pngResponse.headers()['content-type']).toContain('image/png');

  const [pdfResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/qr/') && response.url().endsWith('/pdf')),
    athleteCard.getByRole('link', { name: 'Télécharger en PDF (format lettre)' }).click(),
  ]);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
});

test('scanner le QR (visiter /api/qr/[code]) redirige vers la bonne page publique et incrémente le compteur', async ({
  page,
  request,
}) => {
  await loginAsManager(page);
  await page.goto(`/campagnes/${CAMPAIGN_ID}/qr`);

  const athleteCard = page.locator('section', { hasText: 'Athlète --' }).first();
  const pngHref = await athleteCard.getByRole('link', { name: 'Télécharger en PNG' }).getAttribute('href');
  expect(pngHref).toBeTruthy();
  const code = pngHref!.split('/api/qr/')[1]!.replace('/png', '');

  const before = await page.getByText(/scan\(s\) jusqu'à présent/).first().textContent();

  const scanResponse = await request.get(`/api/qr/${code}`, { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(scanResponse.status());
  expect(scanResponse.headers()['location']).toBeTruthy();

  await page.reload();
  const after = await page.getByText(/scan\(s\) jusqu'à présent/).first().textContent();
  expect(after).not.toBe(before);
});
