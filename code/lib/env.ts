/**
 * Lecture d'une variable d'environnement obligatoire. Lance une erreur
 * explicite (plutôt qu'un `undefined` silencieux) si elle est absente.
 * Utilisé par tous les constructeurs de client Supabase
 * (`lib/db/supabase-client.ts`, `lib/auth/supabase-server.ts`) pour éviter
 * la duplication.
 */
export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}
