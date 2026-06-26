import { test, expect } from '@playwright/test';

/**
 * Tâche 1.4b.3 (docs/prompts/phase-1-4b.md) : chaque carte produit/pack de
 * la boutique doit afficher une image (ou un remplacement neutre si absente),
 * avec des cartes de hauteur égale et le bouton "Ajouter au panier" aligné.
 *
 * Aucun produit du jeu de données seed (supabase/seed.sql) n'a de
 * `image_url` aujourd'hui -- voir components/product-card.tsx. Ce test
 * vérifie donc surtout le remplacement visuel neutre (pas de "trou" dans la
 * carte) et l'intégrité structurelle attendue par tests/e2e/checkout.spec.ts
 * (`<article aria-label>` + bouton "Ajouter au panier" dans le même `<li>`).
 *
 * Comme pour tests/e2e/checkout.spec.ts, ce test n'a pas pu être exécuté
 * dans le bac à sable de développement : le serveur Next.js local échoue à
 * démarrer ici (police Google Fonts "Inter" non accessible, allowlist
 * réseau du bac à sable -- voir docs/DECISIONS.md), avant même d'atteindre
 * Playwright/Chromium (non installé ici non plus). À exécuter en CI ou en
 * local avec accès réseau complet.
 */
test('chaque carte de la boutique affiche une image ou un remplacement neutre, avec le bouton aligné', async ({
  page,
}) => {
  await page.goto('/boutique');

  const cards = page.locator('.product-grid > li');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);

    // Chaque carte garde son <article aria-label> (requis par
    // tests/e2e/checkout.spec.ts) et son image OU son remplacement -- jamais
    // ni l'un ni l'autre.
    await expect(card.getByRole('article')).toBeVisible();
    const placeholder = card.getByRole('img', { name: 'Aucune image pour ce produit' });
    const realImage = card.locator('.product-card__image-img');
    const hasPlaceholder = await placeholder.isVisible().catch(() => false);
    const hasRealImage = await realImage.isVisible().catch(() => false);
    expect(hasPlaceholder || hasRealImage).toBe(true);

    // Le bouton "Ajouter au panier" reste un descendant du même <li> que la
    // carte (structure inchangée, voir app/(shop)/boutique/page.tsx).
    await expect(card.getByRole('button', { name: 'Ajouter au panier' })).toBeVisible();
  }

  // Hauteur égale (Tâche 1.4b.3, voir app/globals.css
  // `.product-grid > li > .card { flex: 1 }`) : toutes les cartes d'une même
  // rangée doivent avoir la même hauteur rendue.
  const heights = await cards.evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect().height));
  const distinctHeights = new Set(heights.map((h) => Math.round(h)));
  // Avec un seul style de carte et le même contenu de seed (4 packs, même
  // forme), toutes les hauteurs doivent converger -- une grille en colonnes
  // multiples peut former plusieurs rangées, donc on tolère au plus 2
  // hauteurs distinctes (rangées différentes selon la largeur du viewport),
  // jamais une dispersion plus large qui indiquerait un bouton mal aligné.
  expect(distinctHeights.size).toBeLessThanOrEqual(2);
});

test.describe('mobile (viewport étroit)', () => {
  test.use({ viewport: { width: 375, height: 720 } });

  test('les cartes restent alignées et affichent un remplacement neutre sur mobile', async ({ page }) => {
    await page.goto('/boutique');

    const firstCard = page.locator('.product-grid > li').first();
    await expect(firstCard.getByRole('img', { name: 'Aucune image pour ce produit' })).toBeVisible();
    await expect(firstCard.getByRole('button', { name: 'Ajouter au panier' })).toBeVisible();
  });
});
