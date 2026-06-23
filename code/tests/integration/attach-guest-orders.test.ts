/**
 * Test d'intégration — Tâche 1.6.A2 (docs/prompts/phase-1-6.md).
 *
 * `lib/orders/attach-guest-orders.ts` n'a pas de logique propre à tester en
 * intégration (c'est `lib/cart/attach-guest-cart.ts` qui sert de modèle, déjà
 * couvert en unitaire avec un repo en mémoire -- voir tests/unit/
 * orders-attach-guest-orders.test.ts). Ce qui DOIT être prouvé contre un vrai
 * Postgres, c'est que :
 *   1. « Rattachement par e-mail correct » : la requête exécutée par
 *      `createSupabaseAttachGuestOrdersRepo` (UPDATE ... WHERE guest_email =
 *      $1 AND user_id IS NULL) rattache bien toutes les commandes invité
 *      correspondantes, et UNIQUEMENT celles-ci -- pas une commande avec un
 *      autre courriel, pas une commande déjà rattachée à un autre compte.
 *   2. « Refus [d'inscription] sans effet sur la commande » : si la création
 *      de compte échoue, `attachGuestOrdersToUser` n'est jamais appelée
 *      (voir actions.ts) -- donc aucune commande ne bouge. Démontré ici a
 *      fortiori par défense en profondeur : même si cette même requête était
 *      tentée par un rôle non administrateur (anon/authenticated, jamais le
 *      cas en pratique -- le repo n'est construit que sur service_role), RLS
 *      (migration 0003, policy `orders_admin_update`) la bloque entièrement
 *      et les commandes restent inchangées.
 *
 * Même harnais Postgres embarqué que tests/integration/rls-policies.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const NEW_USER_ID = '99999999-4444-0000-0000-000000000001';
const OTHER_USER_ID = '99999999-4444-0000-0000-000000000002';
const ORDER_MATCH_1 = '99999999-5555-0000-0000-000000000001';
const ORDER_MATCH_2 = '99999999-5555-0000-0000-000000000002';
const ORDER_OTHER_EMAIL = '99999999-5555-0000-0000-000000000003';
const ORDER_ALREADY_ATTACHED = '99999999-5555-0000-0000-000000000004';

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

describe('Rattachement des commandes invité à un compte (Tâche 1.6.A2)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  /** Reproduit exactement la requête de `createSupabaseAttachGuestOrdersRepo`. */
  async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(
    role: 'anon' | 'authenticated' | 'service_role',
    jwtSub: string | null,
    guestEmail: string,
    userId: string,
  ): Promise<T[]> {
    await client.query(`SET ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [jwtSub ?? '']);
    try {
      const result = await client.query<T>(
        `UPDATE orders SET user_id = $1, updated_at = now()
         WHERE guest_email = $2 AND user_id IS NULL
         RETURNING id`,
        [userId, guestEmail],
      );
      return result.rows;
    } finally {
      await client.query('RESET ROLE');
    }
  }

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-attach-orders-test-'));

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
    await pg.createDatabase('sportif_attach_orders_test');

    client = pg.getPgClient('sportif_attach_orders_test');
    await client.connect();

    // --- Stubs Supabase, TEST UNIQUEMENT (même pattern que rls-policies.test.ts) ---
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

    const migrationFiles = [
      '0001_initial_schema.sql',
      '0002_auth_profile_trigger.sql',
      '0003_rls_policies.sql',
      '0004_harden_function_grants.sql',
      '0005_move_rls_helpers_to_private_schema.sql',
    ];
    for (const file of migrationFiles) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
      if (file === '0001_initial_schema.sql') {
        await client.query(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
        );
        await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
        await client.query(
          'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;',
        );
      }
    }

    // --- Fixtures : un nouveau compte (celui qui vient de s'inscrire après
    // l'achat) et un autre compte déjà existant (propriétaire légitime d'une
    // commande déjà rattachée, qui ne doit jamais être déplacée). ---
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4)', [
      NEW_USER_ID,
      'parent@example.com',
      OTHER_USER_ID,
      'quelquun-dautre@example.com',
    ]);
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'parent@example.com', 'Parent Nouveau Compte', 'client'),
        ($2, 'quelquun-dautre@example.com', 'Quelqu''un d''Autre', 'client')
       ON CONFLICT (id) DO NOTHING`,
      [NEW_USER_ID, OTHER_USER_ID],
    );

    // Quatre commandes payées :
    //   - deux commandes invité avec le courriel du nouveau compte (doivent
    //     être rattachées) ;
    //   - une commande invité avec un AUTRE courriel (ne doit jamais bouger) ;
    //   - une commande qui a DÉJÀ un user_id (un autre compte) bien que le
    //     courriel invité corresponde -- simule un cas de courriel partagé ;
    //     ne doit jamais être réassignée (le repo filtre `user_id IS NULL`).
    await client.query(
      `INSERT INTO orders (id, order_number, user_id, guest_email, status, subtotal_cents, tax_cents, total_cents)
       VALUES
        ($1, 'CMD-TEST-100001', NULL, 'parent@example.com', 'paid', 1000, 150, 1150),
        ($2, 'CMD-TEST-100002', NULL, 'parent@example.com', 'paid', 2000, 300, 2300),
        ($3, 'CMD-TEST-100003', NULL, 'autre@example.com', 'paid', 3000, 450, 3450),
        ($4, 'CMD-TEST-100004', $5, 'parent@example.com', 'paid', 4000, 600, 4600)`,
      [ORDER_MATCH_1, ORDER_MATCH_2, ORDER_OTHER_EMAIL, ORDER_ALREADY_ATTACHED, OTHER_USER_ID],
    );
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (pg) {
      await pg.stop();
    }
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('refus (rôle non administrateur, ex. inscription jamais menée à terme) : RLS bloque tout, aucune commande ne bouge', async () => {
    // Avant toute tentative de rattachement -- équivalent SQL du cas
    // « création de compte échouée -> attachGuestOrdersToUser jamais appelée »
    // (voir actions.ts) : aucune commande ne doit avoir bougé, et même une
    // tentative explicite par un rôle non habilité (anon, ou authenticated
    // sans privilège admin) doit être un no-op total grâce à RLS.
    const asAnon = await asRole('anon', null, 'parent@example.com', NEW_USER_ID);
    expect(asAnon).toHaveLength(0);

    const asAuthenticatedNonAdmin = await asRole(
      'authenticated',
      NEW_USER_ID, // le nouveau compte lui-même n'est pas platform_admin
      'parent@example.com',
      NEW_USER_ID,
    );
    expect(asAuthenticatedNonAdmin).toHaveLength(0);

    const stillUnattached = await client.query<{ user_id: string | null }>(
      'SELECT user_id FROM orders WHERE id = ANY($1)',
      [[ORDER_MATCH_1, ORDER_MATCH_2]],
    );
    expect(stillUnattached.rows.every((row) => row.user_id === null)).toBe(true);
  });

  it('rattachement par e-mail correct (service_role, comme le fait réellement le repo) : uniquement les commandes invité sans compte avec ce courriel', async () => {
    const attached = await asRole('service_role', null, 'parent@example.com', NEW_USER_ID);

    expect(attached.map((row) => row.id).sort()).toEqual([ORDER_MATCH_1, ORDER_MATCH_2].sort());

    const orders = await client.query<{ id: string; user_id: string | null; guest_email: string }>(
      'SELECT id, user_id, guest_email FROM orders ORDER BY order_number',
    );
    const byId = new Map(orders.rows.map((row) => [row.id, row]));

    expect(byId.get(ORDER_MATCH_1)?.user_id).toBe(NEW_USER_ID);
    expect(byId.get(ORDER_MATCH_2)?.user_id).toBe(NEW_USER_ID);
    // Commande d'un autre courriel : jamais touchée.
    expect(byId.get(ORDER_OTHER_EMAIL)?.user_id).toBeNull();
    // Commande déjà rattachée à un autre compte : jamais réassignée, même si
    // le courriel invité correspond.
    expect(byId.get(ORDER_ALREADY_ATTACHED)?.user_id).toBe(OTHER_USER_ID);

    // Rejouer le même rattachement (ex. double-clic, nouvel essai) ne fait
    // plus rien -- les commandes ne sont plus `user_id IS NULL`.
    const replay = await asRole('service_role', null, 'parent@example.com', NEW_USER_ID);
    expect(replay).toHaveLength(0);
  });
});
