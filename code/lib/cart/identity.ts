/**
 * Résolution de l'identité panier (Tâche 1.4) côté serveur : utilisateur
 * connecté, sinon jeton de session invité via cookie.
 *
 * Le cookie est `httpOnly` (jamais lu/modifié en JS côté client — pas
 * nécessaire, le panier invité se manipule via les routes `app/api/cart/*`)
 * et `secure` en production (CLAUDE.md section 5 : pas de secret/jeton de
 * session exposé inutilement).
 */
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import type { CartIdentity } from './types';

const GUEST_SESSION_COOKIE = 'panier_session';
const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function getOrCreateGuestSessionToken(): string {
  const store = cookies();
  const existing = store.get(GUEST_SESSION_COOKIE)?.value;
  if (existing) {
    return existing;
  }
  const token = randomUUID();
  try {
    store.set(GUEST_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    });
  } catch {
    // Server Component en lecture seule -- voir le commentaire équivalent
    // dans lib/auth/supabase-server.ts. Le jeton généré reste utilisable
    // pour cette requête ; il sera simplement régénéré à la prochaine
    // requête si l'écriture du cookie n'a pas pu avoir lieu ici.
  }
  return token;
}

/** Identité à utiliser pour `lib/cart/*.ts` : utilisateur connecté en
 * priorité, sinon jeton de session invité (créé au besoin). */
export async function resolveCartIdentity(): Promise<CartIdentity> {
  const user = await getCurrentUser();
  if (user) {
    return { userId: user.id, sessionToken: null };
  }
  return { userId: null, sessionToken: getOrCreateGuestSessionToken() };
}

/** Jeton de session invité actuel, sans en créer un nouveau -- utilisé pour
 * le rattachement après connexion (le cookie existe déjà forcément si un
 * panier invité a été créé avant la connexion). */
export function getExistingGuestSessionToken(): string | null {
  return cookies().get(GUEST_SESSION_COOKIE)?.value ?? null;
}
