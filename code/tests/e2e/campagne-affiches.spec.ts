import { expect, test } from '@playwright/test';

/**
 * Parcours « Génération automatique d'affiches » (Tâche 1.5.2,
 * docs/prompts/phase-1-5.md lignes 51-79) : la responsable d'équipe ouvre
 * l'écran de démarrage de sa campagne active → suit le lien « Voir et
 * télécharger les affiches » → /campagnes/[campaignId]/affiches → les 3
 * formats (lettre/carré/story) sont proposés en téléchargement PDF. Même
 * pattern que tests/e2e/campagne-qr.spec.ts.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué pour Chromium/Supabase, voir docs/DECISIONS.md) — à
 * exécuter en CI ou en local avant la mise en production.
 *
 * Prérequis (jeu de données e2e dédié, `supabase/seed-e2e.sql` -- toujours
 * pas créé à ce jour, même lacune déjà documentée pour les specs
 * précédentes) : un compte responsable d'équipe
 * (`responsable-affiches-e2e@example.com` / `mot-de-passe-test-e2e`) avec
 * une campagne ACTIVE déjà lancée (`campaign-affiches-e2e`), dont le
 * bénéficiaire est un athlète AVEC `hide_photo = true` (pour vérifier le
 * critère d'acceptation « affiche avec hide_photo=true n'affiche pas la
 * photo », même si l'absence de photo n'est observable qu'indirectement
 * depuis cette spec -- voir note plus bas).
 */
const MANAGER_EMAIL = 'responsable-affiches-e2e@example.com';
const MANAGER_PASSWORD = 'mot-de-passe-test-e2e';
const CAMPAIGN_ID = 'campaign-affiches-e2e';

async function loginAsManager(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Courriel').fill(MANAGER_EMAIL);
  await page.getByLabel('Mot de passe').fill(MANAGER_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte|\/campagnes/);
}

test('la responsable télécharge l’affiche de sa campagne dans les 3 formats', async ({ page }) => {
  await loginAsManager(page);

  await page.goto(`/campagnes/${CAMPAIGN_ID}/demarrage`);
  await page.getByRole('link', { name: 'Voir et télécharger les affiches' }).click();
  await expect(page).toHaveURL(new RegExp(`/campagnes/${CAMPAIGN_ID}/affiches$`));

  await expect(page.getByRole('heading', { name: /^Affiches --/ })).toBeVisible();

  const formats: Array<{ heading: RegExp; urlSuffix: string }> = [
    { heading: /^Format lettre/, urlSuffix: '/lettre' },
    { heading: /^Format carré/, urlSuffix: '/carre' },
    { heading: /^Format story/, urlSuffix: '/story' },
  ];

  for (const format of formats) {
    const heading = page.getByRole('heading', { name: format.heading });
    await expect(heading).toBeVisible();
    const card = page.locator('section', { has: heading });
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/campagnes/') && resp.url().endsWith(format.urlSuffix),
      ),
      card.getByRole('link', { name: 'Télécharger en PDF' }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
  }
});

test('une affiche d’athlète avec hide_photo=true n’expose jamais l’URL de la photo dans la page', async ({
  page,
}) => {
  // Vérification PARTIELLE (limite documentée dans le rapport) : on ne peut
  // pas inspecter le contenu visuel du PDF généré depuis ce test e2e, mais
  // on peut au moins confirmer que la page d'aperçu elle-même (qui affiche
  // une vignette de la photo si elle est connue) ne rend AUCUNE balise
  // <img> pour ce bénéficiaire -- cohérent avec `identity.imageUrl === null`
  // déjà garanti par `v_public_athlete` (CLAUDE.md section 5).
  await loginAsManager(page);
  await page.goto(`/campagnes/${CAMPAIGN_ID}/affiches`);

  const images = page.getByRole('img');
  await expect(images).toHaveCount(0);
});
