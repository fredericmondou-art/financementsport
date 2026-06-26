/**
 * Pied de page (Tâche 1.4.3, enrichi Tâche 1.4b.5 avec les liens vers les
 * pages de confiance — À propos, Confidentialité, Conditions,
 * Remboursement et livraison, Contact — désormais créées, voir
 * docs/DECISIONS.md).
 */
import Link from 'next/link';

export function SiteFooter(): JSX.Element {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__bar">
        <p>© {year} Plateforme de financement sportif — Québec, Canada.</p>
        <nav aria-label="Pied de page">
          <ul className="site-footer__links">
            <li>
              <Link href="/">Accueil</Link>
            </li>
            <li>
              <Link href="/boutique">Boutique</Link>
            </li>
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
    </footer>
  );
}
