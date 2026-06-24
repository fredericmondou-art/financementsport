/**
 * Saisie en lot d'athlètes par liste collée (Tâche 1.6.B2, voir
 * docs/prompts/phase-1-6.md). Réutilise `createAthlete`
 * (lib/entities/athletes.ts) ligne par ligne plutôt que de dupliquer ses
 * règles de permission/visibilité (CLAUDE.md section 6) — un gestionnaire qui
 * colle 15 noms obtient exactement les mêmes garanties qu'une saisie une à
 * une : mineur par défaut (`isMinor: true`), aucun `hide_*` ni consentement
 * parental accordé (le gestionnaire n'est jamais le tuteur), même
 * vérification `can(user, 'create', { type: 'athlete', teamId, ... })`.
 *
 * Parsing volontairement permissif (profil bénévole peu technique, voir le
 * prompt) : une ligne = un athlète, séparateurs tabulation OU virgule OU
 * simple espace tous acceptés ; « Prénom Nom », « Prénom, Nom » et
 * « Prénom, Nom, Catégorie » sont toutes des entrées valides. Une ligne sans
 * nom de famille identifiable est ignorée silencieusement plutôt que de
 * bloquer tout le collage.
 *
 * « Catégorie » du cahier des charges est mappée sur la colonne `sport`
 * existante (aucune colonne `category` au schéma, voir docs/DECISIONS.md) —
 * décision autonome.
 *
 * Mineur sans consentement : JAMAIS bloqué à la création (règle explicite du
 * prompt) — seulement signalé via `isAthletePubliclyVisible` (lib/entities/
 * athletes.ts, déjà la source de vérité, pas dupliquée ici).
 *
 * Pas de transaction multi-lignes (CLAUDE.md section 4 ne s'applique qu'à
 * l'argent) : chaque athlète est une entité indépendante, créée une à une via
 * `createAthlete`. Si une ligne échoue (ex: permission refusée sur l'équipe
 * ciblée), l'ensemble s'arrête immédiatement — en usage normal cela ne doit
 * jamais survenir, la cible étant toujours UNE équipe déjà choisie par le
 * gestionnaire à l'étape « Bénéficiaire ».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from '@/lib/auth/permissions';
import { createAthlete, isAthletePubliclyVisible, type AthleteRepo, type AthleteRow } from '@/lib/entities/athletes';

export interface ParsedAthleteRow {
  firstName: string;
  lastName: string;
  sport: string | null;
  /** Ligne brute d'origine, pour affichage dans un récap éventuel. */
  raw: string;
}

/** Normalise pour la comparaison de doublons : minuscules, accents retirés,
 * espaces multiples réduits — « Jean  Tremblay » et « jean tremblay » doivent
 * être détectés comme le même athlète. */
export function normalizeNameForDedupe(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((part) => part.trim());
  if (line.includes(',')) return line.split(',').map((part) => part.trim());
  return line.split(/\s+/);
}

/** Une ligne vide ou ne contenant qu'un seul mot (pas de nom de famille
 * identifiable) est ignorée silencieusement. */
export function parsePastedAthleteList(raw: string): ParsedAthleteRow[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = splitLine(line).filter((part) => part.length > 0);
      const [firstName, ...rest] = parts;
      const sport = parts.length > 2 ? parts[parts.length - 1] ?? null : null;
      const lastNameParts = parts.length > 2 ? rest.slice(0, -1) : rest;
      return {
        firstName: firstName ?? '',
        lastName: lastNameParts.join(' '),
        sport,
        raw: line,
      };
    })
    .filter((row) => row.firstName !== '' && row.lastName !== '');
}

export interface DuplicateAnnotatedRow extends ParsedAthleteRow {
  /** `true` si ce nom apparaît déjà plus tôt dans la même liste collée, OU
   * correspond à un athlète déjà existant dans l'équipe ciblée. */
  isDuplicate: boolean;
}

/**
 * Annote chaque ligne sans rien filtrer (« signaler les doublons évidents »,
 * le prompt — pas « bloquer ») ; `bulkCreateAthletesFromPastedList`
 * ci-dessous décide de ne pas créer les lignes marquées en doublon, mais les
 * renvoie tout de même dans son résultat pour que le récap explique ce qui a
 * été ignoré et pourquoi.
 */
export function detectDuplicates(
  rows: ParsedAthleteRow[],
  existingAthletes: Array<{ firstName: string; lastName: string }>,
): DuplicateAnnotatedRow[] {
  const seen = new Set(existingAthletes.map((athlete) => normalizeNameForDedupe(athlete.firstName, athlete.lastName)));
  return rows.map((row) => {
    const key = normalizeNameForDedupe(row.firstName, row.lastName);
    const isDuplicate = seen.has(key);
    seen.add(key);
    return { ...row, isDuplicate };
  });
}

export interface BulkAddResult {
  created: AthleteRow[];
  /** Lignes ignorées car doublon (jamais créées). */
  skippedDuplicates: DuplicateAnnotatedRow[];
  /** Sous-ensemble de `created` : mineur créé sans consentement parental —
   * non bloqué, mais non publiable tant qu'aucun consentement n'est
   * enregistré (voir en-tête de fichier). */
  unpublishableMinors: AthleteRow[];
}

/**
 * Crée tous les athlètes valides (non-doublons) d'une liste collée, pour UNE
 * équipe (`teamId`) — `existingAthletes` doit être le contenu actuel de
 * CETTE équipe, fourni par l'appelant (voir `createSupabaseExistingAthleteRepo`
 * ci-dessous) pour permettre des tests sans base de données réelle, comme le
 * reste du projet (CLAUDE.md section 6).
 */
export async function bulkCreateAthletesFromPastedList(
  user: AuthUser,
  teamId: string,
  rawList: string,
  existingAthletes: Array<{ firstName: string; lastName: string }>,
  repo: AthleteRepo,
): Promise<BulkAddResult> {
  const parsed = parsePastedAthleteList(rawList);
  const annotated = detectDuplicates(parsed, existingAthletes);

  const created: AthleteRow[] = [];
  const unpublishableMinors: AthleteRow[] = [];
  for (const row of annotated) {
    if (row.isDuplicate) continue;
    const athlete = await createAthlete(
      user,
      { firstName: row.firstName, lastName: row.lastName, teamId, sport: row.sport },
      repo,
    );
    created.push(athlete);
    if (!isAthletePubliclyVisible(athlete)) {
      unpublishableMinors.push(athlete);
    }
  }

  return { created, skippedDuplicates: annotated.filter((row) => row.isDuplicate), unpublishableMinors };
}

/** Accès en lecture seule aux athlètes déjà existants d'une équipe, pour la
 * détection de doublons — séparé de `AthleteRepo` (lib/entities/athletes.ts)
 * pour ne pas alourdir son contrat avec un besoin propre à cette fonctionnalité. */
export interface ExistingAthleteRepo {
  listAthletesByTeam(teamId: string): Promise<Array<{ firstName: string; lastName: string }>>;
}

export function createSupabaseExistingAthleteRepo(supabase: SupabaseClient): ExistingAthleteRepo {
  return {
    async listAthletesByTeam(teamId) {
      const { data, error } = await supabase.from('athletes').select('first_name, last_name').eq('team_id', teamId);
      if (error) throw error;
      return ((data as Array<{ first_name: string; last_name: string }>) ?? []).map((row) => ({
        firstName: row.first_name,
        lastName: row.last_name,
      }));
    },
  };
}
