import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Parcours assistant de campagne — aperçu fidèle, correction en un clic,
 * activation, écran « prochaines actions » (Tâche 1.6.B3,
 * docs/prompts/phase-1-6.md). Couvre les critères d'acceptation e2e
 * spécifiques à cette tâche, en complément de
 * `tests/e2e/campagne-defauts-bulk.spec.ts` (Tâche 1.6.B2, qui couvre déjà le
 * chemin « tout par défaut » + activation + arrivée sur l'écran de
 * démarrage) :
 *   - L'aperçu du récapitulatif affiche EXACTEMENT le nom du bénéficiaire
 *     (même composant `PublicProfileView` que la vraie page publique).
 *   - Cliquer « Modifier » sur une section ramène à l'étape concernée ;
 *     l'enregistrer ramène directement au récapitulatif (un clic pour
 *     corriger), et l'aperçu reflète immédiatement le changement.
 *   - Le bouton d'activation est exactement « Lancer ma campagne ».
 *   - L'écran de démarrage propose des actions fonctionnelles : copier le
 *     lien, copier le message aux parents, ouvrir l'affiche imprimable.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué pour Chromium/Supabase, voir docs/DECISIONS.md) — à
 * exécuter en CI ou en local avant la mise en production.
 */

const TEAM_ID = '33333333-3333-3333-3333-333333333301'; // U11 Hockey (seed)
const TEAM_NAME = 'U11 Hockey';

function serviceRoleClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis pour ce test.',
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

test('aperçu fidèle → correction en un clic → activation → écran de démarrage fonctionnel', async ({
  page,
  context,
}) => {
  const email = `test-wizard-apercu-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';

  // 1. Compte + provisionnement team_manager (RLS interdit l'auto-attribution).
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Gestionnaire E2E Aperçu');
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte/);

  const supabase = serviceRoleClient();
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (profileError || !profileRow) {
    throw profileError ?? new Error('Profil introuvable après inscription.');
  }
  const userId = (profileRow as { id: string }).id;
  // Voir le commentaire équivalent dans campagne-defauts-bulk.spec.ts
  // (bug trouvé et corrigé à la Tâche 1.4b.1, docs/DECISIONS.md) :
  // `profiles.role` (porte d'accès page.tsx) doit être mis à jour
  // explicitement, distinct de `memberships.role` (périmètre géré).
  const { error: profileRoleError } = await supabase
    .from('profiles')
    .update({ role: 'team_manager' })
    .eq('id', userId);
  if (profileRoleError) {
    throw profileRoleError;
  }
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ user_id: userId, role: 'team_manager', team_id: TEAM_ID });
  if (membershipError) {
    throw membershipError;
  }

  // 2. Étapes 1 à 5 : défauts acceptés sans modification (déjà couvert en
  //    détail par campagne-defauts-bulk.spec.ts — ici on traverse juste assez
  //    vite pour atteindre le récapitulatif).
  await page.goto('/campagnes/nouvelle');
  await page.getByRole('button', { name: 'Continuer' }).click(); // étape 1 -> 2
  await page.getByRole('button', { name: 'Continuer' }).click(); // étape 2 -> 3
  await page.getByRole('button', { name: 'Continuer' }).click(); // étape 3 -> 4
  await page.getByRole('button', { name: 'Continuer' }).click(); // étape 4 -> 5
  await page.getByRole('button', { name: 'Continuer' }).click(); // étape 5 -> récap

  // 3. Aperçu fidèle : le nom du bénéficiaire apparaît exactement comme sur
  //    sa vraie page publique (même composant PublicProfileView).
  await expect(page.getByRole('heading', { name: 'Récapitulatif' })).toBeVisible();
  await expect(page.locator('.public-profile__identity h1')).toHaveText(TEAM_NAME);

  // 4. Correction en un clic : « Modifier » la section "Type et nom", changer
  //    le nom de la campagne, enregistrer -> retour direct au récapitulatif.
  const nouveauNom = 'Campagne corrigée par test e2e';
  await page
    .locator('.recap-section', { hasText: 'Type et nom' })
    .getByRole('link', { name: 'Modifier' })
    .click();
  await expect(page).toHaveURL(/etape=1.*retour=recap|retour=recap.*etape=1/);
  await expect(
    page.getByRole('button', { name: 'Enregistrer et revenir au récapitulatif' }),
  ).toBeVisible();
  await page.locator('input[name="name"]').fill(nouveauNom);
  await page.getByRole('button', { name: 'Enregistrer et revenir au récapitulatif' }).click();

  // Un seul clic après l'ouverture de l'étape a suffi à revenir ici, avec le
  // nom corrigé déjà répercuté dans le récapitulatif ET dans l'aperçu.
  await expect(page.getByRole('heading', { name: 'Récapitulatif' })).toBeVisible();
  await expect(page.locator('.recap-section', { hasText: 'Type et nom' })).toContainText(nouveauNom);
  await expect(page.locator('.poster--preview')).toContainText(nouveauNom);

  // 5. Activation : libellé exact requis par le cahier des charges.
  await page.getByRole('button', { name: 'Lancer ma campagne' }).click();

  // 6. Écran de démarrage : actions concrètes et fonctionnelles.
  await expect(page).toHaveURL(/\/campagnes\/[^/]+\/demarrage$/);
  await expect(page.getByRole('heading', { name: 'Campagne lancée !' })).toBeVisible();
  await expect(page.getByText(nouveauNom)).toBeVisible();

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copier le lien' }).click();
  await expect(page.getByRole('button', { name: 'Copié !' })).toBeVisible();

  await page.getByRole('button', { name: 'Copier le message' }).click();
  await expect(page.getByRole('button', { name: 'Copié !' })).toBeVisible();

  await expect(page.getByRole('link', { name: /Envoyer par courriel/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Envoyer sur Messenger/ })).toBeVisible();

  // 7. Affiche imprimable : accessible et affiche le nom corrigé + le lien.
  await page.getByRole('link', { name: "Voir et imprimer l'affiche" }).click();
  await expect(page).toHaveURL(/\/demarrage\/affiche$/);
  await expect(page.locator('.poster')).toContainText(nouveauNom);
  await expect(page.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeVisible();
});
