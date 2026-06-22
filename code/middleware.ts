/**
 * Tâche 1.4.3 : seul but de ce middleware — transmettre le chemin courant aux
 * Server Components via un en-tête de requête (`x-pathname`), pour que
 * `components/nav/site-header.tsx` puisse mettre en évidence le lien actif
 * SANS devenir un composant client (`usePathname` exigerait `'use client'`).
 * Aucune logique d'authentification ou de sécurité ici : RLS + `getCurrentUser`
 * restent la seule source de vérité pour qui a accès à quoi.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Exclut les assets statiques/Next internes ; toutes les pages passent par
  // ce middleware (site public, boutique, portails, auth).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
