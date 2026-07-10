/**
 * Tests unitaires — `lib/parametres.ts` (P.2, `SPEC-PARAMETRES-PLATEFORME.md`
 * §2, voir `docs/PLAN-PARAMETRES-PLATEFORME.md`). Repo en mémoire injecté,
 * même convention que le reste du projet (aucune dépendance Postgres ici --
 * la RLS réelle est couverte par
 * `tests/integration/platform-parameters-rls.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARAMETRES_DEFAUT,
  getParametre,
  getParametres,
  invalidateParametresCache,
  loadParametres,
  mergeParametresAvecDefaut,
  type ParametresRepo,
} from '@/lib/parametres';

function fakeRepo(
  rows: Array<{ cle: string; valeur: unknown }>,
  opts: { throwOnList?: boolean } = {},
): ParametresRepo & { callCount: number } {
  const repo = {
    callCount: 0,
    async listAll() {
      repo.callCount += 1;
      if (opts.throwOnList) {
        throw new Error('panne réseau simulée');
      }
      return rows;
    },
  };
  return repo;
}

const SEED_ROWS: Array<{ cle: string; valeur: unknown }> = [
  { cle: 'campagne_duree_jours', valeur: PARAMETRES_DEFAUT.campagne_duree_jours },
  { cle: 'campagne_delai_livraison_jours_max', valeur: PARAMETRES_DEFAUT.campagne_delai_livraison_jours_max },
  { cle: 'campagne_date_livraison_obligatoire', valeur: PARAMETRES_DEFAUT.campagne_date_livraison_obligatoire },
  { cle: 'campagne_athletes_max', valeur: PARAMETRES_DEFAUT.campagne_athletes_max },
  { cle: 'campagne_commandes_max', valeur: PARAMETRES_DEFAUT.campagne_commandes_max },
  { cle: 'campagne_produits_max', valeur: PARAMETRES_DEFAUT.campagne_produits_max },
  { cle: 'campagne_produits_recommande', valeur: PARAMETRES_DEFAUT.campagne_produits_recommande },
  { cle: 'campagne_objectif_athlete_suggere', valeur: PARAMETRES_DEFAUT.campagne_objectif_athlete_suggere },
  {
    cle: 'campagne_objectif_athlete_avertissement',
    valeur: PARAMETRES_DEFAUT.campagne_objectif_athlete_avertissement,
  },
  { cle: 'equipe_campagnes_par_an_max', valeur: PARAMETRES_DEFAUT.equipe_campagnes_par_an_max },
  { cle: 'athlete_credit_annuel_max', valeur: PARAMETRES_DEFAUT.athlete_credit_annuel_max },
  { cle: 'panier_multi_beneficiaires_max', valeur: PARAMETRES_DEFAUT.panier_multi_beneficiaires_max },
];

beforeEach(() => {
  // Le cache est un singleton au niveau du module -- doit être réinitialisé
  // avant chaque test pour que les tests restent indépendants.
  invalidateParametresCache();
});

describe('mergeParametresAvecDefaut (fusion pure, sans I/O)', () => {
  it('utilise la valeur de la ligne quand elle est présente et valide', () => {
    const result = mergeParametresAvecDefaut([{ cle: 'campagne_athletes_max', valeur: 45 }]);
    expect(result.campagne_athletes_max).toBe(45);
    // Les autres clés, absentes des lignes fournies, restent au défaut.
    expect(result.campagne_commandes_max).toBe(PARAMETRES_DEFAUT.campagne_commandes_max);
  });

  it('retombe sur la valeur par défaut pour une clé absente de la base', () => {
    const result = mergeParametresAvecDefaut([]);
    expect(result).toEqual(PARAMETRES_DEFAUT);
  });

  it("retombe sur la valeur par défaut pour une seule clé de forme invalide, sans affecter les autres", () => {
    const result = mergeParametresAvecDefaut([
      { cle: 'campagne_athletes_max', valeur: 'pas-un-nombre' }, // forme invalide
      { cle: 'campagne_commandes_max', valeur: 300 }, // valide
    ]);
    expect(result.campagne_athletes_max).toBe(PARAMETRES_DEFAUT.campagne_athletes_max); // fallback ciblé
    expect(result.campagne_commandes_max).toBe(300); // non affectée
  });

  it('retombe sur la valeur par défaut si un objet min/max/defaut est incomplet', () => {
    const result = mergeParametresAvecDefaut([
      { cle: 'campagne_duree_jours', valeur: { min: 7, max: 21 } }, // "defaut" manquant
    ]);
    expect(result.campagne_duree_jours).toEqual(PARAMETRES_DEFAUT.campagne_duree_jours);
  });

  it('ignore silencieusement une clé inconnue du code (aucune erreur levée)', () => {
    const result = mergeParametresAvecDefaut([{ cle: 'cle_future_inconnue', valeur: 123 }]);
    expect(result).toEqual(PARAMETRES_DEFAUT);
  });
});

describe('loadParametres (cache 5 min + fallback total, repo/horloge injectés)', () => {
  it('interroge le repo au premier appel', async () => {
    const repo = fakeRepo(SEED_ROWS);
    const valeurs = await loadParametres(repo, 0);
    expect(repo.callCount).toBe(1);
    expect(valeurs).toEqual(PARAMETRES_DEFAUT);
  });

  it("ne réinterroge PAS le repo tant que le cache (5 min) n'a pas expiré", async () => {
    const repo = fakeRepo(SEED_ROWS);
    await loadParametres(repo, 0);
    await loadParametres(repo, 4 * 60 * 1000); // 4 min plus tard, toujours dans le TTL
    expect(repo.callCount).toBe(1);
  });

  it('réinterroge le repo une fois le TTL de 5 minutes dépassé', async () => {
    const repo = fakeRepo(SEED_ROWS);
    await loadParametres(repo, 0);
    await loadParametres(repo, 5 * 60 * 1000 + 1); // juste après expiration
    expect(repo.callCount).toBe(2);
  });

  it('invalidateParametresCache() force une relecture immédiate', async () => {
    const repo = fakeRepo(SEED_ROWS);
    await loadParametres(repo, 0);
    invalidateParametresCache();
    await loadParametres(repo, 1); // 1 ms plus tard, largement dans le TTL normal
    expect(repo.callCount).toBe(2);
  });

  it('retombe sur PARAMETRES_DEFAUT complet si la table est inaccessible, sans mettre en cache', async () => {
    const repo = fakeRepo([], { throwOnList: true });
    const valeurs = await loadParametres(repo, 0);
    expect(valeurs).toEqual(PARAMETRES_DEFAUT);

    // Pas de mise en cache d'un échec : un appel immédiat suivant retente le repo.
    await loadParametres(repo, 1);
    expect(repo.callCount).toBe(2);
  });
});

describe('getParametres / getParametre (façades Supabase)', () => {
  it('getParametres délègue à loadParametres via createSupabaseParametresRepo', async () => {
    const rows = [{ cle: 'campagne_athletes_max', valeur: 12 }];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const valeurs = await getParametres(supabase);
    expect(valeurs.campagne_athletes_max).toBe(12);
    expect(supabase.from).toHaveBeenCalledWith('parametres_plateforme');
  });

  it('getParametre retourne uniquement la clé demandée, typée', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const valeur = await getParametre('panier_multi_beneficiaires_max', supabase);
    expect(valeur).toBe(PARAMETRES_DEFAUT.panier_multi_beneficiaires_max);
  });
});

describe('PARAMETRES_DEFAUT (garde anti-divergence avec le seed SQL)', () => {
  it('correspond EXACTEMENT aux 12 valeurs seedées par la migration 0023', () => {
    // Lit directement le fichier de migration plutôt qu'une copie codée en
    // dur dans ce test -- sinon la garde elle-même pourrait diverger sans
    // être détectée. Extrait chaque tuple (cle, valeur, type_limite) par
    // une expression régulière sur la forme connue du fichier.
    const migrationPath = path.resolve(
      __dirname,
      '../../supabase/migrations/0023_platform_parameters.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    const tupleRegex = /\('([a-z_]+)',\s*\n\s*'([^']*)',\s*\n\s*'(souple|dure)',/g;
    const seeded: Record<string, unknown> = {};
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = tupleRegex.exec(sql)) !== null) {
      const cle = match[1];
      const valeurBrute = match[2];
      if (!cle || valeurBrute === undefined) continue;
      seeded[cle] = JSON.parse(valeurBrute);
    }

    expect(Object.keys(seeded).sort()).toEqual(Object.keys(PARAMETRES_DEFAUT).sort());
    for (const cle of Object.keys(PARAMETRES_DEFAUT) as Array<keyof typeof PARAMETRES_DEFAUT>) {
      expect(seeded[cle]).toEqual(PARAMETRES_DEFAUT[cle]);
    }
  });
});
