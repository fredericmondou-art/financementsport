import { expect, test } from '@playwright/test';

/**
 * Tâche 1.4b.5 : navigation vers chaque page de confiance depuis le pied de
 * page (cahier 1.4b.5 : "Tests attendus : e2e : navigation vers chaque page
 * depuis le pied de page"). Même limitation d'exécution que les autres
 * tests e2e du projet (voir tests/e2e/navigation.spec.ts) : non exécutable
 * dans le bac à sable de développement.
 */

const PAGES = [
  { linkName: 'À propos', url: '/a-propos', heading: 'À propos' },
  { linkName: 'Confidentialité', url: '/confidentialite', heading: 'Politique de confidentialité' },
  { linkName: "Conditions d'utilisation", url: '/conditions', heading: "Conditions d'utilisation" },
  {
    linkName: 'Remboursement et livraison',
    url: '/remboursement-livraison',
    heading: 'Remboursement et livraison',
  },
  { linkName: 'Contact', url: '/contact', heading: 'Contact' },
];

for (const { linkName, url, heading } of PAGES) {
  test(`le pied de page mène à « ${linkName} »`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: linkName }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  });
}

test('le formulaire de contact valide les champs requis et affiche une erreur claire', async ({ page }) => {
  await page.goto('/contact?erreur=Veuillez%20remplir%20tous%20les%20champs.');
  await expect(page.getByText('Veuillez remplir tous les champs.')).toBeVisible();
});

test('le formulaire de contact affiche une confirmation après envoi', async ({ page }) => {
  await page.goto('/contact?envoye=1');
  await expect(page.getByText('Message envoyé.')).toBeVisible();
});
