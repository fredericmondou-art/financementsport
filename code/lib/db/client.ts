/**
 * Point d'entrée nommé `client.ts` attendu par la Tâche 0.2.
 *
 * La logique réelle des deux clients Supabase (navigateur / serveur) vit dans
 * `lib/db/supabase-client.ts` (créé en Tâche 0.1) afin de ne pas dupliquer le
 * code ni risquer une divergence entre deux implémentations. Ce fichier ne
 * fait que ré-exporter ces fonctions sous le nom de fichier attendu.
 *
 * - `createSupabaseBrowserClient` : clé anon, respecte RLS, safe côté
 *   navigateur (composants client).
 * - `createSupabaseServiceClient` : clé service_role, contourne RLS. Réservé
 *   aux routes serveur de confiance (API routes, Server Components, webhooks
 *   Stripe, scripts admin). Ne JAMAIS importer ce client dans un composant
 *   destiné au navigateur.
 *
 * Les deux fonctions lisent leurs URLs/clés depuis `process.env` et lèvent une
 * erreur explicite si une variable requise est absente (pas de valeur par
 * défaut silencieuse, voir `getEnv` dans supabase-client.ts).
 */
export { createSupabaseBrowserClient, createSupabaseServiceClient } from './supabase-client';
