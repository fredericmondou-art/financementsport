/**
 * Module unique de lecture des paramètres de plateforme (P.2,
 * `SPEC-PARAMETRES-PLATEFORME.md` §2, voir `docs/PLAN-PARAMETRES-PLATEFORME.md`).
 *
 * Règle du projet (spec §2) : « Toute lecture passe par un module unique
 * lib/parametres.ts (cache mémoire 5 min, invalidation sur modification).
 * Aucun accès direct à la table ailleurs dans le code. » Les futures règles
 * R1-R9 (P.3+) doivent donc TOUJOURS importer `getParametre`/`getParametres`
 * d'ici, jamais interroger `parametres_plateforme` directement.
 *
 * Fallback à deux niveaux (spec §2) :
 *   1. Table entièrement inaccessible (réseau, permissions, table absente en
 *      environnement de test) -> `PARAMETRES_DEFAUT` complet, RIEN n'est mis
 *      en cache (le prochain appel retentera une vraie lecture).
 *   2. Table accessible mais une clé précise est absente ou de forme
 *      invalide (validée par un schéma zod par clé) -> SEULE cette clé
 *      retombe sur sa valeur par défaut ; les autres clés lues restent
 *      celles de la base.
 *
 * `PARAMETRES_DEFAUT` doit rester identique aux valeurs seedées par
 * `supabase/migrations/0023_platform_parameters.sql` -- un test unitaire
 * dédié (`tests/unit/parametres.test.ts`) compare littéralement les deux
 * jeux de valeurs pour attraper toute divergence.
 *
 * Hors périmètre volontaire de ce module (voir docs/PLAN-PARAMETRES-PLATEFORME.md
 * §3) : `type_limite`/`description` ne sont pas exposés ici. Chaque règle
 * R1-R9 encode déjà elle-même son comportement souple/dur dans le code
 * (spec §4) -- `type_limite` en base n'est que documentation pour l'admin
 * qui modifie directement dans Supabase Studio (spec §7).
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface PlageMinMaxDefaut {
  min: number;
  max: number;
  defaut: number;
}

export interface ParametresValeurs {
  campagne_duree_jours: PlageMinMaxDefaut;
  campagne_delai_livraison_jours_max: number;
  campagne_date_livraison_obligatoire: boolean;
  campagne_athletes_max: number;
  campagne_commandes_max: number;
  campagne_produits_max: number;
  campagne_produits_recommande: number;
  campagne_objectif_athlete_suggere: PlageMinMaxDefaut;
  campagne_objectif_athlete_avertissement: number;
  equipe_campagnes_par_an_max: number;
  athlete_credit_annuel_max: number;
  panier_multi_beneficiaires_max: number;
}

export type CleParametre = keyof ParametresValeurs;

// =============================================================================
// VALEURS PAR DÉFAUT (miroir TS du seed SQL, migration 0023 -- voir
// tests/unit/parametres.test.ts pour la garde anti-divergence).
// Tous les montants sont en CENTIMES (CLAUDE.md section 4).
// =============================================================================

export const PARAMETRES_DEFAUT: ParametresValeurs = {
  campagne_duree_jours: { min: 7, max: 21, defaut: 14 },
  campagne_delai_livraison_jours_max: 21,
  campagne_date_livraison_obligatoire: true,
  campagne_athletes_max: 30,
  campagne_commandes_max: 250,
  campagne_produits_max: 6,
  campagne_produits_recommande: 4,
  campagne_objectif_athlete_suggere: { min: 10000, max: 25000, defaut: 15000 },
  campagne_objectif_athlete_avertissement: 40000,
  equipe_campagnes_par_an_max: 3,
  athlete_credit_annuel_max: 200000,
  panier_multi_beneficiaires_max: 4,
};

// =============================================================================
// VALIDATION (une clé de base invalide/absente ne doit jamais faire planter
// la lecture des 11 autres -- fallback par clé, voir en-tête de fichier).
// =============================================================================

const plageMinMaxDefautSchema = z.object({
  min: z.number(),
  max: z.number(),
  defaut: z.number(),
});

const PARAMETRE_SCHEMAS: { [K in CleParametre]: z.ZodType<ParametresValeurs[K]> } = {
  campagne_duree_jours: plageMinMaxDefautSchema,
  campagne_delai_livraison_jours_max: z.number().int().positive(),
  campagne_date_livraison_obligatoire: z.boolean(),
  campagne_athletes_max: z.number().int().positive(),
  campagne_commandes_max: z.number().int().positive(),
  campagne_produits_max: z.number().int().positive(),
  campagne_produits_recommande: z.number().int().positive(),
  campagne_objectif_athlete_suggere: plageMinMaxDefautSchema,
  campagne_objectif_athlete_avertissement: z.number().int().positive(),
  equipe_campagnes_par_an_max: z.number().int().positive(),
  athlete_credit_annuel_max: z.number().int().positive(),
  panier_multi_beneficiaires_max: z.number().int().positive(),
};

function isCleParametre(cle: string): cle is CleParametre {
  return Object.prototype.hasOwnProperty.call(PARAMETRE_SCHEMAS, cle);
}

/** Fonction PURE. Fusionne les lignes lues en base avec `PARAMETRES_DEFAUT`,
 * clé par clé -- une ligne absente ou dont la forme est invalide retombe sur
 * sa valeur par défaut sans affecter les autres clés. */
