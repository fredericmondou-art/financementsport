import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Liste « Mes campagnes » (correction d'écart de navigation, Phase 1.4b --
 * voir docs/DECISIONS.md et lib/campaigns/list-for-manager.ts). Avant cette
 * tâche, le lien de nav « Campagnes » pointait directement vers
 * `/campagnes/nouvelle` : un responsable qui avait déjà créé une campagne
 * n'avait aucun moyen de la retrouver depuis la navigation -- signalé
 * directement par l'utilisateur. Ce test couvre le parcours qu'il a
 * rencontré : créer une campagne, puis cliquer sur « Campagnes » dans la nav
 * et la retrouver.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué, voir docs/DECISIONS.md) -- à exécuter en CI ou en
 * local contre une URL déployée.
 *
 * Prérequis : `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, jeu
 * de données seed (équipe « U11 Hockey », voir campagne-defauts-bulk.spec.ts).
 */

const TEAM_ID = '33333333-3333-3333-3333-333333333301'; // U11 Hockey (seed)

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

test('après avoir créé une campagne, le lien de nav "Campagnes" permet de la retrouver', async ({ page }) => {
  const email = `test-campagnes-liste-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';

  // 1. Compte + rôle team_manager sur l'équipe seed (même provisionnement que
  //    campagne-defauts-bulk.spec.ts : memberships n'est inscriptible que par
  //    platform_admin, on passe donc par le service-role).
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Responsable Liste E2E');
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
  const { error: roleError } = await supabase.from('profiles').update({ role: 'team_manager' }).eq('id', userId);
  if (roleError) throw roleError;
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ user_id: userId, role: 'team_manager', team_id: TEAM_ID });
  if (membershipError) throw membershipError;

  // 2. Avant toute campagne créée : le lien "Campagnes" mène à une liste
  //    vide avec une action claire (état vide encourageant), pas un trou.
  await page.goto('/compte');
  await page.getByRole('link', { name: 'Campagnes' }).click();
  await expect(page).toHaveURL(/\/campagnes$/);
  await expect(page.getByRole('heading', { name: 'Mes campagnes' })).toBeVisible();
  await expect(page.getByText('Aucune campagne pour le moment')).toBeVisible();

  // 3. Assistant — tout par défaut (même chemin que campagne-defauts-bulk.spec.ts).
  await page.getByRole('link', { name: 'Lancer ma première campagne' }).click();
  await expect(page).toHaveURL(/\/campagnes\/nouvelle$/);
  await page.getByRole('button', { name: 'Continuer' }).click(); // Type et nom
  await page.getByRole('button', { name: 'Continuer' }).click(); // Bénéficiaire
  await page.getByRole('button', { name: 'Continuer' }).click(); // Objectif et dates
  await page.getByRole('button', { name: 'Continuer' }).click(); // Athlètes participants
  await page.getByRole('button', { name: 'Continuer' }).click(); // Packs inclus
  await page.getByRole('button', { name: 'Lancer ma campagne' }).click(); // Récapitulatif

  await expect(page).toHaveURL(/\/campagnes\/[^/]+\/demarrage$/);
  await expect(page.getByRole('heading', { name: 'Campagne lancée !' })).toBeVisible();

  // 4. Le lien de nav "Campagnes" retrouve maintenant la campagne créée --
  //    exactement le trou de navigation signalé : avant cette tâche, ce lien
  //    ramenait directement à `/campagnes/nouvelle`, sans aucune trace de la
  //    campagne qu'on venait de créer.
  await page.getByRole('link', { name: 'Campagnes' }).click();
  await expect(page).toHaveURL(/\/campagnes$/);
  await expect(page.getByRole('heading', { name: 'Mes campagnes' })).toBeVisible();
  await expect(page.getByText('Aucune campagne pour le moment')).toHaveCount(0);
  await expect(page.getByText('Active')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir le rapport' })).toBeVisible();

  // 5. Le rapport reste accessible depuis la liste.
  await page.getByRole('link', { name: 'Voir le rapport' }).click();
  await expect(page).toHaveURL(/\/campagnes\/[^/]+\/rapport$/);
  await expect(page.getByRole('heading', { name: /Rapport de campagne/ })).toBeVisible();
});
