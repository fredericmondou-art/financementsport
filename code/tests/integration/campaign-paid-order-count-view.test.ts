/**
 * Test d'intégration — migration 0025 (P.4, R4, SPEC-PARAMETRES-PLATEFORME.md,
 * voir docs/PLAN-PARAMETRES-PLATEFORME.md) : `v_campaign_paid_order_count`.
 *
 * Même patron que `tests/integration/campaign-delivery-date.test.ts` /
 * `tests/integration/platform-parameters-rls.test.ts` : rejoue TOUTES les
 * migrations du dossier dans l'ordre (pas gelé sur un sous-ensemble).
 *
 * Ce que ce test prouve, précisément :
 *   1. La vue ne compte que les commandes dont le statut est dans l'ensemble
 *      « payé » de `isOrderPaid` (lib/distribution/build-list.ts) --
 *      `payment_pending`/`cancelled`/`refunded`/`error` sont exclus.
 *   2. Le regroupement est par `primary_campaign_id` -- une commande d'une
 *      autre campagne n'est jamais comptée.
 *   3. `anon` ET `authenticated` peuvent lire la vue (R4 doit être vérifiable
 *      par le client de l'ACHETEUR, souvent invité -- voir le commentaire de
 *      tête de `lib/checkout/create-checkout-session.ts`), alors que `anon`
 *      ne peut PAS lire les commandes détaillées d'autrui sur `orders`
 *      directement (RLS `orders_select_scoped`, migration 0005).
 *   4. Une campagne sans commande payée n'apparaît simplement pas dans la
 *      vue (pas de ligne à 0) -- l'appelant doit gérer `?? 0`.
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

describe('v_campaign_paid_order_count (migration 0025, P.4, R4)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let campaignAId: string;
  let campaignBId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-campaign-paid-order-count-test-'));

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
    const dbName = `sportif_campaign_paid_order_count_${port}`;
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
      'manager.paid-order-count@example.com',
    ]);
    await client.query(
      "INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2)",
      [TEAM_MANAGER_ID, SEED_TEAM_ID],
    );

    // Deux campagnes, créées directement (service_role, hors RLS) -- seul le
    // comportement de la VUE nous intéresse ici, pas la création de
    // campagne (déjà couverte par tests/integration/create-campaign.test.ts
    // et campaign-delivery-date.test.ts).
    await client.query('SET ROLE service_role');
    const campaigns = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, name, slug, beneficiary_type, beneficiary_id, team_id, goal_cents, starts_at, ends_at, delivery_date, status)
       VALUES
         ('team', 'Campagne A', 'campagne-a-paid-count', 'team', $1, $1, 500000, now(), now() + interval '14 days', now() + interval '21 days', 'active'),
         ('team', 'Campagne B', 'campagne-b-paid-count', 'team', $1, $1, 500000, now(), now() + interval '14 days', now() + interval '21 days', 'active')
       RETURNING id`,
      [SEED_TEAM_ID],
    );
    campaignAId = campaigns.rows[0]!.id;
    campaignBId = campaigns.rows[1]!.id;
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  async function insertOrder(campaignId: string, status: string, orderNumber: string): Promise<void> {
    await client.query('SET ROLE service_role');
    await client.query(
      `INSERT INTO orders (order_number, status, subtotal_cents, tax_cents, shipping_cents, total_cents, primary_campaign_id)
       VALUES ($1, $2::order_status, 10000, 1497, 0, 11497, $3)`,
      [orderNumber, status, campaignId],
    );
    await client.query('RESET ROLE');
  }

  it('ne compte que les statuts « payés » (isOrderPaid), regroupés par campagne', async () => {
    // Campagne A : un de chaque statut « payé » + un de chaque statut « non
    // payé » -- seuls les 6 premiers doivent compter.
    await insertOrder(campaignAId, 'paid', 'CMD-A-001');
    await insertOrder(campaignAId, 'preparing', 'CMD-A-002');
    await insertOrder(campaignAId, 'ready', 'CMD-A-003');
    await insertOrder(campaignAId, 'delivered_to_team', 'CMD-A-004');
    await insertOrder(campaignAId, 'distributed', 'CMD-A-005');
    await insertOrder(campaignAId, 'completed', 'CMD-A-006');
    await insertOrder(campaignAId, 'partially_refunded', 'CMD-A-007');
    await insertOrder(campaignAId, 'payment_pending', 'CMD-A-008');
    await insertOrder(campaignAId, 'cancelled', 'CMD-A-009');
    await insertOrder(campaignAId, 'refunded', 'CMD-A-010');
    await insertOrder(campaignAId, 'error', 'CMD-A-011');

    // Campagne B : une seule commande payée -- ne doit jamais contaminer le
    // compte de la campagne A.
    await insertOrder(campaignBId, 'paid', 'CMD-B-001');

    const rows = await asRole<{ campaign_id: string; paid_order_count: number }>(
      client,
      'anon',
      null,
      'SELECT campaign_id, paid_order_count FROM v_campaign_paid_order_count ORDER BY campaign_id',
    );

    const forA = rows.find((r) => r.campaign_id === campaignAId);
    const forB = rows.find((r) => r.campaign_id === campaignBId);
    expect(Number(forA!.paid_order_count)).toBe(7);
    expect(Number(forB!.paid_order_count)).toBe(1);
  });

  it('lisible par anon ET authenticated (contrairement à orders en direct)', async () => {
    const anonRows = await asRole(
      client,
      'anon',
      null,
      'SELECT paid_order_count FROM v_campaign_paid_order_count WHERE campaign_id = $1',
      [campaignAId],
    );
    const authRows = await asRole(
      client,
      'authenticated',
      randomUUID(),
      'SELECT paid_order_count FROM v_campaign_paid_order_count WHERE campaign_id = $1',
      [campaignAId],
    );
    expect(anonRows).toHaveLength(1);
    expect(authRows).toHaveLength(1);

    // Contrôle négatif : la même identité `anon` (aucune commande à elle) ne
    // voit RIEN sur `orders` en direct -- confirme que la vue d'agrégation
    // est nécessaire (voir commentaire de tête).
    const anonDirectOrders = await asRole(
      client,
      'anon',
      null,
      'SELECT id FROM orders WHERE primary_campaign_id = $1',
      [campaignAId],
    );
    expect(anonDirectOrders).toHaveLength(0);
  });

  it('campagne sans aucune commande payée : aucune ligne (pas une ligne à 0)', async () => {
    await client.query('SET ROLE service_role');
    const emptyCampaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, name, slug, beneficiary_type, beneficiary_id, team_id, goal_cents, starts_at, ends_at, delivery_date, status)
       VALUES ('team', 'Campagne vide', 'campagne-vide-paid-count', 'team', $1, $1, 500000, now(), now() + interval '14 days', now() + interval '21 days', 'active')
       RETURNING id`,
      [SEED_TEAM_ID],
    );
    await client.query('RESET ROLE');
    const emptyCampaignId = emptyCampaign.rows[0]!.id;

    const rows = await asRole(
      client,
      'anon',
      null,
      'SELECT paid_order_count FROM v_campaign_paid_order_count WHERE campaign_id = $1',
      [emptyCampaignId],
    );
    expect(rows).toHaveLength(0);
  });
});
