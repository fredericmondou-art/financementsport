/**
 * Pied de page (Tâche 1.4.3). Volontairement minimal en V1 — pas de pages
 * légales/CGU à lier encore (hors scope Phase 1.4, voir CLAUDE.md section
 * 10 : ne pas anticiper). À enrichir quand ces pages existeront.
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
          </ul>
        </nav>
      </div>
    </footer>
  );
}