export function mergeParametresAvecDefaut(
  rows: Array<{ cle: string; valeur: unknown }>,
): ParametresValeurs {
  const result: ParametresValeurs = { ...PARAMETRES_DEFAUT };

  for (const row of rows) {
    if (!isCleParametre(row.cle)) {
      // Clé inconnue du code (ex. paramètre ajouté en base pour une future
      // version) -- ignorée, jamais une erreur : ce module ne connaît que
      // les clés déclarées dans ParametresValeurs.
      continue;
    }
    const schema = PARAMETRE_SCHEMAS[row.cle];
    const parsed = schema.safeParse(row.valeur);
    if (parsed.success) {
      (result as Record<CleParametre, unknown>)[row.cle] = parsed.data;
    } else {
      logger.warn('Paramètre de plateforme invalide en base, valeur par défaut utilisée', {
        cle: row.cle,
        valeurBrute: row.valeur,
      });
    }
  }

  return result;
}

// =============================================================================
// REPO (même patron injectable que lib/taxes/rates.ts -- permet aux tests
// unitaires d'injecter un faux repo, sans dépendre de Postgres).
// =============================================================================

export interface ParametresRepo {
  listAll(): Promise<Array<{ cle: string; valeur: unknown }>>;
}

export function createSupabaseParametresRepo(supabase: SupabaseClient): ParametresRepo {
  return {
    async listAll() {
      const { data, error } = await supabase.from('parametres_plateforme').select('cle, valeur');
      if (error) throw error;
      return (data as Array<{ cle: string; valeur: unknown }>) ?? [];
    },
  };
}

// =============================================================================
// CACHE MÉMOIRE 5 MINUTES (module-level, partagé entre tous les appels d'une
// même instance serveur chaude -- spec §2).
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { valeurs: ParametresValeurs; expiresAt: number } | null = null;

/** À appeler après toute modification de `parametres_plateforme` (P.6/P.7)
 * pour forcer une relecture immédiate plutôt que d'attendre l'expiration du
 * cache 5 minutes (spec §2 : « invalidation sur modification »). */
export function invalidateParametresCache(): void {
  cache = null;
}

/**
 * Fonction interne testable : accepte un repo et une horloge injectés pour
 * que les tests unitaires vérifient le TTL/le fallback sans faux timers
 * globaux ni Postgres. `getParametres`/`getParametre` ci-dessous sont de
 * simples façades pour l'usage réel (Supabase).
 */
export async function loadParametres(repo: ParametresRepo, now: number = Date.now()): Promise<ParametresValeurs> {
  if (cache && cache.expiresAt > now) {
    return cache.valeurs;
  }

  let rows: Array<{ cle: string; valeur: unknown }>;
  try {
    rows = await repo.listAll();
  } catch (err) {
    logger.error('Lecture de parametres_plateforme échouée, repli sur PARAMETRES_DEFAUT', { err });
    // Pas de mise en cache : le prochain appel retentera une vraie lecture
    // (une panne réseau transitoire ne doit pas figer le fallback 5 minutes).
    return PARAMETRES_DEFAUT;
  }

  const valeurs = mergeParametresAvecDefaut(rows);
  cache = { valeurs, expiresAt: now + CACHE_TTL_MS };
  return valeurs;
}

/** Lit l'ensemble des paramètres de plateforme (typé, caché 5 min, avec
 * repli sur les valeurs par défaut -- voir en-tête de fichier). */
export async function getParametres(supabase: SupabaseClient): Promise<ParametresValeurs> {
  return loadParametres(createSupabaseParametresRepo(supabase));
}

/** Lit un seul paramètre, typé selon sa clé (`ParametresValeurs[K]`). */
export async function getParametre<K extends CleParametre>(
  cle: K,
  supabase: SupabaseClient,
): Promise<ParametresValeurs[K]> {
  const valeurs = await getParametres(supabase);
  return valeurs[cle];
}
