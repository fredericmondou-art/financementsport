/**
 * Clients Supabase.
 *
 * Deux clients distincts, jamais interchangeables :
 * - `createSupabaseBrowserClient` : utilise la clé anon, respecte RLS,
 *   safe à utiliser côté navigateur.
 * - `createSupabaseServiceClient` : utilise la clé service_role, contourne
 *   RLS. Réservé aux routes serveur de confiance (webhooks Stripe, cron,
 *   scripts admin). Ne jamais importer ce fichier dans un composant client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

export function createSupabaseBrowserClient(): SupabaseClient {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, anonKey);
}

export function createSupabaseServiceClient(): SupabaseClient {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
