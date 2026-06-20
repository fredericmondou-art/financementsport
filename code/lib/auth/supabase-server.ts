/**
 * Client Supabase côté serveur (Server Components, Route Handlers, Server
 * Actions), avec gestion des cookies de session via `@supabase/ssr`.
 *
 * Utilise la clé anon : respecte RLS. Ne JAMAIS utiliser ce client pour des
 * opérations qui doivent contourner RLS (voir `createSupabaseServiceClient`
 * dans `lib/db/supabase-client.ts` pour ça, réservé aux webhooks/cron).
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

/**
 * À appeler uniquement dans un contexte serveur (Server Component, Route
 * Handler, Server Action). Lit/écrit les cookies de session Supabase.
 *
 * Dans un Server Component pur (lecture seule), `set`/`remove` échouent
 * silencieusement par design de Next.js (cookies en lecture seule hors
 * Route Handler/Server Action) — Supabase gère ce cas, ce n'est pas une
 * erreur à traiter ici.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const cookieStore = cookies();
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Lecture seule (Server Component) — voir commentaire ci-dessus.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Idem.
        }
      },
    },
  });
}
