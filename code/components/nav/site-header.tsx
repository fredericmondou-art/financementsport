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
 *
 * Le rôle `platform_admin` ne voit pas encore de lien dédié : aucune page de
 * back-office n'existe à ce jour dans `(financement)`/`(operations)` (encore
 * de simples placeholders `.gitkeep`) — voir docs/DECISIONS.md. Un lien sera
 * ajouté quand ces pages existeront, plutôt que d'anticiper (CLAUDE.md
 * section 10).
 *
 * Menu mobile (`<details>`/`<summary>` natif, pas de JS) : seul visible sous
 * 768px via CSS (voir app/globals.css), desktop nav masquée à l'inverse —
 * voir docs/DECISIONS.md pour le choix de cette implémentation sans nouvelle
 * exception `'use client'`.
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
    primaryItems.push({ href: '/campagnes/nouvelle', label: 'Campagnes' });
  }

  return (
    <header className="site-header">
      <a className="skip-link" href="#contenu-principal">
        Aller au contenu principal
      </a>

      <div className="site-header__bar">
        <Link href="/" className="site-header__brand">
          Plateforme de financement sportif
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
