/**
 * En-tête du site (Tâche 1.4.3) : marque, navigation principale, actions de
 * compte, et menu mobile. Server Component async — aucune logique métier,
 * juste de la lecture (rôle courant via `getCurrentUser`, chemin courant via
 * l'en-tête `x-pathname`).
 *
 * Navigation adaptée au rôle (CLAUDE.md section 50/règles 1.4.3) :
 * - visiteur (non connecté) : Accueil, Boutique, Panier, Se connecter.
 * - connecté : + Mon compte, + Se déconnecter.
 * - responsable d'équipe/club (rôle direct OU via une adhésion `memberships`,
 *   voir lib/auth/permissions.ts) : + Campagnes.
 * - `platform_admin` : + Dashboard, Produits, Versements (back-office --
 *   demande directe de l'utilisateur pour /produits, voir docs/DECISIONS.md ;
 *   les pages /dashboard et /versements existaient déjà mais n'avaient encore
 *   aucun lien de navigation, ce qui était devenu incohérent avec le
 *   commentaire précédent de ce fichier -- corrigé dans la même tâche).
 *
 * Menu mobile (`<details>`/`<summary>` natif, pas de JS) : seul visible sous
 * 768px via CSS (voir app/globals.css), desktop nav masquée à l'inverse —
 * voir docs/DECISIONS.md pour le choix de cette implémentation sans nouvelle
 * exception `'use client'`.
 *
 * Refonte visuelle Tâche V3 : marque (icône SVG décorative) + repère pill
 * pour le lien actif (voir .nav-link--active dans app/globals.css) + icône
 * hamburger dans le bouton du menu mobile. Présentation seulement, aucun
 * changement de comportement ou de nom accessible (voir docs/DECISIONS.md).
 */
import { headers } from 'next/headers';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { logoutAction } from '@/app/(auth)/login/actions';
import { Button } from '@/components/ui/button';
import { NavLink } from './nav-link';

interface PrimaryNavItem {
  href: string;
  label: string;
}

export async function SiteHeader(): Promise<JSX.Element> {
  const pathname = headers().get('x-pathname') ?? '/';
  const user = await getCurrentUser();

  const isManager =
    user?.role === 'team_manager' ||
    user?.role === 'club_admin' ||
    (user?.memberships.some((m) => m.role === 'team_manager' || m.role === 'club_admin') ?? false);

  const primaryItems: PrimaryNavItem[] = [
    { href: '/', label: 'Accueil' },
    { href: '/boutique', label: 'Boutique' },
  ];
  if (isManager) {
    primaryItems.push({ href: '/campagnes', label: 'Campagnes' });
  }
  if (user?.role === 'platform_admin') {
    primaryItems.push(
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/produits', label: 'Produits' },
      { href: '/versements', label: 'Versements' },
    );
  }

  return (
    <header className="site-header">
      <a className="skip-link" href="#contenu-principal">
        Aller au contenu principal
      </a>

      <div className="site-header__bar">
        <Link href="/" className="site-header__brand">
          <svg className="site-header__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="11" fill="var(--color-primary)" />
            <path
              d="M12 6.3l1.9 3.7 4.1.6-3 2.9.7 4.1-3.7-1.9-3.7 1.9.7-4.1-3-2.9 4.1-.6z"
              fill="var(--color-on-primary)"
            />
          </svg>
          <span>Plateforme de financement sportif</span>
        </Link>

        <nav className="site-header__nav" aria-label="Navigation principale">
          <ul className="site-header__nav-list">
            {primaryItems.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} pathname={pathname}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__actions">
          <NavLink href="/panier" pathname={pathname}>
            Panier
          </NavLink>
          {user ? (
            <>
              <NavLink href="/compte" pathname={pathname}>
                Mon compte
              </NavLink>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" size="sm">
                  Se déconnecter
                </Button>
              </form>
            </>
          ) : (
            <Button href="/login" variant="outline" size="sm">
              Se connecter
            </Button>
          )}
        </div>

        <details className="mobile-nav">
          <summary className="mobile-nav__toggle" aria-label="Ouvrir le menu de navigation">
            <svg className="mobile-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M3 6h18M3 12h18M3 18h18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Menu
          </summary>
          <nav className="mobile-nav__panel" aria-label="Navigation mobile">
            <ul>
              {primaryItems.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} pathname={pathname}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink href="/panier" pathname={pathname}>
                  Panier
                </NavLink>
              </li>
              {user ? (
                <>
                  <li>
                    <NavLink href="/compte" pathname={pathname}>
                      Mon compte
                    </NavLink>
                  </li>
                  <li>
                    <form action={logoutAction}>
                      <Button type="submit" variant="outline" size="sm" fullWidth>
                        Se déconnecter
                      </Button>
                    </form>
                  </li>
                </>
              ) : (
                <li>
                  <Button href="/login" variant="outline" size="sm" fullWidth>
                    Se connecter
                  </Button>
                </li>
              )}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
