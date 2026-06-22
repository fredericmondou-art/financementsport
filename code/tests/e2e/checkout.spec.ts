import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Parcours d'achat complet en mode TEST Stripe (Tâche 1.4.6, critère
 * d'acceptation : « Un parcours d'achat en mode TEST fonctionne en ligne de
 * bout en bout (page → achat test → crédit attribué), webhook compris »).
 *
 * Comme pour tests/e2e/auth.spec.ts et tests/e2e/public-profile.spec.ts, ce
 * test n'a pas pu être exécuté dans le bac à sable de développement : le
 * téléchargement du navigateur Chromium par Playwright, l'accès à
 * checkout.stripe.com et l'accès à un vrai projet Supabase (`*.supabase.co`)
 * sont tous bloqués par l'allowlist réseau du bac à sable (voir
 * docs/DECISIONS.md). À exécuter en CI ou en local, contre une URL déployée
 * (Vercel) configurée en clés Stripe TEST, avant la mise en production.
 *
 * Prérequis pour exécuter ce test :
 *   - `NEXT_PUBLIC_APP_URL` (ou `use.baseURL` de playwright.config.ts) doit
 *     pointer vers le déploiement à tester, avec des clés Stripe TEST
 *     (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` en mode test) et le
 *     webhook Stripe configuré sur cette URL.
 *   - `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dans
 *     l'environnement d'exécution du test (mêmes valeurs que le déploiement
 *     visé), pour vérifier le crédit après paiement -- la vérification
 *     contourne RLS volontairement (clé service_role), exactement comme le
 *     ferait le webhook lui-même ; jamais utiliser ces identifiants dans le
 *     navigateur/l'app cliente.
 *   - Le jeu de données seed (`supabase/seed.sql`) doit être appliqué sur ce
 *     projet : produit « Pack Maison » (id 55555555-5555-5555-5555-555555555501,
 *     prix 3500 ¢, crédit fixe 500 ¢) et athlète « Thomas Tremblay »
 *     (id 44444444-4444-4444-4444-444444444401).
 *
 * Carte de test Stripe utilisée : 4242 4242 4242 4242 (succès direct, pas de
 * 3-D Secure) -- https://stripe.com/docs/testing.
 */

const ATHLETE_ID = '44444444-4444-4444-4444-444444444401';
const PACK_MAISON_NAME = 'Pack Maison';
const PACK_MAISON_FIXED_CREDIT_CENTS = 500;

test('achat d’un pack avec bénéficiaire pré-sélectionné -> paiement Stripe test -> crédit attribué', async ({
  page,
}) => {
  // 1. Boutique avec bénéficiaire pré-sélectionné (lien "Encourager" simulé
  //    via les mêmes paramètres de requête que app/(shop)/boutique/page.tsx).
  await page.goto(`/boutique?beneficiaryType=athlete&beneficiaryId=${ATHLETE_ID}`);

  const packMaisonCard = page.locator('li').filter({ has: page.getByRole('article', { name: PACK_MAISON_NAME }) });
  await packMaisonCard.getByRole('button', { name: 'Ajouter au panier' }).click();

  // 2. Panier : la répartition doit avoir été pré-remplie à 100% pour cet
  //    athlète (voir app/(shop)/panier/actions.ts, addItemAction).
  await expect(page).toHaveURL(/\/panier/);
  await expect(page.getByText('100%')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Procéder au paiement' })).toBeVisible();

  // 3. Déclenche checkoutAction -> redirection vers Stripe Checkout hébergé.
  await page.getByRole('button', { name: 'Procéder au paiement' }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });

  // 4. Complète le paiement avec la carte de test Stripe (succès direct).
  await page.locator('#email').fill(`e2e-${Date.now()}@example.com`);
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('12/34');
  await page.locator('#cardCvc').fill('123');
  const billingName = page.locator('#billingName');
  if (await billingName.isVisible().catch(() => false)) {
    await billingName.fill('Test E2E');
  }
  await page.getByTestId('hosted-payment-submit-button').click();

  // 5. Retour sur notre page de confirmation (success_url de
  //    lib/checkout/create-checkout-session.ts).
  await page.waitForURL(/\/commande\/confirmation/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Merci pour votre achat !' })).toBeVisible();

  // 6. Vérifie que le webhook checkout.session.completed a bien attribué le
  //    crédit au bon bénéficiaire (lecture directe en base, service_role,
  //    car cette commande invité n'est pas lisible via RLS public -- voir
  //    la décision documentée dans app/(shop)/commande/confirmation/page.tsx).
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

  // Le webhook peut arriver une fraction de seconde après la redirection du
  // client (CLAUDE.md section 4) -- on tolère un court délai avant d'échouer.
  let creditRow: { amount_cents: number; created_at: string } | null = null;
  for (let attempt = 0; attempt < 10 && !creditRow; attempt += 1) {
    const { data, error } = await supabase
      .from('order_credits')
      .select('amount_cents, created_at')
      .eq('beneficiary_type', 'athlete')
      .eq('beneficiary_id', ATHLETE_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data && Date.now() - new Date(data.created_at).getTime() < 2 * 60 * 1000) {
      creditRow = data;
      break;
    }
    await page.waitForTimeout(1000);
  }

  expect(creditRow).not.toBeNull();
  expect(creditRow?.amount_cents).toBe(PACK_MAISON_FIXED_CREDIT_CENTS);
});
