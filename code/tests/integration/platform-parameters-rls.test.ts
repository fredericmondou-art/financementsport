/**
 * Test d'intégration — migration 0023 (P.1, `SPEC-PARAMETRES-PLATEFORME.md`,
 * voir `docs/PLAN-PARAMETRES-PLATEFORME.md`) : `parametres_plateforme` et
 * `derogations_parametres`.
 *
 * Même harnais que `tests/integration/campaign-closure-rls.test.ts`
 * (Postgres embarqué jetable, rejoue TOUTES les migrations du dossier dans
 * l'ordre — ce qui valide au passage que 0023 s'applique proprement) --
 * fichier dédié, même convention établie par les tâches précédentes.
 *
 * Ce que ce test prouve, précisément :
 *   1. Les 12 paramètres V1 (spec §3) sont seedés et lisibles par
 *      `service_role`, avec les bons `type_limite`.
 *   2. `anon` et `authenticated` ne lisent AUCUNE ligne des deux tables
 *      (RLS activée, zéro policy — même patron que `stripe_events`).
 *   3. `anon` et `authenticated` ne peuvent PAS écrire (INSERT rejeté par
 *      RLS malgré le GRANT de table générique du harnais de test).
 *   4. `service_role` peut écrire une ligne `derogations_parametres`
 *      référençant une clé existante.
 *   5. La contrainte FK `cle_parametre -> parametres_plateforme(cle)` est
 *      appliquée (clé inexistante rejetée).
 *   6. La contrainte CHECK `entite_type` est appliquée (valeur hors énum
 *      rejetée).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Impossible de déterminer un port libre.')));
      }
    });
  });
}

async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(
  client: Client,
  role: 'anon' | 'authenticated',
  jwtSub: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await client.query(`SET ROLE ${role}`);
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [jwtSub ?? '']);
  try {
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    await client.query('RESET ROLE');
  }
}

describe('parametres_plateforme + derogations_parametres (migration 0023, P.1)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-platform-parameters-rls-test-'));

    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=en_US.UTF-8'],
    });

    await pg.initialise();
    await pg.start();
    const dbName = `sportif_platform_parameters_rls_${port}`;
    await pg.createDatabase(dbName);

    client = pg.getPgClient(dbName);
    await client.connect();

    await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
    await client.query(
      'CREATE TABLE auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);',
    );
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await client.query(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        END IF;
      END $$;
    `);
    await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;');
    await client.query('GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;');

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    }

    // GRANT ... ON ALL TABLES n'est pas rétroactif -- lancé une seule fois
    // après TOUTES les migrations (même piège documenté dans
    // order-status-transitions-rls.test.ts / campaign-closure-rls.test.ts).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('les 12 paramètres V1 sont seedés avec le bon type_limite (service_role)', async () => {
    await client.query('SET ROLE service_role');
    const result = await client.query<{ cle: string; type_limite: string; valeur: unknown }>(
      'SELECT cle, type_limite, valeur FROM parametres_plateforme ORDER BY cle',
    );
    await client.query('RESET ROLE');

    expect(result.rows).toHaveLength(12);

    const byCle = Object.fromEntries(result.rows.map((row) => [row.cle, row]));
    expect(byCle['campagne_duree_jours']?.type_limite).toBe('dure');
    expect(byCle['campagne_duree_jours']?.valeur).toEqual({ min: 7, max: 21, defaut: 14 });
    expect(byCle['campagne_commandes_max']?.valeur).toBe(250);
    expect(byCle['campagne_date_livraison_obligatoire']?.valeur).toBe(true);
    expect(byCle['campagne_produits_recommande']?.type_limite).toBe('souple');
    expect(byCle['campagne_objectif_athlete_suggere']?.valeur).toEqual({
      min: 10000,
      max: 25000,
      defaut: 15000,
    });
    expect(byCle['athlete_credit_annuel_max']?.valeur).toBe(200000);
    expect(byCle['panier_multi_beneficiaires_max']?.valeur).toBe(4);
  });

  it("anon ne lit aucune ligne de parametres_plateforme (RLS activée, zéro policy)", async () => {
    const rows = await asRole(client, 'anon', null, 'SELECT * FROM parametres_plateforme');
    expect(rows).toHaveLength(0);
  });

  it("authenticated ne lit aucune ligne de parametres_plateforme, même avec un sub valide", async () => {
    const rows = await asRole(
      client,
      'authenticated',
      '99999999-9999-9999-9999-999999999999',
      'SELECT * FROM parametres_plateforme',
    );
    expect(rows).toHaveLength(0);
  });

  it("anon ne peut pas écrire dans parametres_plateforme malgré le GRANT de table (RLS sans policy = 0 ligne visible, donc 0 ligne modifiée -- pas d'exception, mais aucun effet)", async () => {
    await client.query('SET ROLE anon');
    const update = await client.query(
      "UPDATE parametres_plateforme SET valeur = '999' WHERE cle = 'campagne_commandes_max'",
    );
    await client.query('RESET ROLE');
    expect(update.rowCount).toBe(0);

    await client.query('SET ROLE service_role');
    const check = await client.query<{ valeur: unknown }>(
      "SELECT valeur FROM parametres_plateforme WHERE cle = 'campagne_commandes_max'",
    );
    await client.query('RESET ROLE');
    expect(check.rows[0]?.valeur).toBe(250);
  });

  it("anon ne lit aucune ligne de derogations_parametres", async () => {
    const rows = await asRole(client, 'anon', null, 'SELECT * FROM derogations_parametres');
    expect(rows).toHaveLength(0);
  });

  it('service_role peut écrire une dérogation référençant une clé existante', async () => {
    await client.query('SET ROLE service_role');
    const result = await client.query<{ id: string }>(
      `INSERT INTO derogations_parametres (cle_parametre, entite_type, entite_id, valeur_appliquee, justification, admin_id)
       VALUES ('campagne_athletes_max', 'campagne', gen_random_uuid(), '45', 'Grand club, dérogation ponctuelle', NULL)
       RETURNING id`,
    );
    await client.query('RESET ROLE');
    expect(result.rows).toHaveLength(1);
  });

  it('rejette une dérogation référençant une clé de paramètre inexistante (FK)', async () => {
    await client.query('SET ROLE service_role');
    await expect(
      client.query(
        `INSERT INTO derogations_parametres (cle_parametre, entite_type, entite_id, valeur_appliquee, justification)
         VALUES ('cle_qui_nexiste_pas', 'campagne', gen_random_uuid(), '1', 'test')`,
      ),
    ).rejects.toThrow(/foreign key/i);
    await client.query('RESET ROLE');
  });

  it('rejette un entite_type hors énumération (CHECK)', async () => {
    await client.query('SET ROLE service_role');
    await expect(
      client.query(
        `INSERT INTO derogations_parametres (cle_parametre, entite_type, entite_id, valeur_appliquee, justification)
         VALUES ('campagne_athletes_max', 'club', gen_random_uuid(), '1', 'test')`,
      ),
    ).rejects.toThrow(/violates check constraint/i);
    await client.query('RESET ROLE');
  });
});
