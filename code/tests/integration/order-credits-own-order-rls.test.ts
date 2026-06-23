/**
 * Test d'intégration -- Tâche 1.6.A3 (docs/prompts/phase-1-6.md) : nouvelle
 * policy RLS `order_credits_select_own_order` (migration 0009).
 *
 * Même harnais que tests/integration/rls-policies.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role) --
 * dupliqué dans un fichier dédié plutôt qu'ajouté à ce fichier-là pour
 * garder le scope de chaque fichier aligné avec la tâche qui l'a fait
 * naître (0.4 vs 1.6.A3), comme demandé par CLAUDE.md section 6 (petits
 * changements atomiques).
 *
 * Ce que ce test prouve, précisément :
 *   1. AVANT la 0009 (migrations jusqu'à 0008 seulement), le propriétaire
 *      d'une commande ne peut PAS lire le crédit que sa propre commande a
 *      généré -- c'est le gap documenté dans 0009.
 *   2. APRÈS la 0009, ce même propriétaire le peut.
 *   3. Un AUTRE client (qui ne possède pas la commande) ne le peut
 *      toujours pas -- la policy ne fuit pas vers n'importe quel client.
 *   4. Le staff (`accounting`) voit toujours tout, peu importe le
 *      propriétaire -- `order_credits_select_staff` (migration 0005)
 *      continue de fonctionner, les deux policies SELECT permissives sont
 *      combinées par OR (comportement standard de Postgres RLS).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const ORDER_OWNER = '88888888-0000-0000-0000-000000000001';
const OTHER_CLIENT = '88888888-0000-0000-0000-000000000002';
const ACCOUNTING_STAFF = '88888888-0000-0000-0000-000000000003';
const ORDER_ID = '88888888-1111-0000-0000-000000000001';
const OTHER_ORDER_ID = '88888888-1111-0000-0000-000000000002';
const CREDIT_ID = '88888888-2222-0000-0000-000000000001';
const ATHLETE_BENEFICIARY_ID = '88888888-3333-0000-0000-000000000001';

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

/** Construit un harnais complet (Postgres + stubs + migrations 0001..N) et le retourne. */
async function setupHarness(migrationFiles: string[]) {
  const port = await getFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-order-credits-rls-test-'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=en_US.UTF-8'],
  });

  await pg.initialise();
  await pg.start();
  const dbName = `sportif_oc_rls_${port}`;
  await pg.createDatabase(dbName);

  const client = pg.getPgClient(dbName);
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

  for (const file of migrationFiles) {
    await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    if (file === '0001_initial_schema.sql') {
      await client.query(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
      );
      await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
      await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');
    }
  }

  // Fixtures : un client propriétaire, un autre client, un membre du staff
  // comptabilité, deux commandes (une par client) et un crédit sur la
  // commande du premier client.
  await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)', [
    ORDER_OWNER, 'owner@example.com',
    OTHER_CLIENT, 'other@example.com',
    ACCOUNTING_STAFF, 'accounting@example.com',
  ]);
  await client.query(
    `INSERT INTO profiles (id, email, full_name, role) VALUES
      ($1, 'owner@example.com', 'Propriétaire Commande', 'client'),
      ($2, 'other@example.com', 'Autre Client', 'client'),
      ($3, 'accounting@example.com', 'Comptabilité', 'accounting')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
    [ORDER_OWNER, OTHER_CLIENT, ACCOUNTING_STAFF],
  );
  await client.query(
    `INSERT INTO orders (id, order_number, user_id, status, subtotal_cents, tax_cents, total_cents) VALUES
      ($1, 'CMD-OC-RLS-000001', $2, 'paid', 1000, 150, 1150),
      ($3, 'CMD-OC-RLS-000002', $4, 'paid', 1000, 150, 1150)`,
    [ORDER_ID, ORDER_OWNER, OTHER_ORDER_ID, OTHER_CLIENT],
  );
  await client.query(
    `INSERT INTO order_credits (id, order_id, beneficiary_type, beneficiary_id, amount_cents, status)
     VALUES ($1, $2, 'athlete', $3, 500, 'active')`,
    [CREDIT_ID, ORDER_ID, ATHLETE_BENEFICIARY_ID],
  );

  return { pg, client, dataDir };
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

const MIGRATIONS_UP_TO_0008 = [
  '0001_initial_schema.sql',
  '0002_auth_profile_trigger.sql',
  '0003_rls_policies.sql',
  '0004_harden_function_grants.sql',
  '0005_move_rls_helpers_to_private_schema.sql',
  '0006_stripe_events_and_order_credit_function.sql',
  '0007_public_campaign_views.sql',
  '0008_campaign_creation_assistant.sql',
];
const MIGRATIONS_UP_TO_0009 = [...MIGRATIONS_UP_TO_0008, '0009_order_credits_select_own_order.sql'];

describe('order_credits_select_own_order (migration 0009, Tâche 1.6.A3)', () => {
  describe('AVANT la migration 0009 : le gap existe bel et bien', () => {
    let harness: Awaited<ReturnType<typeof setupHarness>>;

    beforeAll(async () => {
      harness = await setupHarness(MIGRATIONS_UP_TO_0008);
    });

    afterAll(async () => {
      await harness.client.end();
      await harness.pg.stop();
      fs.rmSync(harness.dataDir, { recursive: true, force: true });
    });

    it("le propriétaire de la commande NE PEUT PAS lire le crédit généré par SON PROPRE achat", async () => {
      const rows = await asRole(harness.client, 'authenticated', ORDER_OWNER, 'SELECT id FROM order_credits');
      expect(rows).toHaveLength(0);
    });
  });

  describe('APRÈS la migration 0009', () => {
    let harness: Awaited<ReturnType<typeof setupHarness>>;

    beforeAll(async () => {
      harness = await setupHarness(MIGRATIONS_UP_TO_0009);
    });

    afterAll(async () => {
      await harness.client.end();
      await harness.pg.stop();
      fs.rmSync(harness.dataDir, { recursive: true, force: true });
    });

    it('le propriétaire de la commande peut maintenant lire le crédit de sa propre commande', async () => {
      const rows = await asRole<{ id: string }>(
        harness.client,
        'authenticated',
        ORDER_OWNER,
        'SELECT id FROM order_credits',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(CREDIT_ID);
    });

    it("un autre client (qui ne possède pas la commande) ne voit toujours rien", async () => {
      const rows = await asRole(harness.client, 'authenticated', OTHER_CLIENT, 'SELECT id FROM order_credits');
      expect(rows).toHaveLength(0);
    });

    it('anon ne voit toujours rien (policy additive, pas une ouverture publique)', async () => {
      const rows = await asRole(harness.client, 'anon', null, 'SELECT id FROM order_credits');
      expect(rows).toHaveLength(0);
    });

    it("le staff (accounting) voit toujours le crédit -- order_credits_select_staff combinée par OR, pas remplacée", async () => {
      const rows = await asRole<{ id: string }>(
        harness.client,
        'authenticated',
        ACCOUNTING_STAFF,
        'SELECT id FROM order_credits',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(CREDIT_ID);
    });
  });
});
