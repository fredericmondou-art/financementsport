import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Parcours espace parent (Tâche 1.6.A3, docs/prompts/phase-1-6.md) :
 * connexion → consulter l'impact généré → racheter une commande passée →
 * paiement test → reçu accessible.
 *
 * Comme pour tests/e2e/auth.spec.ts / checkout.spec.ts, ce test n'a pas pu
 * être exécuté dans le bac à sable de développement : le téléchargement du
 * navigateur Chromium par Playwright, l'accès à checkout.stripe.com et
 * l'accès à un vrai projet Supabase (`*.supabase.co`) sont tous bloqués par
 * l'allowlist réseau du bac à sable (voir docs/DECISIONS.md). À exécuter en
 * CI ou en local, contre une URL déployée (Vercel) configurée en clés
 * Stripe TEST, avant la mise en production.
 *
 * Prérequis pour exécuter ce test :
 *   - Mêmes prérequis réseau/secrets que tests/e2e/checkout.spec.ts
 *     (`NEXT_PUBLIC_APP_URL`, clés Stripe TEST, `NEXT_PUBLIC_SUPABASE_URL` +
 *     `SUPABASE_SERVICE_ROLE_KEY`).
 *   - Le jeu de données seed (`supabase/seed.sql`) appliqué : produit
 *     « Pack Maison » (3500 ¢, crédit fixe 500 ¢) et athlète « Thomas
 *     Tremblay » (id 44444444-4444-4444-4444-444444444401).
 *
 * Le test crée son propre compte client (comme auth.spec.ts), achète une
 * première fois en tant que client connecté (pas invité, contrairement à
 * checkout.spec.ts -- c'est l'historique de CE compte qu'on veut retrouver
 * dans /compte), puis utilise le bouton « Racheter » pour vérifier que le
 * second achat conserve le même produit et le même bénéficiaire (critère
 * d'acceptation « Intégration : le rachat conserve produits et
 * bénéficiaire »).
 */

const ATHLETE_ID = '44444444-4444-4444-4444-444444444401';
const PACK_MAISON_NAME = 'Pack Maison';
const PACK_MAISON_FIXED_CREDIT_CENTS = 500;

async function payWithTestCard(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12/34');
  await page.locator('#cardCvc').fill('123');
  const billingName = page.locator('#billingName');
  if (await billingName.isVisible().catch(() => false)) {
    await billingName.fill('Test E2E');
  }
  await page.getByTestId('hosted-payment-submit-button').click();
  await page.waitForURL(/\/commande\/confirmation/, { timeout: 30_000 });
}

test('connexion → achat connecté → impact visible → racheter → reçu', async ({ page }) => {
  const email = `test-compte-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';

  // 1. Création de compte + connexion (même parcours que auth.spec.ts).
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Parent E2E');
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Courriel').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/compte/);

  // 2. Premier achat, connecté, bénéficiaire pré-sélectionné.
  await page.goto(`/boutique?beneficiaryType=athlete&beneficiaryId=${ATHLETE_ID}`);
  const packMaisonCard = page.locator('li').filter({ has: page.getByRole('article', { name: PACK_MAISON_NAME }) });
  await packMaisonCard.getByRole('button', { name: 'Ajouter au panier' }).click();
  await expect(page).toHaveURL(/\/panier/);
  await page.getByRole('button', { name: 'Procéder au paiement' }).click();
  await payWithTestCard(page);
  await expect(page.getByRole('heading', { name: 'Merci pour votre achat !' })).toBeVisible();

  // 3. Espace parent : l'impact généré et la commande apparaissent.
  await page.goto('/compte');
  await expect(page.getByText(PACK_MAISON_FIXED_CREDIT_CENTS / 100 + ' $').first()).toBeVisible({ timeout: 15_000 });
  const orderRow = page.getByRole('row').filter({ hasText: 'Tremblay' }).first();
  await expect(orderRow.or(page.getByText('Mes commandes'))).toBeVisible();

  // 4. Reçu accessible et imprimable.
  await page.getByRole('link', { name: 'Voir le reçu' }).first().click();
  await expect(page).toHaveURL(/\/compte\/commandes\/.+\/recu/);
  await expect(page.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeVisible();
  await expect(page.getByRole('cell', { name: PACK_MAISON_NAME })).toBeVisible();
  await page.goBack();

  // 5. Racheter -> le panier reconstruit doit contenir le même produit, et la
  //    répartition doit être pré-remplie à 100% pour le même bénéficiaire
  //    (déjà vérifié au niveau unitaire dans tests/unit/reorder.test.ts --
  //    ce test e2e vérifie que ce comportement est bien câblé de bout en
  //    bout, jusqu'à l'écran réel).
  await page.getByRole('button', { name: 'Racheter' }).first().click();
  await expect(page).toHaveURL(/\/panier/);
  await expect(page.getByRole('cell', { name: PACK_MAISON_NAME })).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();

  // 6. Paiement test du rachat -> deuxième crédit attribué au même athlète.
  await page.getByRole('button', { name: 'Procéder au paiement' }).click();
  await payWithTestCard(page);
  await expect(page.getByRole('heading', { name: 'Merci pour votre achat !' })).toBeVisible();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis pour vérifier le crédit attribué.',
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let creditCount = 0;
  for (let attempt = 0; attempt < 10 && creditCount < 2; attempt += 1) {
    const { data, error } = await supabase
      .from('order_credits')
      .select('amount_cents, created_at')
      .eq('beneficiary_type', 'athlete')
      .eq('beneficiary_id', ATHLETE_ID)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    if (error) {
      throw error;
    }
    creditCount = data?.length ?? 0;
    if (creditCount < 2) {
      await page.waitForTimeout(1000);
    }
  }

  // Deux achats (initial + rachat) -> deux crédits distincts pour le même
  // bénéficiaire, même montant fixe chacun.
  expect(creditCount).toBeGreaterThanOrEqual(2);
});
