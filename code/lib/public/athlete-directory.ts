/**
 * Annuaire public des athlètes (Tâche 1.4b.2 — bouton "Trouver un athlète"
 * de l'accueil). Avant cette tâche, aucune page ne permettait de découvrir
 * un athlète à soutenir autrement que via un lien direct partagé par
 * lui-même (affiche/QR) -- le bouton de l'accueil n'avait donc nulle part
 * où mener. `filterAthleteDirectory` est une fonction pure (testable sans
 * réseau) ; la lecture réelle se fait via `PublicProfileRepo.listAthletes`
 * (lib/public/profile.ts), qui ne lit que la vue publique `v_public_athlete`
 * (CLAUDE.md section 5 : jamais les tables brutes depuis une page publique).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabasePublicProfileRepo,
  type PublicAthleteRow,
  type PublicProfileRepo,
} from './profile';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Filtre en mémoire sur le nom affiché, le sport et la ville. `query` vide
 * (ou seulement des espaces) renvoie l'annuaire complet, dans l'ordre déjà
 * trié par le repo (alphabétique par nom affiché).
 */
export function filterAthleteDirectory(rows: PublicAthleteRow[], query: string | undefined): PublicAthleteRow[] {
  const needle = normalize(query ?? '');
  if (!needle) {
    return rows;
  }
  return rows.filter((row) => {
    const haystack = [row.display_name, row.sport, row.city].filter(Boolean).join(' ');
    return normalize(haystack).includes(needle);
  });
}

export async function loadAthleteDirectory(
  supabase: SupabaseClient,
  query: string | undefined,
  repo: PublicProfileRepo = createSupabasePublicProfileRepo(supabase),
): Promise<PublicAthleteRow[]> {
  const rows = await repo.listAthletes();
  return filterAthleteDirectory(rows, query);
}
