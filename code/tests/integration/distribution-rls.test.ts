/**
 * Test d'intégration -- Tâche 1.5.4 (docs/prompts/phase-1-5.md) : les
 * policies SUPPLÉMENTAIRES ajoutées par la migration 0014 pour permettre à
 * un responsable de campagne (`team_manager`/`club_admin`, via
 * `private.manages_campaign`) de lire les commandes/articles/profils
 * nécessaires à la liste de distribution (Tâche 1.5.4, voir
 * docs/DECISIONS.md pour le contexte de l'écart RLS comblé).
 *
 * Même harnais que tests/integration/saved-splits-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role) --
 * fichier dédié plutôt qu'ajouté à rls-policies.test.ts, même convention
 * établie par les tâches précédentes (CLAUDE.md section 6).
 *
 * Ce que ce test prouve, précisément :
 *   1. TEAM_MANAGER (gère TEAM_A via `memberships`) peut lire la commande de
 *      CLIENT_A sur la campagne de TEAM_A, ses articles, ET le profil de
 *      CLIENT_A (les trois nouvelles policies de la migration 0014).
 *   2. OTHER_MANAGER (gère une équipe SANS lien avec cette campagne) ne voit
 *      RIEN de tout ça -- la policy est bien scoped à `manages_campaign()`,
 *      pas un accès général aux commandes.
 *   3. anon (invité) ne voit rien non plus.
 *   4. Les policies existantes (propriétaire, platform_admin) restent
 *      intactes : CLIENT_A continue de lire sa propre commande (régression).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const CLIENT_A = '88888888-0000-0000-0000-000000000001';
const TEAM_MANAGER = '88888888-0000-0000-0000-000000000002';
const OTHER_MANAGER = '88888888-0000-0000-0000-000000000003';
const TEAM_A = '88888888-1111-0000-0000-000000000001';
const TEAM_B = '88888888-1111-0000-0000-000000000002';
const ATHLETE_A = '88888888-2222-0000-0000-000000000001';

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

describe('RLS orders/order_items/profiles pour responsables de campagne (migration 0014, Tâche 1.5.4)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let orderId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-distribution-rls-test-'));

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
    const dbName = `sportif_dist_rls_${port}`;
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

    // Voir tests/integration/saved-splits-rls.test.ts pour le détail du piège
    // (GRANT ... ON ALL TABLES n'est pas rétroactif) -- lancé une seule fois
    // après TOUTES les migrations, donc après 0014 aussi.
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [CLIENT_A, 'client-a@example.com', TEAM_MANAGER, 'manager-a@example.com', OTHER_MANAGER, 'manager-b@example.com'],
    );
    // `on_auth_user_created` (migration 0002) crée déjà une ligne `profiles`
    // par trigger dès l'insertion dans `auth.users` ci-dessus -- ON CONFLICT
    // DO UPDATE pour fixer le nom/rôle plutôt qu'un INSERT simple (même
    // piège déjà rencontré et documenté dans saved-splits-rls.test.ts).
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'client-a@example.com', 'Julie Tremblay', 'client'),
        ($2, 'manager-a@example.com', 'Responsable A', 'team_manager'),
        ($3, 'manager-b@example.com', 'Responsable B', 'team_manager')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [CLIENT_A, TEAM_MANAGER, OTHER_MANAGER],
    );

    // Deux équipes distinctes, deux memberships distincts -- TEAM_MANAGER ne
    // gère QUE TEAM_A, OTHER_MANAGER ne gère QUE TEAM_B.
    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a'), ($2, 'Équipe B', 'equipe-b')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'active', 'Campagne Équipe A', 'campagne-equipe-a', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    const campaignId = campaign.rows[0]!.id;

    // CLIENT_A passe une commande payée sur cette campagne, en tant que
    // `service_role` (même chemin que le webhook Stripe à la confirmation du
    // paiement, CLAUDE.md section 4) -- pas la cible de ce test, seulement
    // une donnée de départ.
    await client.query('SET ROLE service_role');
    const order = await client.query<{ id: string }>(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, tax_cents, total_cents, credit_total_cents, primary_campaign_id, team_id)
       VALUES ('CMD-TEST-0001', $1, 'paid', 1000, 150, 1150, 200, $2, $3)
       RETURNING id`,
      [CLIENT_A, campaignId, TEAM_A],
    );
    orderId = order.rows[0]!.id;
    const product = await client.query<{ id: string }>(
      `INSERT INTO products (name, slug, price_cents) VALUES ('Chocolat', 'chocolat-test', 500) RETURNING id`,
    );
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents, line_total_cents)
       VALUES ($1, $2, 'Chocolat', 2, 500, 1000)`,
      [orderId, product.rows[0]!.id],
    );
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('TEAM_MANAGER (gère TEAM_A, via memberships) lit la commande de CLIENT_A sur la campagne de son équipe', async () => {
    const orders = await asRole<{ id: string }>(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM orders');
    expect(orders.map((o) => o.id)).toContain(orderId);
  });

  it('TEAM_MANAGER lit les articles de cette commande', async () => {
    const items = await asRole<{ order_id: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT order_id FROM order_items',
    );
    expect(items.map((i) => i.order_id)).toContain(orderId);
  });

  it("TEAM_MANAGER lit le profil de CLIENT_A (l'acheteur) -- nécessaire pour le regroupement par client", async () => {
    const profiles = await asRole<{ id: string; full_name: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT id, full_name FROM profiles WHERE id = $1',
      [CLIENT_A],
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.full_name).toBe('Julie Tremblay');
  });

  it("OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) NE voit AUCUNE de ces trois choses", async () => {
    const orders = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM orders');
    expect(orders).toHaveLength(0);

    const items = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM order_items');
    expect(items).toHaveLength(0);

    const profiles = await asRole(
      client,
      'authenticated',
      OTHER_MANAGER,
      'SELECT id FROM profiles WHERE id = $1',
      [CLIENT_A],
    );
    expect(profiles).toHaveLength(0);
  });

  it('anon (invité) ne voit rien', async () => {
    const orders = await asRole(client, 'anon', null, 'SELECT id FROM orders');
    expect(orders).toHaveLength(0);
  });

  it('régression : CLIENT_A continue de lire sa propre commande (policy propriétaire existante, migration 0003, non affectée)', async () => {
    const orders = await asRole<{ id: string }>(client, 'authenticated', CLIENT_A, 'SELECT id FROM orders');
    expect(orders.map((o) => o.id)).toContain(orderId);
  });
});
