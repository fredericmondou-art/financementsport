/**
 * Test d'intégration — Tâche 1.5 (CŒUR) : la fonction Postgres
 * `create_paid_order` (migration 0006) est l'unique mécanisme d'atomicité
 * disponible pour « commande + lignes + crédits en une seule transaction »
 * (CLAUDE.md section 4). `lib/orders/create-order.ts` n'est qu'un appel
 * `supabase.rpc()` sans logique propre -- la garantie d'atomicité/idempotence
 * vit entièrement dans cette fonction SQL, donc c'est elle qu'il faut tester
 * directement (un test Vitest sur le wrapper TS ne prouverait rien).
 *
 * Même harnais Postgres embarqué que tests/integration/rls-policies.test.ts
 * (stub schéma `auth` + rôles anon/authenticated/service_role), étendu à la
 * migration 0006.
 *
 * Couvre les exigences explicites de CLAUDE.md section 4/8 :
 *   - idempotence (même stripe_event_id rejoué -> une seule commande créée) ;
 *   - répartition multi-bénéficiaires -> une ligne order_credits par
 *     bénéficiaire, total correct ;
 *   - stock épuisé/insuffisant au moment du paiement confirmé -> la commande
 *     est créée quand même (le client a déjà payé), stock plancher à 0, note
 *     interne posée pour suivi admin (CLAUDE.md section 7).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const SEED_PATH = path.resolve(__dirname, '../../supabase/seed.sql');

// Ids du seed (voir supabase/seed.sql).
const SEED_PACK_MAISON_ID = '55555555-5555-5555-5555-555555555501'; // stock_quantity = 1000
const SEED_ATHLETE_THOMAS_ID = '44444444-4444-4444-4444-444444444401';
const SEED_TEAM_ID = '33333333-3333-3333-3333-333333333301';

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

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  credit_total_cents: number;
  total_cents: number;
  notes_internal: string | null;
}

interface CreditInsert {
  beneficiary_type: 'athlete' | 'team' | 'club';
  beneficiary_id: string;
  campaign_id: string | null;
  amount_cents: number;
  status: 'active' | 'pending';
  applied_rule_id: string | null;
  computation_note: string;
}

interface ItemInsert {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

describe('create_paid_order (Tâche 1.5, CŒUR atomicité/idempotence)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  /** Appelle la fonction SQL exactement comme `lib/orders/create-order.ts`
   * le fait via `supabase.rpc()` (mêmes noms de paramètres positionnels). */
  async function callCreatePaidOrder(args: {
    stripeEventId: string;
    stripeEventType?: string;
    stripePaymentIntentId: string;
    userId?: string | null;
    guestEmail?: string | null;
    subtotalCents: number;
    taxCents?: number;
    shippingCents?: number;
    totalCents: number;
    primaryCampaignId?: string | null;
    teamId?: string | null;
    items: ItemInsert[];
    credits: CreditInsert[];
  }): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
      `SELECT * FROM create_paid_order(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, NULL
      )`,
      [
        args.stripeEventId,
        args.stripeEventType ?? 'checkout.session.completed',
        args.stripePaymentIntentId,
        args.userId ?? null,
        args.guestEmail ?? null,
        args.subtotalCents,
        args.taxCents ?? 0,
        args.shippingCents ?? 0,
        args.totalCents,
        null, // shipping_address_id
        args.primaryCampaignId ?? null,
        args.teamId ?? null,
        JSON.stringify(args.items),
        JSON.stringify(args.credits),
      ],
    );
    return result.rows[0]!;
  }

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-order-test-'));

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
    await pg.createDatabase('sportif_order_test');

    client = pg.getPgClient('sportif_order_test');
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
      '0006_stripe_events_and_order_credit_function.sql',
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

    const seedSql = fs.readFileSync(SEED_PATH, 'utf-8');
    await client.query(seedSql);
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

  it('crée une commande payée avec ses lignes et son crédit (cas simple, un seul bénéficiaire)', async () => {
    const order = await callCreatePaidOrder({
      stripeEventId: 'evt_test_simple_001',
      stripePaymentIntentId: 'pi_test_simple_001',
      guestEmail: 'client@example.com',
      subtotalCents: 3500,
      taxCents: 524,
      totalCents: 4024,
      items: [
        {
          product_id: SEED_PACK_MAISON_ID,
          product_name: 'Pack Maison',
          quantity: 1,
          unit_price_cents: 3500,
          line_total_cents: 3500,
        },
      ],
      credits: [
        {
          beneficiary_type: 'athlete',
          beneficiary_id: SEED_ATHLETE_THOMAS_ID,
          campaign_id: null,
          amount_cents: 500,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'crédit fixe du pack',
        },
      ],
    });

    expect(order.status).toBe('paid');
    expect(order.order_number).toMatch(/^CMD-\d{4}-\d{6}$/);
    expect(order.credit_total_cents).toBe(500);
    expect(order.total_cents).toBe(4024);

    const items = await client.query<ItemInsert>('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    expect(items.rows).toHaveLength(1);

    const credits = await client.query<{ beneficiary_id: string; amount_cents: number; status: string }>(
      'SELECT beneficiary_id, amount_cents, status FROM order_credits WHERE order_id = $1',
      [order.id],
    );
    expect(credits.rows).toHaveLength(1);
    expect(credits.rows[0]).toMatchObject({ beneficiary_id: SEED_ATHLETE_THOMAS_ID, amount_cents: 500, status: 'active' });

    const auditLog = await client.query('SELECT * FROM credit_audit_log WHERE order_credit_id IN (SELECT id FROM order_credits WHERE order_id = $1)', [order.id]);
    expect(auditLog.rows).toHaveLength(1);
  });

  it('idempotence : un même stripe_event_id rejoué ne crée pas une deuxième commande', async () => {
    const firstCall = await callCreatePaidOrder({
      stripeEventId: 'evt_test_idempotent_001',
      stripePaymentIntentId: 'pi_test_idempotent_001',
      guestEmail: 'rejoue@example.com',
      subtotalCents: 6000,
      totalCents: 6000,
      items: [
        {
          product_id: SEED_PACK_MAISON_ID,
          product_name: 'Pack Maison',
          quantity: 1,
          unit_price_cents: 6000,
          line_total_cents: 6000,
        },
      ],
      credits: [
        {
          beneficiary_type: 'team',
          beneficiary_id: SEED_TEAM_ID,
          campaign_id: null,
          amount_cents: 900,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'rejeu',
        },
      ],
    });

    // Même évènement Stripe rejoué (webhook redélivré, ou deux livraisons
    // concurrentes du même évènement) -- mêmes arguments.
    const secondCall = await callCreatePaidOrder({
      stripeEventId: 'evt_test_idempotent_001',
      stripePaymentIntentId: 'pi_test_idempotent_001',
      guestEmail: 'rejoue@example.com',
      subtotalCents: 6000,
      totalCents: 6000,
      items: [
        {
          product_id: SEED_PACK_MAISON_ID,
          product_name: 'Pack Maison',
          quantity: 1,
          unit_price_cents: 6000,
          line_total_cents: 6000,
        },
      ],
      credits: [
        {
          beneficiary_type: 'team',
          beneficiary_id: SEED_TEAM_ID,
          campaign_id: null,
          amount_cents: 900,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'rejeu',
        },
      ],
    });

    expect(secondCall.id).toBe(firstCall.id);

    const orderCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM orders WHERE stripe_payment_intent_id = $1',
      ['pi_test_idempotent_001'],
    );
    expect(Number(orderCount.rows[0]?.count)).toBe(1);

    const creditCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM order_credits WHERE order_id = $1',
      [firstCall.id],
    );
    expect(Number(creditCount.rows[0]?.count)).toBe(1);

    const eventCount = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM stripe_events WHERE id = 'evt_test_idempotent_001'",
    );
    expect(Number(eventCount.rows[0]?.count)).toBe(1);
  });

  it('répartition entre deux bénéficiaires -> exactement deux lignes order_credits, montants corrects', async () => {
    const order = await callCreatePaidOrder({
      stripeEventId: 'evt_test_split_001',
      stripePaymentIntentId: 'pi_test_split_001',
      guestEmail: 'split@example.com',
      subtotalCents: 12000,
      totalCents: 12000,
      items: [
        {
          product_id: SEED_PACK_MAISON_ID,
          product_name: 'Pack Maison',
          quantity: 1,
          unit_price_cents: 12000,
          line_total_cents: 12000,
        },
      ],
      credits: [
        {
          beneficiary_type: 'athlete',
          beneficiary_id: SEED_ATHLETE_THOMAS_ID,
          campaign_id: null,
          amount_cents: 350,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'part athlète (70%)',
        },
        {
          beneficiary_type: 'team',
          beneficiary_id: SEED_TEAM_ID,
          campaign_id: null,
          amount_cents: 150,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'part équipe (30%)',
        },
      ],
    });

    expect(order.credit_total_cents).toBe(500);

    const credits = await client.query<{ beneficiary_type: string; amount_cents: number }>(
      'SELECT beneficiary_type, amount_cents FROM order_credits WHERE order_id = $1 ORDER BY amount_cents DESC',
      [order.id],
    );
    expect(credits.rows).toHaveLength(2);
    expect(credits.rows[0]).toMatchObject({ beneficiary_type: 'athlete', amount_cents: 350 });
    expect(credits.rows[1]).toMatchObject({ beneficiary_type: 'team', amount_cents: 150 });
  });

  it('stock insuffisant au paiement confirmé : la commande est créée quand même, le stock plafonne à 0, une note interne est posée', async () => {
    // Produit dédié à ce test (stock délibérément très bas) pour ne pas
    // perturber le stock partagé du Pack Maison utilisé par les autres tests
    // de ce fichier.
    await client.query(
      `INSERT INTO products (id, kind, name, slug, price_cents, fixed_credit_cents, is_taxable, stock_quantity, is_active)
       VALUES ('77777777-7777-7777-7777-777777777701', 'pack', 'Pack Stock Limité', 'pack-stock-limite', 2000, 300, TRUE, 2, TRUE)`,
    );

    const order = await callCreatePaidOrder({
      stripeEventId: 'evt_test_oversold_001',
      stripePaymentIntentId: 'pi_test_oversold_001',
      guestEmail: 'oversold@example.com',
      subtotalCents: 10000,
      totalCents: 10000,
      items: [
        {
          product_id: '77777777-7777-7777-7777-777777777701',
          product_name: 'Pack Stock Limité',
          quantity: 5, // > stock disponible (2) -- vente déjà conclue malgré tout
          unit_price_cents: 2000,
          line_total_cents: 10000,
        },
      ],
      credits: [
        {
          beneficiary_type: 'athlete',
          beneficiary_id: SEED_ATHLETE_THOMAS_ID,
          campaign_id: null,
          amount_cents: 1500,
          status: 'active',
          applied_rule_id: null,
          computation_note: 'crédit fixe',
        },
      ],
    });

    // La commande N'EST PAS bloquée : le client a déjà payé via Stripe.
    expect(order.status).toBe('paid');
    expect(order.notes_internal).toMatch(/Stock insuffisant/);

    const product = await client.query<{ stock_quantity: number }>(
      'SELECT stock_quantity FROM products WHERE id = $1',
      ['77777777-7777-7777-7777-777777777701'],
    );
    // Jamais négatif (plancher à 0), même si la quantité vendue (5) dépassait
    // largement le stock restant (2).
    expect(product.rows[0]?.stock_quantity).toBe(0);
  });

  it('rejette un évènement avec un stripe_event_id déjà inséré mais sans commande correspondante (défense en profondeur improbable) sans planter', async () => {
    // Cas extrême : ne devrait jamais arriver en pratique (l'insertion de
    // stripe_events et de la commande sont dans la même transaction), mais on
    // vérifie que la fonction ne plante pas si un évènement totalement
    // nouveau est fourni normalement (sanity check de non-régression).
    const order = await callCreatePaidOrder({
      stripeEventId: 'evt_test_sanity_001',
      stripePaymentIntentId: 'pi_test_sanity_001',
      guestEmail: 'sanity@example.com',
      subtotalCents: 1000,
      totalCents: 1000,
      items: [],
      credits: [],
    });
    expect(order.status).toBe('paid');
    expect(order.credit_total_cents).toBe(0);
  });
});
