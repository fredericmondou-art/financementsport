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

/**
 * URL publique du site (Tâche 1.4.5), utilisée pour `metadataBase` et les
 * URLs absolues d'images Open Graph. Contrairement à `getEnv`, ne lance
 * jamais d'erreur : l'absence de cette variable ne doit pas faire échouer
 * le rendu d'une page (juste des aperçus de partage social moins précis),
 * donc on retombe sur le défaut de développement local.
 */
export function getPublicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
