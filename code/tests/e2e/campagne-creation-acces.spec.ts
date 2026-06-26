import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Accès à `/campagnes/nouvelle` — Tâche 1.4b.1 (docs/prompts/phase-1-4b.md,
 * PRIORITÉ). La page affichait « Une erreur est survenue » (page d'erreur
 * générique Next.js) pour TOUT utilisateur, à cause des migrations 0009-0020
 * jamais réellement appliquées en production (table `campaign_drafts`
 * inexistante → `getDraft()`, lib/campaigns/draft.ts, levait une exception
 * non rattrapée). Voir docs/DECISIONS.md, entrée « Correction : migrations
 * 0009-0020 jamais réellement appliquées en production ». Corrigé en
 * ré-appliquant le DDL réel des 12 migrations concernées.
 *
 * Ce fichier couvre les deux tests explicitement demandés par la tâche :
 *   1. Un club_admin accède à la création de campagne sans erreur.
 *   2. Cas sans données préalables (aucun club/équipe géré) → message guidé
 *      (Alert "info"), pas une page d'erreur générique.
 *
 * Ne duplique pas tests/e2e/campagne-defauts-bulk.spec.ts (chemin complet
 * team_manager avec données déjà en place) ni
 * tests/e2e/campagne-apercu-correction.spec.ts (aperçu/correction) : ce
 * fichier teste spécifiquement la PORTE D'ACCÈS et l'ÉTAT VIDE, pas le
 * parcours de création complet.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué pour Chromium/Supabase, voir docs/DECISIONS.md) — à
 * exécuter en CI ou en local contre une URL déployée avant la mise en
 * production.
 *
 * Prérequis : `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 * (mêmes prérequis que les autres specs de l'assistant de campagne).
 */

const CLUB_ID = '22222222-2222-2222-2222-222222222201'; // Corsaires (seed)

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

async function signupAndLogin(page: import('@playwright/test').Page, email: string, password: string, fullName: string) {
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill(fullName);
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte/);
}

async function getUserId(supabase: ReturnType<typeof serviceRoleClient>, email: string): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('id').eq('email', email).single();
  if (error || !data) {
    throw error ?? new Error('Profil introuvable après inscription.');
  }
  return (data as { id: string }).id;
}

test('un club_admin avec un club géré (et son équipe seed) accède à la création de campagne sans erreur', async ({
  page,
}) => {
  const email = `test-acces-club-admin-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';
  await signupAndLogin(page, email, password, 'Club Admin E2E');

  const supabase = serviceRoleClient();
  const userId = await getUserId(supabase, email);

  // Porte d'accès (page.tsx / lib/auth/session.ts) : `profiles.role`. Périmètre
  // géré (lib/campaigns/manager-scope.ts) : `memberships.role` + `club_id`. Les
  // deux colonnes sont nécessaires — voir le commentaire dans
  // campagne-defauts-bulk.spec.ts pour le bug trouvé en l'omettant.
  const { error: roleError } = await supabase.from('profiles').update({ role: 'club_admin' }).eq('id', userId);
  if (roleError) throw roleError;
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ user_id: userId, role: 'club_admin', club_id: CLUB_ID });
  if (membershipError) throw membershipError;

  await page.goto('/campagnes/nouvelle');

  // Pas de page d'erreur générique Next.js, et le formulaire de l'étape 1 est
  // bien rendu (pas seulement le <h1>, qui apparaît aussi dans la branche
  // "non autorisé" — voir lib/auth/permissions.ts).
  await expect(page.getByRole('heading', { name: 'Nouvelle campagne' })).toBeVisible();
  await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible();
});

test('cas sans données préalables (aucune équipe/club géré) → message guidé, pas d\'erreur générique', async ({
  page,
}) => {
  const email = `test-acces-vide-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';
  await signupAndLogin(page, email, password, 'Responsable Sans Equipe E2E');

  const supabase = serviceRoleClient();
  const userId = await getUserId(supabase, email);

  // Rôle accordé (ex. par un admin) MAIS aucune ligne `memberships` créée —
  // simule un responsable à qui on n'a pas encore assigné d'équipe/club.
  // C'est exactement le cas « pas encore d'équipe » visé par la règle de la
  // tâche 1.4b.1 : afficher un état guidé, pas une erreur technique.
  const { error: roleError } = await supabase.from('profiles').update({ role: 'team_manager' }).eq('id', userId);
  if (roleError) throw roleError;

  await page.goto('/campagnes/nouvelle');

  // Toujours pas d'erreur générique : la page se charge.
  await expect(page.getByRole('heading', { name: 'Nouvelle campagne' })).toBeVisible();
  await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);

  // Étape 1 -> 2 (Bénéficiaire), où l'absence d'équipe/club géré doit
  // afficher un message clair plutôt qu'un formulaire cassé ou un plantage.
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Aucune équipe gérée.')).toBeVisible();
  await expect(page.getByText('Aucun club géré.')).toBeVisible();
});
