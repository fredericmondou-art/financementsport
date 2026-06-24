/**
 * Test d'intégration -- Tâche 1.5.7 (docs/prompts/phase-1-5.md) : accès aux
 * données du dashboard admin -- « un non-admin ne peut pas accéder au
 * dashboard » (critère d'acceptation explicite de la tâche).
 *
 * Même harnais que tests/integration/team-dashboard-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role) --
 * fichier dédié plutôt qu'ajouté à rls-policies.test.ts, même convention
 * établie par les tâches précédentes (CLAUDE.md section 6).
 *
 * Contrairement à la Tâche 1.5.6, AUCUNE nouvelle migration RLS n'a été
 * ajoutée pour cette tâche -- les policies déployées depuis la migration
 * 0005 (`orders_select_scoped`, `order_items_select_scoped`,
 * `order_credits_select_staff`, `payouts_staff_read`, `campaigns_select_scoped`)
 * accordent déjà TOUTES un accès SELECT total et inconditionnel à
 * `private.is_platform_admin()`. Ce test sert donc de RÉGRESSION / preuve
 * positive : confirmer que ces policies existantes accordent bien à
 * PLATFORM_ADMIN une lecture de TOUTES les lignes (même celles d'un autre
 * utilisateur/équipe), et qu'un rôle non-admin (`team_manager` ici, sans
 * lien avec les données de test) n'obtient PAS la même vue d'ensemble --
 * RLS seul ne bloque pas l'accès à la ROUTE (voir `lib/dashboards/admin.ts`,
 * en-tête, et `canViewAdminDashboard`, testée unitairement dans
 * tests/unit/dashboards-admin.test.ts), mais elle borne déjà strictement ce
 * qu'un non-admin pourrait lire même en contournant la page.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000010';
const TEAM_MANAGER = '99999999-0000-0000-0000-000000000011';
const OTHER_CLIENT = '99999999-0000-0000-0000-000000000012';
const TEAM_A = '99999999-1111-0000-0000-000000000010';
const OTHER_TEAM_ORDER_OWNER = '99999999-0000-0000-0000-000000000013';

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

describe('RLS orders/order_credits/payouts/campaigns pour le dashboard admin (Tâche 1.5.7, aucune nouvelle migration)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let orderId: string;
  let creditId: string;
  let payoutId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-admin-dashboard-rls-test-'));

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
    const dbName = `sportif_admin_dash_rls_${port}`;
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
    // après TOUTES les migrations (piège déjà documenté dans
    // tests/integration/saved-splits-rls.test.ts et team-dashboard-rls.test.ts).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)',
      [
        PLATFORM_ADMIN,
        'admin@example.com',
        TEAM_MANAGER,
        'manager@example.com',
        OTHER_CLIENT,
        'client@example.com',
        OTHER_TEAM_ORDER_OWNER,
        'order-owner@example.com',
      ],
    );
    // `on_auth_user_created` (migration 0002) crée déjà une ligne `profiles`
    // par trigger dès l'insertion dans `auth.users` ci-dessus -- ON CONFLICT
    // DO UPDATE pour fixer le nom/rôle plutôt qu'un INSERT simple.
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'admin@example.com', 'Admin Plateforme', 'platform_admin'),
        ($2, 'manager@example.com', 'Responsable', 'team_manager'),
        ($3, 'client@example.com', 'Client Quelconque', 'client'),
        ($4, 'order-owner@example.com', 'Propriétaire Commande', 'client')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [PLATFORM_ADMIN, TEAM_MANAGER, OTHER_CLIENT, OTHER_TEAM_ORDER_OWNER],
    );

    // Une équipe sans AUCUN lien avec TEAM_MANAGER (qui ne gère rien ici --
    // sert juste à représenter un rôle "staff" générique non-admin).
    await client.query(`INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe Admin Test', 'equipe-admin-dash-test')`, [TEAM_A]);

    // Commande appartenant à un AUTRE client (OTHER_TEAM_ORDER_OWNER), donc
    // invisible à TEAM_MANAGER/OTHER_CLIENT mais visible à PLATFORM_ADMIN.
    const order = await client.query<{ id: string }>(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, tax_cents, shipping_cents, total_cents, credit_total_cents, team_id)
       VALUES ('CMD-ADMIN-TEST-1', $1, 'paid', 10000, 1000, 0, 11000, 5000, $2) RETURNING id`,
      [OTHER_TEAM_ORDER_OWNER, TEAM_A],
    );
    orderId = order.rows[0]!.id;

    // service_role pour insérer credit/payout sans dépendre d'un calcul
    // applicatif (données de départ, pas la cible de ce test).
    await client.query('SET ROLE service_role');
    const credit = await client.query<{ id: string }>(
      `INSERT INTO order_credits (order_id, beneficiary_type, beneficiary_id, amount_cents, status)
       VALUES ($1, 'team', $2, 5000, 'active') RETURNING id`,
      [orderId, TEAM_A],
    );
    creditId = credit.rows[0]!.id;
    const payout = await client.query<{ id: string }>(
      `INSERT INTO payouts (beneficiary_type, beneficiary_id, amount_cents, status)
       VALUES ('team', $1, 5000, 'calculated') RETURNING id`,
      [TEAM_A],
    );
    payoutId = payout.rows[0]!.id;
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('PLATFORM_ADMIN lit la commande, le crédit ET le versement -- aucun lien personnel requis', async () => {
    const orders = await asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM orders WHERE id = $1', [orderId]);
    expect(orders).toHaveLength(1);

    const credits = await asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM order_credits WHERE id = $1', [creditId]);
    expect(credits).toHaveLength(1);

    const payouts = await asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM payouts WHERE id = $1', [payoutId]);
    expect(payouts).toHaveLength(1);
  });

  it("TEAM_MANAGER (rôle non-admin, sans lien avec cette commande/équipe) ne voit NI la commande NI le crédit NI le versement", async () => {
    const orders = await asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM orders WHERE id = $1', [orderId]);
    expect(orders).toHaveLength(0);

    const credits = await asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM order_credits WHERE id = $1', [creditId]);
    expect(credits).toHaveLength(0);

    const payouts = await asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM payouts WHERE id = $1', [payoutId]);
    expect(payouts).toHaveLength(0);
  });

  it('OTHER_CLIENT (client quelconque, pas propriétaire de cette commande) ne voit rien non plus', async () => {
    const orders = await asRole(client, 'authenticated', OTHER_CLIENT, 'SELECT id FROM orders WHERE id = $1', [orderId]);
    expect(orders).toHaveLength(0);
  });

  it('anon (invité) ne voit ni les commandes, ni les crédits, ni les versements', async () => {
    const orders = await asRole(client, 'anon', null, 'SELECT id FROM orders');
    expect(orders).toHaveLength(0);
    const credits = await asRole(client, 'anon', null, 'SELECT id FROM order_credits');
    expect(credits).toHaveLength(0);
    const payouts = await asRole(client, 'anon', null, 'SELECT id FROM payouts');
    expect(payouts).toHaveLength(0);
  });

  it('OTHER_TEAM_ORDER_OWNER (propriétaire RÉEL de la commande) la voit -- régression : `orders_select_scoped` (user_id = auth.uid()) non affectée', async () => {
    const orders = await asRole(client, 'authenticated', OTHER_TEAM_ORDER_OWNER, 'SELECT id FROM orders WHERE id = $1', [orderId]);
    expect(orders).toHaveLength(1);
  });
});
