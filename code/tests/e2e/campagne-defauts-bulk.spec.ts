import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Parcours assistant de campagne — défauts intelligents + saisie d'athlètes
 * en lot (Tâche 1.6.B2, docs/prompts/phase-1-6.md). Couvre les deux critères
 * d'acceptation e2e demandés par le prompt :
 *   - « Création "tout par défaut" aboutit à une campagne activable » : les
 *     5 premières étapes sont validées SANS modifier aucun champ pré-rempli
 *     (`applyCampaignDefaults`, lib/campaigns/defaults.ts).
 *   - « Coller 15 noms les crée en une confirmation, doublons signalés » :
 *     l'étape « Participants » colle une liste de 15 lignes contenant UN
 *     doublon contre un athlète déjà existant dans l'équipe ET UN doublon
 *     répété DANS la liste collée elle-même (lib/athletes/bulk-add.ts).
 *
 * Comme tests/e2e/auth.spec.ts / checkout.spec.ts / compte-dashboard.spec.ts,
 * ce test n'a pas pu être exécuté dans le bac à sable de développement : le
 * téléchargement du navigateur Chromium par Playwright et l'accès à un vrai
 * projet Supabase (`*.supabase.co`) sont tous deux bloqués par l'allowlist
 * réseau du bac à sable (voir docs/DECISIONS.md). À exécuter en CI ou en
 * local, contre une URL déployée (Vercel), avant la mise en production.
 *
 * Prérequis pour exécuter ce test :
 *   - `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (mêmes
 *     prérequis que compte-dashboard.spec.ts).
 *   - Le jeu de données seed (`supabase/seed.sql`) appliqué : équipe
 *     « U11 Hockey » (id ci-dessous), déjà 3 athlètes dont « Thomas
 *     Tremblay », rattachée au club « Corsaires ».
 *
 * Provisionnement du rôle `team_manager` : `memberships` n'est inscriptible
 * que par `platform_admin` (RLS `memberships_write_admin`, CLAUDE.md section
 * 5) — le parcours public `/signup` ne peut donc jamais créer un compte
 * gestionnaire. Ce test crée son propre compte (comme les autres specs e2e)
 * puis lui accorde lui-même, via le client Supabase service-role, la ligne
 * `memberships` (role: 'team_manager', team_id: équipe seed) nécessaire pour
 * accéder à l'assistant — même usage du service-role que
 * compte-dashboard.spec.ts pour la vérification backend.
 */

const TEAM_ID = '33333333-3333-3333-3333-333333333301'; // U11 Hockey (seed)
const TEAM_NAME = 'U11 Hockey';
const EXISTING_DUPLICATE_NAME = 'Thomas Tremblay'; // déjà dans l'équipe (seed)

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

// 15 lignes : doublon n°1 contre un athlète déjà existant dans l'équipe
// (« Thomas Tremblay »), doublon n°2 répété dans la liste elle-même
// (« Felix Bilodeau » x2) -> 13 créations attendues, 2 doublons signalés.
const PASTED_LIST_15_NAMES = [
  EXISTING_DUPLICATE_NAME,
  'Felix Bilodeau',
  'Felix Bilodeau',
  'Alice Cote',
  'Benoit Roy',
  'Camille Pelletier',
  'David Morin',
  'Eve Bouchard',
  'Frederic Caron',
  'Gabrielle Fortin',
  'Hugo Lavoie',
  'Isabelle Belanger',
  'Julien Cloutier',
  'Karine Simard',
  'Laurent Beaulieu',
];

test('création "tout par défaut" + ajout de 15 athlètes en lot (doublons signalés)', async ({ page }) => {
  const email = `test-wizard-defauts-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';

  // 1. Création de compte (rôle 'client' par défaut, comme auth.spec.ts).
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Gestionnaire E2E');
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte/);

  // 2. Provisionnement du rôle team_manager (RLS interdit ceci en public).
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
  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ user_id: userId, role: 'team_manager', team_id: TEAM_ID });
  if (membershipError) {
    throw membershipError;
  }

  // 3. Assistant — étape 1 « Type & nom » : défaut accepté sans modification.
  await page.goto('/campagnes/nouvelle');
  await expect(page.getByRole('heading', { name: 'Nouvelle campagne' })).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue(new RegExp(TEAM_NAME));
  await page.getByRole('button', { name: 'Continuer' }).click();

  // 4. Étape 2 « Bénéficiaire » : équipe + bénéficiaire pré-remplis (l'équipe
  //    seed gérée par la nouvelle adhésion), aucune règle de crédit visible.
  await expect(page.locator('input[name="teamId"]')).toHaveValue(TEAM_ID);
  await expect(page.locator('input[name="beneficiaryId"]')).toHaveValue(TEAM_ID);
  await page.getByRole('button', { name: 'Continuer' }).click();

  // 5. Étape 3 « Objectif & dates » : dates par défaut (60 jours) acceptées.
  await expect(page.locator('input[name="startsAt"]')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Continuer' }).click();

  // 6. Étape 4 « Participants » : collage de 15 noms en une confirmation.
  await page.locator('textarea[name="pastedList"]').fill(PASTED_LIST_15_NAMES.join('\n'));
  await page.getByRole('button', { name: 'Ajouter la liste collée' }).click();

  await expect(page.getByText('13 athlète(s) ajouté(s)')).toBeVisible();
  await expect(page.getByText('2 doublon(s) ignoré(s)')).toBeVisible();
  await expect(page.getByText('en attente de consentement parental')).toBeVisible();
  // Les nouveaux athlètes sont automatiquement ajoutés aux participants.
  await expect(page.getByLabel('Felix Bilodeau')).toBeChecked();

  await page.getByRole('button', { name: 'Continuer' }).click();

  // 7. Étape 5 « Packs » : tous les packs actifs déjà sélectionnés par défaut.
  await expect(page.locator('input[name="productIds"]:checked')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Continuer' }).click();

  // 8. Étape 6 « Récap » : aucun réglage de taux/crédit visible, activation.
  //    (RecapStep, page.tsx, ne référence jamais credit_rules/share_bps — la
  //    seule mention de crédit est la phrase rassurante ci-dessous.)
  await expect(page.getByText(/Vous verrez ici uniquement le montant amassé/)).toBeVisible();
  await page.getByRole('button', { name: 'Lancer ma campagne' }).click();

  // 8.bis Écran de démarrage (Tâche 1.6.B3) : remplace l'ancien `?succes=`.
  await expect(page).toHaveURL(/\/campagnes\/[^/]+\/demarrage$/);
  await expect(page.getByRole('heading', { name: 'Campagne lancée !' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copier le lien' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copier le message' })).toBeVisible();

  // 9. Vérification backend : campagne active + 13 nouveaux athlètes, tous
  //    mineurs sans tuteur (non publiables tant qu'aucun consentement n'est
  //    enregistré — voir lib/entities/athletes.ts).
  const { data: campaignRows, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, beneficiary_type, beneficiary_id')
    .eq('beneficiary_type', 'team')
    .eq('beneficiary_id', TEAM_ID)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (campaignError) throw campaignError;
  expect(campaignRows?.length).toBe(1);

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: athleteRows, error: athleteError } = await supabase
    .from('athletes')
    .select('first_name, last_name, guardian_id, parental_consent_at')
    .eq('team_id', TEAM_ID)
    .gte('created_at', since);
  if (athleteError) throw athleteError;
  expect((athleteRows ?? []).length).toBeGreaterThanOrEqual(13);
  expect((athleteRows ?? []).every((row) => row.guardian_id === null && row.parental_consent_at === null)).toBe(
    true,
  );
});
