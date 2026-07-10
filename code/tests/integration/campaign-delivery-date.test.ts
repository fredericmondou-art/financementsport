/**
 * Test d'intégration — migration 0024 (P.3, R2, SPEC-PARAMETRES-PLATEFORME.md,
 * voir docs/PLAN-PARAMETRES-PLATEFORME.md) : `delivery_date` sur `campaigns`,
 * nouvelle signature (17 paramètres) de `create_campaign_with_details`, et
 * exposition publique via `v_public_campaign`.
 *
 * Contrairement à `tests/integration/create-campaign.test.ts` (Tâche 1.7,
 * gelé sur les migrations 0001-0008 avec l'ANCIENNE signature à 16
 * paramètres -- toujours valide, jamais rejoué au-delà de 0008), ce fichier
 * rejoue TOUTES les migrations du dossier dans l'ordre (même patron que
 * `tests/integration/platform-parameters-rls.test.ts`), ce qui valide au
 * passage que 0024 s'applique proprement par-dessus 0008.
 *
 * Ce que ce test prouve, précisément :
 *   1. La nouvelle signature à 17 paramètres (avec p_delivery_date) créé une
 *      campagne dont `delivery_date` est bien persistée.
 *   2. `v_public_campaign` expose `delivery_date` à `anon` (obligation
 *      légale R2 : "affichée publiquement").
 *   3. L'ancienne signature à 16 paramètres (Tâche 1.7) n'existe plus
 *      (DROP explicite, migration 0024) -- appeler avec les anciens
 *      paramètres échoue avec "function ... does not exist".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const SEED_PATH = path.resolve(__dirname, '../../supabase/seed.sql');

const SEED_TEAM_ID = '33333333-3333-3333-3333-333333333301';
const SEED_PRODUCT_ID = '55555555-5555-5555-5555-555555555501';
const TEAM_MANAGER_ID = randomUUID();

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

describe('delivery_date + create_campaign_with_details (17 params, migration 0024, P.3)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-campaign-delivery-date-test-'));

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
    const dbName = `sportif_campaign_delivery_date_${port}`;
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

    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    const seedSql = fs.readFileSync(SEED_PATH, 'utf-8');
    await client.query(seedSql);

    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [
      TEAM_MANAGER_ID,
      'manager.delivery-date@example.com',
    ]);
    await client.query(
      "INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2)",
      [TEAM_MANAGER_ID, SEED_TEAM_ID],
    );
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('persiste delivery_date via la nouvelle signature à 17 paramètres et l’expose sur v_public_campaign', async () => {
    const slug = 'campagne-delivery-date';
    const qrCodes = [{ target_type: 'campaign', target_id: null, code: 'qr-delivery-date-camp' }];

    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [TEAM_MANAGER_ID]);
    const result = await client.query<{ result: { campaign: { id: string; slug: string } } }>(
      `SELECT create_campaign_with_details(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid[], $15::uuid[], $16::jsonb, $17::jsonb
      ) AS result`,
      [
        'team',
        'Campagne avec date de livraison',
        slug,
        'Message public.',
        'team',
        SEED_TEAM_ID,
        null,
        SEED_TEAM_ID,
        500000,
        '2026-07-01T00:00:00Z',
        '2026-07-15T00:00:00Z',
        '2026-07-22T00:00:00Z', // p_delivery_date
        'active',
        [],
        [SEED_PRODUCT_ID],
        null,
        JSON.stringify(qrCodes),
      ],
    );
    await client.query('RESET ROLE');

    const campaignId = result.rows[0]!.result.campaign.id;

    const row = await client.query<{ delivery_date: Date }>(
      'SELECT delivery_date FROM campaigns WHERE id = $1',
      [campaignId],
    );
    expect(new Date(row.rows[0]!.delivery_date).toISOString()).toBe('2026-07-22T00:00:00.000Z');

    const publicRows = await asRole<{ delivery_date: Date }>(
      client,
      'anon',
      null,
      'SELECT delivery_date FROM v_public_campaign WHERE id = $1',
      [campaignId],
    );
    expect(publicRows).toHaveLength(1);
    expect(new Date(publicRows[0]!.delivery_date).toISOString()).toBe('2026-07-22T00:00:00.000Z');
  });

  it("l'ancienne signature à 16 paramètres (Tâche 1.7, avant migration 0024) n'existe plus", async () => {
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [TEAM_MANAGER_ID]);
    await expect(
      client.query(
        `SELECT create_campaign_with_details(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::uuid[], $14::uuid[], $15::jsonb, $16::jsonb
        ) AS result`,
        [
          'team',
          'Campagne signature obsolète',
          'campagne-signature-obsolete',
          'Message.',
          'team',
          SEED_TEAM_ID,
          null,
          SEED_TEAM_ID,
          500000,
          '2026-07-01T00:00:00Z',
          '2026-07-15T00:00:00Z',
          'active',
          [],
          [SEED_PRODUCT_ID],
          null,
          JSON.stringify([{ target_type: 'campaign', target_id: null, code: 'qr-obsolete' }]),
        ],
      ),
    ).rejects.toThrow(/does not exist|no function matches/i);
    await client.query('RESET ROLE');
  });
});
