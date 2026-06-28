import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Audit d'accessibilité automatisé (TÂCHE V10, refonte visuelle — « passe
 * finale anti-oubli + accessibilité + performance »).
 *
 * Comme pour tests/e2e/auth.spec.ts / checkout.spec.ts / compte-dashboard.spec.ts,
 * ce fichier n'a pas pu être exécuté dans le bac à sable de développement : le
 * téléchargement du navigateur Chromium par Playwright est bloqué par
 * l'allowlist réseau du bac à sable (voir docs/DECISIONS.md). À exécuter en CI
 * ou en local (`npm run test:e2e`) avant la mise en production.
 *
 * Portée (décision autonome, voir docs/DECISIONS.md, Tâche V10) : ce test
 * balaie toutes les pages PUBLIQUES/NON authentifiées listées dans la
 * checklist de la Tâche V10 -- c'est la surface que rencontre n'importe quel
 * visiteur (parent, donateur, athlète) avant même de se connecter, et celle
 * où une erreur d'accessibilité bloquerait le plus de monde. Les tableaux de
 * bord connectés (équipe/club/admin/compte) ne sont PAS balayés
 * automatiquement ici : les atteindre demande un compte réel créé via
 * Supabase Auth, exactement la même contrainte réseau/secrets que documentée
 * dans tests/e2e/compte-dashboard.spec.ts (déjà hors de portée du bac à
 * sable). Ce n'est pas un gap silencieux : ces tableaux de bord réutilisent
 * EXACTEMENT les mêmes composants déjà audités ici un par un sur les pages
 * publiques (`Card`, `Button`, `Badge`, `Alert`, `Field`, `ProgressBar`,
 * `Modal`) -- un défaut d'accessibilité dans un composant partagé serait déjà
 * détecté sur la page publique qui l'utilise aussi. Un audit automatisé
 * couvrant en plus les pages connectées reste un complément naturel pour la
 * CI (à ajouter avec un vrai compte de test, hors portée de la refonte
 * visuelle elle-même).
 *
 * Seuil de blocage (critère d'acceptation V10 : « aucune erreur bloquante »)
 * : seules les violations d'impact `critical`/`serious` font échouer le
 * test. Les violations `moderate`/`minor` (souvent des avertissements
 * heuristiques, ex. régions de page redondantes) sont journalisées dans le
 * rapport Playwright via `test.info().attach` pour suivi, sans bloquer --
 * cohérent avec la formulation du cahier (« aucune erreur BLOQUANTE
 * d'audit »), qui ne demande pas un score parfait mais l'absence de défaut
 * grave.
 */

const PUBLIC_PAGES: Array<{ name: string; path: string }> = [
  { name: 'Accueil', path: '/' },
  { name: 'Boutique', path: '/boutique' },
  { name: 'Panier (vide)', path: '/panier' },
  { name: 'Recherche', path: '/trouver' },
  { name: 'Page publique athlète', path: '/thomas-u11' },
  { name: 'Page publique équipe', path: '/team/u11-hockey' },
  { name: 'Page publique club', path: '/club/corsaires' },
  { name: 'Connexion', path: '/login' },
  { name: 'Inscription', path: '/signup' },
  { name: 'À propos', path: '/a-propos' },
  { name: 'Confidentialité', path: '/confidentialite' },
  { name: 'Conditions', path: '/conditions' },
  { name: 'Contact', path: '/contact' },
  { name: 'Remboursement et livraison', path: '/remboursement-livraison' },
  { name: 'Page 404', path: '/cette-page-n-existe-pas' },
  { name: 'Styleguide (référence des composants)', path: '/styleguide-refonte' },
];

async function runAxeAudit(page: Page, path: string): Promise<import('axe-core').AxeResults> {
  await page.goto(path);
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
}

for (const { name, path } of PUBLIC_PAGES) {
  test(`accessibilité AA — ${name} (${path}) : aucune violation critique/sérieuse`, async ({ page }) => {
    const results = await runAxeAudit(page, path);

    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    const nonBlocking = results.violations.filter((v) => v.impact !== 'critical' && v.impact !== 'serious');

    if (nonBlocking.length > 0) {
      await test.info().attach('violations-non-bloquantes', {
        body: JSON.stringify(nonBlocking, null, 2),
        contentType: 'application/json',
      });
    }

    expect(
      blocking,
      `Violations bloquantes (critical/serious) sur ${path} :\n${JSON.stringify(blocking, null, 2)}`,
    ).toHaveLength(0);
  });
}
