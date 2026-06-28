import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Back-office produits (demande directe de l'utilisateur -- voir
 * docs/DECISIONS.md) : un `platform_admin` crée un produit depuis
 * `/produits/nouveau`, le retrouve dans `/produits`, et le voit apparaître
 * dans la boutique publique une fois actif. Couvre aussi la modification
 * (désactivation) depuis `/produits/[productId]`.
 *
 * Même limitation d'exécution que les autres specs e2e de ce projet (réseau
 * du bac à sable bloqué, voir docs/DECISIONS.md) -- à exécuter en CI ou en
 * local contre une URL déployée.
 *
 * Prérequis : `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
 */

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

test('platform_admin crée un produit, le retrouve dans /produits puis dans la boutique', async ({ page }) => {
  const email = `test-produits-admin-${Date.now()}@example.com`;
  const password = 'mot-de-passe-test-12345';
  const productName = `Produit Test E2E ${Date.now()}`;

  // 1. Compte élevé à platform_admin (même provisionnement que
  //    campagnes-liste.spec.ts : le rôle n'est modifiable que via le
  //    service-role, aucun parcours d'inscription ne donne ce rôle).
  await page.goto('/signup');
  await page.getByLabel('Nom complet').fill('Admin Produits E2E');
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
  const { error: roleError } = await supabase.from('profiles').update({ role: 'platform_admin' }).eq('id', userId);
  if (roleError) throw roleError;

  // 2. Le lien de nav "Produits" mène à la liste, vide de ce produit pour
  //    l'instant.
  await page.goto('/compte');
  await page.getByRole('link', { name: 'Produits' }).click();
  await expect(page).toHaveURL(/\/produits$/);
  await expect(page.getByRole('heading', { name: 'Produits' })).toBeVisible();
  await expect(page.getByText(productName)).toHaveCount(0);

  // 3. Création -- champs minimaux + valeurs par défaut (taxable/actif
  //    cochés par défaut, voir product-form.tsx).
  await page.getByRole('link', { name: 'Nouveau produit' }).click();
  await expect(page).toHaveURL(/\/produits\/nouveau$/);
  await page.getByLabel('Nom').fill(productName);
  await page.getByLabel('Prix (en centimes)').fill('2500');
  await page.getByRole('button', { name: 'Créer le produit' }).click();

  await expect(page).toHaveURL(/\/produits\/[^/]+\?avis=/);
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();
  await expect(page.getByText('Produit créé.')).toBeVisible();

  // 4. Visible dans la liste admin...
  await page.goto('/produits');
  await expect(page.getByText(productName)).toBeVisible();

  // 5. ...et dans la boutique publique, puisqu'actif par défaut.
  await page.goto('/boutique');
  await expect(page.getByText(productName)).toBeVisible();

  // 6. Désactivation depuis la page de modification : disparaît de la
  //    boutique publique sans être supprimé du catalogue admin.
  await page.goto('/produits');
  const productRow = page.getByRole('row', { name: new RegExp(productName) });
  await productRow.getByRole('link', { name: 'Modifier' }).click();
  await expect(page).toHaveURL(/\/produits\/[^/]+$/);
  await page.getByLabel('Actif (visible en boutique)').uncheck();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Produit mis à jour.')).toBeVisible();

  await page.goto('/boutique');
  await expect(page.getByText(productName)).toHaveCount(0);

  await page.goto('/produits');
  await expect(page.getByText(productName)).toBeVisible();
});
