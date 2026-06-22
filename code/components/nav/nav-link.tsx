/**
 * Lien de navigation qui indique la page active (Tâche 1.4.3). Server
 * Component pur : reçoit le chemin courant en prop (lu depuis l'en-tête
 * `x-pathname` posé par `middleware.ts`) plutôt que d'utiliser le hook client
 * `usePathname`, pour ne pas ajouter d'exception `'use client'`.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface NavLinkProps {
  href: string;
  pathname: string;
  children: ReactNode;
  className?: string;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, pathname, children, className }: NavLinkProps): JSX.Element {
  const active = isActivePath(pathname, href);
  const classes = ['nav-link', active ? 'nav-link--active' : '', className ?? ''].filter(Boolean).join(' ');

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={classes}>
      {children}
    </Link>
  );
}
