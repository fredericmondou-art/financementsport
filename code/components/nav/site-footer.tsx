/**
 * Pied de page (Tâche 1.4.3, enrichi Tâche 1.4b.5 avec les liens vers les
 * pages de confiance — À propos, Confidentialité, Conditions,
 * Remboursement et livraison, Contact — désormais créées, voir
 * docs/DECISIONS.md).
 *
 * Restructuré en plan du site à 3 colonnes pour la Tâche V3 (refonte
 * visuelle) : le pied de page à une seule rangée se sentait « fade et trop
 * vide » (cahier 07-prompts-refonte-visuelle.md). Les noms et chemins de
 * lien restent identiques mot pour mot pour ne pas casser
 * tests/e2e/pages-confiance.spec.ts (requêtes scopées à `contentinfo`).
 *
 * Correction (Tâche V4) : le lien « Trouver un athlète » de la colonne
 * Naviguer a été renommé « Annuaire des athlètes » (même `/trouver`) — le
 * texte original dupliquait le nom accessible du bouton d'entrée du même nom
 * sur la page d'accueil (`app/(public)/page.tsx`), ce qui aurait fait
 * échouer `tests/e2e/accueil-confiance.spec.ts` (requête non scopée, mode
 * strict Playwright) dès que les deux pages seraient testées ensemble. Voir
 * docs/DECISIONS.md (entrée Tâche V4).
 */
import Link from 'next/link';

export function SiteFooter(): JSX.Element {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <p className="site-footer__brand-name">Plateforme de financement sportif</p>
          <p className="site-footer__tagline">
            On aide les familles à financer le sport de leurs jeunes, un encouragement à la fois.
          </p>
          <p className="site-footer__locale">Fièrement basée au Québec, Canada.</p>
        </div>

        <nav aria-label="Navigation du pied de page">
          <p className="site-footer__col-title">Naviguer</p>
          <ul className="site-footer__links">
            <li>
              <Link href="/">Accueil</Link>
            </li>
            <li>
              <Link href="/boutique">Boutique</Link>
            </li>
            <li>
              <Link href="/trouver">Annuaire des athlètes</Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Pages de confiance">
          <p className="site-footer__col-title">Confiance</p>
          <ul className="site-footer__links">
            <li>
              <Link href="/a-propos">À propos</Link>
            </li>
            <li>
              <Link href="/confidentialite">Confidentialité</Link>
            </li>
            <li>
              <Link href="/conditions">Conditions d&apos;utilisation</Link>
            </li>
            <li>
              <Link href="/remboursement-livraison">Remboursement et livraison</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="site-footer__bottom">
        <p>© {year} Plateforme de financement sportif. Tous droits réservés.</p>
      </div>
    </footer>
  );
}
