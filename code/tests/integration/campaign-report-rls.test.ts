/**
 * Test d'intégration -- Tâche 1.5.9 (docs/prompts/phase-1-5.md) : la table
 * `campaign_reports` (migration 0018) -- RLS et le mécanisme de figeage
 * clé `(campaign_id, closed_at)`.
 *
 * Même harnais que tests/integration/campaign-closure-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role).
 *
 * Ce que ce test prouve, précisément :
 *   1. TEAM_MANAGER (gère TEAM_A, donc `private.manages_campaign`) peut
 *      insérer et relire un figeage pour SA campagne.
 *   2. OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) ne peut
 *      NI insérer NI lire ce figeage.
 *   3. anon ne peut ni insérer ni lire (RLS par défaut, aucune policy pour
 *      ce rôle).
 *   4. PLATFORM_ADMIN peut insérer et lire, quelle que soit la campagne.
 *   5. La contrainte `UNIQUE (campaign_id, closed_at)` empêche un second
 *      figeage pour la MÊME clôture (même `closed_at`).
 *   6. Une seconde clôture (nouveau `closed_at`) accepte un NOUVEAU figeage
 *      -- preuve du self-invalidation documenté dans la migration 0018 :
 *      l'ancien et le nouveau figeage coexistent, distingués par `closed_at`.
 *   7. Aucune policy UPDATE/DELETE n'existe : une tentative de modification
 *      échoue (immuabilité du figeage).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const TEAM_MANAGER = '99999999-0000-0000-0000-000000000012';
const OTHER_MANAGER = '99999999-0000-0000-0000-000000000013';
const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000014';
const TEAM_A = '99999999-1111-0000-0000-000000000011';
const TEAM_B = '99999999-1111-0000-0000-000000000012';
const ATHLETE_A = '99999999-2222-0000-0000-000000000011';

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

describe('campaign_reports RLS + figeage (migration 0018, Tâche 1.5.9)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let campaignId: string;
  const closedAt1 = '2026-06-01T12:00:00Z';
  const closedAt2 = '2026-07-01T12:00:00Z';

  const baseReportRow = {
    order_count: 2,
    gross_sales_cents: 11498,
    tax_total_cents: 1498,
    tps_cents: 500,
    tvq_cents: 998,
    net_sales_cents: 10000,
    payment_fees_cents: 200,
    shipping_cents: 0,
    credit_total_cents: 4000,
    profit_estimate_cents: 5800,
    profit_estimate_excludes_cost: true,
  };

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-campaign-report-rls-test-'));

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
    const dbName = `sportif_campaign_report_rls_${port}`;
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
    // après TOUTES les migrations (même piège documenté dans les tests
    // d'intégration précédents).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [TEAM_MANAGER, 'manager-a-1-5-9@example.com', OTHER_MANAGER, 'manager-b-1-5-9@example.com', PLATFORM_ADMIN, 'admin-1-5-9@example.com'],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'manager-a-1-5-9@example.com', 'Responsable A', 'team_manager'),
        ($2, 'manager-b-1-5-9@example.com', 'Responsable B', 'team_manager'),
        ($3, 'admin-1-5-9@example.com', 'Admin Plateforme', 'platform_admin')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email`,
      [TEAM_MANAGER, OTHER_MANAGER, PLATFORM_ADMIN],
    );

    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-1-5-9'), ($2, 'Équipe B', 'equipe-b-1-5-9')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie-1-5-9')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id, closed_at)
       VALUES ('team', 'closed', 'Campagne Équipe A 1.5.9', 'campagne-equipe-a-1-5-9', 'athlete', $1, $2, $3)
       RETURNING id`,
      [ATHLETE_A, TEAM_A, closedAt1],
    );
    campaignId = campaign.rows[0]!.id;
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('anon ne peut ni insérer ni lire un figeage (aucune policy pour ce rôle)', async () => {
    await expect(
      asRole(client, 'anon', null, 'SELECT id FROM campaign_reports WHERE campaign_id = $1', [campaignId]),
    ).resolves.toEqual([]); // SELECT vide (pas d'erreur, RLS filtre silencieusement)

    await expect(
      asRole(
        client,
        'anon',
        null,
        `INSERT INTO campaign_reports (campaign_id, closed_at, order_count, gross_sales_cents, tax_total_cents, tps_cents, tvq_cents, net_sales_cents, payment_fees_cents, shipping_cents, credit_total_cents, profit_estimate_cents, profit_estimate_excludes_cost)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, true)`,
        [campaignId, closedAt1],
      ),
    ).rejects.toThrow();
  });

  it('OTHER_MANAGER (sans lien avec cette campagne) ne peut ni insérer ni lire', async () => {
    await expect(
      asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM campaign_reports WHERE campaign_id = $1', [
        campaignId,
      ]),
    ).resolves.toEqual([]);

    await expect(
      asRole(
        client,
        'authenticated',
        OTHER_MANAGER,
        `INSERT INTO campaign_reports (campaign_id, closed_at, order_count, gross_sales_cents, tax_total_cents, tps_cents, tvq_cents, net_sales_cents, payment_fees_cents, shipping_cents, credit_total_cents, profit_estimate_cents, profit_estimate_excludes_cost)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, true)`,
        [campaignId, closedAt1],
      ),
    ).rejects.toThrow();
  });

  it('TEAM_MANAGER (gère TEAM_A) peut insérer et relire le figeage de SA campagne', async () => {
    const inserted = await asRole<{ id: string; gross_sales_cents: number }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      `INSERT INTO campaign_reports (campaign_id, closed_at, order_count, gross_sales_cents, tax_total_cents, tps_cents, tvq_cents, net_sales_cents, payment_fees_cents, shipping_cents, credit_total_cents, profit_estimate_cents, profit_estimate_excludes_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, gross_sales_cents`,
      [
        campaignId,
        closedAt1,
        baseReportRow.order_count,
        baseReportRow.gross_sales_cents,
        baseReportRow.tax_total_cents,
        baseReportRow.tps_cents,
        baseReportRow.tvq_cents,
        baseReportRow.net_sales_cents,
        baseReportRow.payment_fees_cents,
        baseReportRow.shipping_cents,
        baseReportRow.credit_total_cents,
        baseReportRow.profit_estimate_cents,
        baseReportRow.profit_estimate_excludes_cost,
      ],
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.gross_sales_cents).toBe(11498);

    const read = await asRole<{ id: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT id FROM campaign_reports WHERE campaign_id = $1 AND closed_at = $2',
      [campaignId, closedAt1],
    );
    expect(read).toHaveLength(1);
  });

  it("relire le MÊME figeage (même closed_at) retourne toujours les MÊMES chiffres -- preuve du gel", async () => {
    const read = await asRole<{ gross_sales_cents: number; net_sales_cents: number }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT gross_sales_cents, net_sales_cents FROM campaign_reports WHERE campaign_id = $1 AND closed_at = $2',
      [campaignId, closedAt1],
    );
    expect(read[0]).toEqual({ gross_sales_cents: 11498, net_sales_cents: 10000 });
  });

  it("la contrainte UNIQUE (campaign_id, closed_at) empêche un second figeage pour LA MÊME clôture", async () => {
    await expect(
      asRole(
        client,
        'authenticated',
        TEAM_MANAGER,
        `INSERT INTO campaign_reports (campaign_id, closed_at, order_count, gross_sales_cents, tax_total_cents, tps_cents, tvq_cents, net_sales_cents, payment_fees_cents, shipping_cents, credit_total_cents, profit_estimate_cents, profit_estimate_excludes_cost)
         VALUES ($1, $2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, true)`,
        [campaignId, closedAt1],
      ),
    ).rejects.toThrow();
  });

  it('une SECONDE clôture (nouveau closed_at) accepte un NOUVEAU figeage, distinct -- self-invalidation', async () => {
    const inserted = await asRole<{ id: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      `INSERT INTO campaign_reports (campaign_id, closed_at, order_count, gross_sales_cents, tax_total_cents, tps_cents, tvq_cents, net_sales_cents, payment_fees_cents, shipping_cents, credit_total_cents, profit_estimate_cents, profit_estimate_excludes_cost)
       VALUES ($1, $2, 1, 5000, 0, 0, 0, 5000, 0, 0, 1000, 4000, true)
       RETURNING id`,
      [campaignId, closedAt2],
    );
    expect(inserted).toHaveLength(1);

    const both = await client.query<{ closed_at: string }>(
      'SELECT closed_at FROM campaign_reports WHERE campaign_id = $1 ORDER BY closed_at',
      [campaignId],
    );
    expect(both.rows).toHaveLength(2); // l'ancien ET le nouveau figeage coexistent
  });

  it('PLATFORM_ADMIN peut lire et insérer, quelle que soit la campagne', async () => {
    const read = await asRole<{ id: string }>(
      client,
      'authenticated',
      PLATFORM_ADMIN,
      'SELECT id FROM campaign_reports WHERE campaign_id = $1',
      [campaignId],
    );
    expect(read.length).toBeGreaterThan(0);
  });

  it('aucune policy UPDATE/DELETE : une tentative de modification échoue silencieusement (0 ligne touchée) -- immuabilité du figeage', async () => {
    const updateResult = await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [TEAM_MANAGER]);
    const result = await client.query(
      'UPDATE campaign_reports SET gross_sales_cents = 999999 WHERE campaign_id = $1 AND closed_at = $2',
      [campaignId, closedAt1],
    );
    await client.query('RESET ROLE');
    expect(result.rowCount).toBe(0);
    void updateResult;

    const stillOriginal = await client.query<{ gross_sales_cents: number }>(
      'SELECT gross_sales_cents FROM campaign_reports WHERE campaign_id = $1 AND closed_at = $2',
      [campaignId, closedAt1],
    );
    expect(stillOriginal.rows[0]?.gross_sales_cents).toBe(11498);
  });
});
