/**
 * Test d'intégration -- Tâche 1.5.3 (docs/prompts/phase-1-5.md) : RLS
 * propriétaire sur `saved_splits`/`saved_split_items` (migration 0013).
 *
 * Même harnais que tests/integration/order-credits-own-order-rls.test.ts
 * (Postgres embarqué jetable, stubs auth.uid()/anon/authenticated/
 * service_role) -- dupliqué dans un fichier dédié plutôt qu'ajouté à
 * tests/integration/rls-policies.test.ts, comme ce précédent l'a déjà fait
 * (CLAUDE.md section 6 : petits changements atomiques, scope d'un fichier de
 * test aligné avec la tâche qui l'a fait naître).
 *
 * Ce que ce test prouve, précisément :
 *   1. Un client connecté (CLIENT_A) peut créer une répartition favorite et
 *      la relire.
 *   2. Un AUTRE client connecté (CLIENT_B) ne voit AUCUNE des répartitions
 *      favorites de CLIENT_A, ni dans `saved_splits` ni dans
 *      `saved_split_items` (la policy sur les items passe par une
 *      sous-requête `EXISTS` sur `saved_splits.user_id`, pas une colonne
 *      `user_id` directe -- c'est précisément ce que ce test vérifie).
 *   3. `anon` (invité, jamais réservé pour cette fonctionnalité) ne voit
 *      rien non plus.
 *   4. Le platform_admin voit tout (private.is_platform_admin(), même patron
 *      que campaign_drafts, migration 0010).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const CLIENT_A = '77777777-0000-0000-0000-000000000001';
const CLIENT_B = '77777777-0000-0000-0000-000000000002';
const PLATFORM_ADMIN = '77777777-0000-0000-0000-000000000003';
const ATHLETE_BENEFICIARY_ID = '77777777-1111-0000-0000-000000000001';

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

describe('RLS saved_splits / saved_split_items (migration 0013, Tâche 1.5.3)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let savedSplitAId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-saved-splits-rls-test-'));

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
    const dbName = `sportif_ss_rls_${port}`;
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

    // `GRANT ... ON ALL TABLES IN SCHEMA public` n'est PAS rétroactif : il ne
    // vise que les tables qui existent déjà au moment où il s'exécute. Lancé
    // une seule fois APRÈS la boucle de migrations (donc après la toute
    // dernière, ici 0013_saved_splits.sql), il couvre bien `saved_splits`/
    // `saved_split_items` -- contrairement à un appel placé juste après
    // 0001_initial_schema.sql (bug trouvé en écrivant ce test : la table
    // existe alors qu'elle n'a encore reçu aucun GRANT, d'où "permission
    // denied for table saved_splits" pour le rôle `authenticated`).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)', [
      CLIENT_A,
      'client-a@example.com',
      CLIENT_B,
      'client-b@example.com',
      PLATFORM_ADMIN,
      'admin@example.com',
    ]);
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'client-a@example.com', 'Client A', 'client'),
        ($2, 'client-b@example.com', 'Client B', 'client'),
        ($3, 'admin@example.com', 'Admin Plateforme', 'platform_admin')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
      [CLIENT_A, CLIENT_B, PLATFORM_ADMIN],
    );

    // CLIENT_A crée sa répartition favorite "50/50" en tant qu'`authenticated`
    // -- même chemin que `lib/cart/saved-splits.ts#createSupabaseSavedSplitsRepo`.
    await client.query(`SET ROLE authenticated`);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [CLIENT_A]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO saved_splits (user_id, name) VALUES ($1, '50/50') RETURNING id`,
      [CLIENT_A],
    );
    savedSplitAId = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO saved_split_items (saved_split_id, beneficiary_type, beneficiary_id, share_bps)
       VALUES ($1, 'athlete', $2, 10000)`,
      [savedSplitAId, ATHLETE_BENEFICIARY_ID],
    );
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('CLIENT_A relit sa propre répartition favorite et son item', async () => {
    const splits = await asRole<{ id: string; name: string }>(
      client,
      'authenticated',
      CLIENT_A,
      'SELECT id, name FROM saved_splits',
    );
    expect(splits).toHaveLength(1);
    expect(splits[0]?.name).toBe('50/50');

    const items = await asRole<{ saved_split_id: string }>(
      client,
      'authenticated',
      CLIENT_A,
      'SELECT saved_split_id FROM saved_split_items',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.saved_split_id).toBe(savedSplitAId);
  });

  it("CLIENT_B (un autre client connecté) ne voit AUCUNE répartition favorite de CLIENT_A", async () => {
    const splits = await asRole(client, 'authenticated', CLIENT_B, 'SELECT id FROM saved_splits');
    expect(splits).toHaveLength(0);
  });

  it("CLIENT_B ne voit aucun item de la répartition de CLIENT_A (policy via EXISTS sur saved_splits.user_id)", async () => {
    const items = await asRole(client, 'authenticated', CLIENT_B, 'SELECT id FROM saved_split_items');
    expect(items).toHaveLength(0);
  });

  it('anon (invité) ne voit rien -- fonctionnalité réservée aux clients connectés', async () => {
    const splits = await asRole(client, 'anon', null, 'SELECT id FROM saved_splits');
    expect(splits).toHaveLength(0);
    const items = await asRole(client, 'anon', null, 'SELECT id FROM saved_split_items');
    expect(items).toHaveLength(0);
  });

  it('le platform_admin voit toutes les répartitions favorites (private.is_platform_admin())', async () => {
    const splits = await asRole<{ id: string }>(
      client,
      'authenticated',
      PLATFORM_ADMIN,
      'SELECT id FROM saved_splits',
    );
    expect(splits).toHaveLength(1);
    expect(splits[0]?.id).toBe(savedSplitAId);
  });
});
