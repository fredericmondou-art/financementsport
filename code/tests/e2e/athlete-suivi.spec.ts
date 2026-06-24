import { expect, test } from '@playwright/test';

/**
 * Parcours « suivi de progression et partage pour l'athlète » (Tâche 1.6.C2,
 * docs/prompts/phase-1-6.md lignes 297-333) : connexion du tuteur →
 * /compte/athletes → « Voir mon suivi » → objectif/montant/nombre de
 * supporters visibles, AUCUN palmarès → copier le lien personnel → copier le
 * message pré-rédigé (texte déjà prêt, rien à rédiger) → liens courriel et
 * Messenger fonctionnels. Même structure que
 * tests/e2e/campagne-apercu-correction.spec.ts (Tâche 1.6.B3) pour les
 * assertions de copie/partage, et même pattern de connexion que
 * tests/e2e/athlete-profile-edit.spec.ts (Tâche 1.6.C1).
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué pour Chromium/Supabase, voir docs/DECISIONS.md) — à
 * exécuter en CI ou en local avant la mise en production.
 *
 * Prérequis (jeu de données e2e dédié, `supabase/seed-e2e.sql` -- toujours pas
 * créé à ce jour, même lacune déjà documentée dans
 * tests/e2e/athlete-profile-edit.spec.ts) :
 *   - Le même compte tuteur et le même athlète que athlete-profile-edit.spec.ts
 *     (`parent-edition-e2e@example.com` / `mot-de-passe-test-e2e`, athlète slug
 *     `athlete-edition-e2e`, déjà consenti -- donc publiquement visible, ce qui
 *     est requis pour que la section « Partager le lien personnel » soit active
 *     plutôt que l'alerte "consentement requis").
 *   - Une campagne active ciblant directement cet athlète (`beneficiary_type
 *     = 'athlete'`), avec un objectif défini et au moins une commande déjà
 *     créditée pour que « nombre de supporters » soit non nul.
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

test('le tuteur consulte le suivi → objectif, montant et supporters visibles, sans palmarès', async ({
  page,
}) => {
  await loginAsGuardian(page);

  await page.goto('/compte/athletes');
  await page.getByRole('link', { name: 'Voir mon suivi' }).first().click();
  await expect(page).toHaveURL(/\/compte\/athletes\/.+\/suivi$/);

  await expect(page.getByRole('heading', { name: 'Progression' })).toBeVisible();
  // Objectif et montant amassé affichés (texte exact dépendant des données de
  // seed, donc on vérifie la présence du vocabulaire requis plutôt qu'un
  // montant en dur).
  await expect(page.getByText(/amassés/)).toBeVisible();
  await expect(page.getByText(/supporter/)).toBeVisible();

  // Critère d'acceptation explicite : aucun palmarès/classement entre
  // athlètes nulle part sur cette page.
  await expect(page.getByText(/classement/i)).toHaveCount(0);
  await expect(page.getByText(/palmarès/i)).toHaveCount(0);
});

test('partager le lien personnel : copie le lien, copie le message pré-rédigé, liens courriel/Messenger', async ({
  page,
  context,
}) => {
  await loginAsGuardian(page);

  await page.goto('/compte/athletes');
  await page.getByRole('link', { name: 'Voir mon suivi' }).first().click();

  await expect(page.getByRole('heading', { name: 'Partager le lien personnel' })).toBeVisible();
  await expect(page.getByText(ATHLETE_SLUG)).toBeVisible();

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.getByRole('button', { name: 'Copier le lien' }).click();
  await expect(page.getByRole('button', { name: 'Copié !' }).first()).toBeVisible();
  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedLink).toContain(ATHLETE_SLUG);

  // Message déjà prêt -- aucune rédaction requise de la part du tuteur.
  await expect(page.getByText("Rien à rédiger")).toBeVisible();
  await page.getByRole('button', { name: 'Copier le message' }).click();
  await expect(page.getByRole('button', { name: 'Copié !' }).first()).toBeVisible();
  const copiedMessage = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedMessage).toContain(ATHLETE_SLUG);
  // Le message reste à la troisième personne (cadre parental, CLAUDE.md
  // section 5) -- jamais signé au nom de l'enfant.
  expect(copiedMessage.toLowerCase()).not.toMatch(/\bje\b/);

  await expect(page.getByRole('link', { name: /Envoyer par courriel/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Envoyer sur Messenger/ })).toBeVisible();
});
