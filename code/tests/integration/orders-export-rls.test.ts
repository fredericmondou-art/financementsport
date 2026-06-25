/**
 * Tests d'intégration -- Tâche 1.5.11 (docs/prompts/phase-1-5.md) : export
 * des commandes (admin).
 *
 * Deux préoccupations distinctes, voir "Tests attendus" de la spec :
 *
 * 1. RLS (migration 0020) + garde de rôle explicite (`canExportOrders`).
 *    Même harnais que tests/integration/distribution-rls.test.ts (Postgres
 *    embarqué jetable). Ce que ce bloc prouve, précisément :
 *      a. ACCOUNTING ne pouvait PAS lire `campaigns`/`teams` avant la
 *         migration 0020 (documenté dans son commentaire de tête) -- ce test
 *         prouve qu'il le PEUT maintenant (régression positive de 0020).
 *      b. PLATFORM_ADMIN lit toujours tout (policies existantes, non
 *         affectées par 0020).
 *      c. SUPPORT et LOGISTICS peuvent LIRE `orders` via la RLS existante
 *         (migration 0005, `orders_select_scoped`) -- preuve DIRECTE que la
 *         RLS seule NE BLOQUE PAS ces rôles, et donc que la garde explicite
 *         `canExportOrders()` (vérifiée par la page et la route CSV, pas par
 *         la RLS) est seule responsable de leur refus de la fonctionnalité
 *         d'export. `canExportOrders('support')`/`canExportOrders('logistics')`
 *         retournent bien `false` (voir tests/unit/export-orders.test.ts) --
 *         ce test d'intégration complète cette preuve unitaire en montrant
 *         que ce n'est PAS la RLS qui ferait ce travail à leur place.
 *      d. OTHER_MANAGER (team_manager sans lien avec la campagne) ne voit
 *         rien -- régression sur les policies existantes.
 *
 * 2. Réconciliation export <-> rapport de campagne (Tâche 1.5.9). Fonctions
 *    PURES uniquement (pas besoin de base) : `buildOrderExportRows` et
 *    `summarizeSales`/`summarizeTaxBreakdown` partagent les mêmes colonnes
 *    sources (`orders.total_cents`/`tax_cents`/`shipping_cents`) et la même
 *    logique de ventilation TPS/TVQ (`splitQcTax`/`findApplicableTaxRateBps`)
 *    -- ce test prouve que sommer les colonnes de l'export pour les
 *    commandes PAYÉES d'une campagne donne EXACTEMENT les totaux du rapport
 *    de campagne, satisfaisant le critère d'acceptation explicite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { buildOrderExportRows, canExportOrders, type OrderRow } from '@/lib/export/orders';
import { summarizeSales, summarizeTaxBreakdown } from '@/lib/reports/campaign';
import { formatCents } from '@/lib/format-cents';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const ACCOUNTING_USER = '77777777-0000-0000-0000-000000000001';
const PLATFORM_ADMIN = '77777777-0000-0000-0000-000000000002';
const SUPPORT_USER = '77777777-0000-0000-0000-000000000003';
const LOGISTICS_USER = '77777777-0000-0000-0000-000000000004';
const OTHER_MANAGER = '77777777-0000-0000-0000-000000000005';
const TEAM_A = '77777777-1111-0000-0000-000000000001';
const TEAM_B = '77777777-1111-0000-0000-000000000002';
const ATHLETE_A = '77777777-2222-0000-0000-000000000001';

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

describe('RLS export des commandes (migration 0020 + garde canExportOrders, Tâche 1.5.11)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let orderId: string;
  let campaignId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-orders-export-rls-test-'));

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
    const dbName = `sportif_orders_export_rls_${port}`;
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
      `INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)`,
      [
        ACCOUNTING_USER, 'accounting-1-5-11@example.com',
        PLATFORM_ADMIN, 'admin-1-5-11@example.com',
        SUPPORT_USER, 'support-1-5-11@example.com',
        LOGISTICS_USER, 'logistics-1-5-11@example.com',
        OTHER_MANAGER, 'manager-b-1-5-11@example.com',
      ],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'accounting-1-5-11@example.com', 'Compta A', 'accounting'),
        ($2, 'admin-1-5-11@example.com', 'Admin Plateforme', 'platform_admin'),
        ($3, 'support-1-5-11@example.com', 'Support A', 'support'),
        ($4, 'logistics-1-5-11@example.com', 'Logistique A', 'logistics'),
        ($5, 'manager-b-1-5-11@example.com', 'Responsable B', 'team_manager')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email`,
      [ACCOUNTING_USER, PLATFORM_ADMIN, SUPPORT_USER, LOGISTICS_USER, OTHER_MANAGER],
    );

    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-1-5-11'), ($2, 'Équipe B', 'equipe-b-1-5-11')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2)`,
      [OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie-1-5-11')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'active', 'Campagne Export 1.5.11', 'campagne-export-1-5-11', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    campaignId = campaign.rows[0]!.id;

    await client.query('SET ROLE service_role');
    const order = await client.query<{ id: string }>(
      `INSERT INTO orders (order_number, status, subtotal_cents, tax_cents, total_cents, credit_total_cents, primary_campaign_id, team_id)
       VALUES ('CMD-EXPORT-0001', 'paid', 10000, 1497, 11497, 4000, $1, $2)
       RETURNING id`,
      [campaignId, TEAM_A],
    );
    orderId = order.rows[0]!.id;
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('ACCOUNTING peut lire les commandes (migration 0005, déjà en place avant 1.5.11)', async () => {
    const orders = await asRole<{ id: string }>(client, 'authenticated', ACCOUNTING_USER, 'SELECT id FROM orders');
    expect(orders.map((o) => o.id)).toContain(orderId);
  });

  it("ACCOUNTING peut désormais lire campaigns/teams (migration 0020 -- l'écart RLS comblé pour la Tâche 1.5.11)", async () => {
    const campaigns = await asRole<{ id: string }>(
      client, 'authenticated', ACCOUNTING_USER, 'SELECT id FROM campaigns WHERE id = $1', [campaignId],
    );
    expect(campaigns).toHaveLength(1);

    const teams = await asRole<{ id: string }>(
      client, 'authenticated', ACCOUNTING_USER, 'SELECT id FROM teams WHERE id = $1', [TEAM_A],
    );
    expect(teams).toHaveLength(1);
  });

  it('PLATFORM_ADMIN lit tout (orders/campaigns/teams), policies existantes non affectées par 0020', async () => {
    const orders = await asRole<{ id: string }>(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM orders');
    expect(orders.map((o) => o.id)).toContain(orderId);
    const campaigns = await asRole<{ id: string }>(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM campaigns');
    expect(campaigns.map((c) => c.id)).toContain(campaignId);
    const teams = await asRole<{ id: string }>(client, 'authenticated', PLATFORM_ADMIN, 'SELECT id FROM teams WHERE id = $1', [TEAM_A]);
    expect(teams).toHaveLength(1);
  });

  it(
    'SUPPORT et LOGISTICS peuvent LIRE les commandes via la RLS existante -- ' +
      "preuve que la RLS seule ne bloque PAS ces rôles : c'est canExportOrders() " +
      "(false pour eux, voir tests unitaires) qui les empêche d'exporter, pas la RLS",
    async () => {
      const supportOrders = await asRole<{ id: string }>(client, 'authenticated', SUPPORT_USER, 'SELECT id FROM orders');
      expect(supportOrders.map((o) => o.id)).toContain(orderId);
      expect(canExportOrders('support')).toBe(false);

      const logisticsOrders = await asRole<{ id: string }>(client, 'authenticated', LOGISTICS_USER, 'SELECT id FROM orders');
      expect(logisticsOrders.map((o) => o.id)).toContain(orderId);
      expect(canExportOrders('logistics')).toBe(false);
    },
  );

  it("OTHER_MANAGER (team_manager sans lien avec cette campagne) ne voit ni la commande ni la campagne ni l'équipe -- régression sur les policies existantes", async () => {
    const orders = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM orders');
    expect(orders).toHaveLength(0);

    const campaigns = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM campaigns WHERE id = $1', [campaignId]);
    expect(campaigns).toHaveLength(0);

    const teams = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM teams WHERE id = $1', [TEAM_A]);
    expect(teams).toHaveLength(0);
  });

  it('anon (non authentifié) ne voit rien', async () => {
    const orders = await asRole(client, 'anon', null, 'SELECT id FROM orders');
    expect(orders).toHaveLength(0);
  });
});

describe('Réconciliation export <-> rapport de campagne (critère d\'acceptation explicite, Tâche 1.5.11)', () => {
  const taxRates = [{ province: 'QC', rate_bps: 1497, effective_at: '2020-01-01T00:00:00.000Z' }];

  function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
    return {
      id: randomUUID(),
      order_number: 'CMD-0001',
      user_id: null,
      guest_email: null,
      status: 'paid',
      subtotal_cents: 10000,
      tax_cents: 1497,
      shipping_cents: 0,
      total_cents: 11497,
      credit_total_cents: 4000,
      shipping_address_id: null,
      primary_campaign_id: null,
      team_id: null,
      stripe_payment_intent_id: null,
      notes_internal: null,
      created_at: '2026-05-01T12:00:00.000Z',
      paid_at: '2026-05-01T12:05:00.000Z',
      updated_at: '2026-05-01T12:05:00.000Z',
      ...overrides,
    };
  }

  it(
    "la somme des colonnes Total/TPS/TVQ/Livraison de l'export, pour les commandes PAYÉES d'une campagne, " +
      'égale exactement summarizeSales/summarizeTaxBreakdown (Tâche 1.5.9) pour le même sous-ensemble',
    () => {
      const campaignId = randomUUID();
      const orders = [
        makeOrder({ primary_campaign_id: campaignId, subtotal_cents: 10000, tax_cents: 1497, shipping_cents: 500, total_cents: 11997 }),
        makeOrder({ primary_campaign_id: campaignId, subtotal_cents: 5000, tax_cents: 748, shipping_cents: 0, total_cents: 5748 }),
        // Commande NON payée sur la même campagne -- doit être exclue des
        // DEUX côtés de la comparaison (summarizeSales filtre déjà sur
        // isOrderPaid ; l'export, lui, la liste mais elle ne doit pas
        // contribuer à un total "ventes payées").
        makeOrder({ primary_campaign_id: campaignId, status: 'payment_pending', subtotal_cents: 2000, tax_cents: 299, shipping_cents: 0, total_cents: 2299, paid_at: null }),
        // Commande d'une AUTRE campagne -- ne doit contribuer à aucun des
        // deux totaux (le rapport est scopé par campagne, et ce test ne
        // somme que les lignes export de campaignId).
        makeOrder({ primary_campaign_id: randomUUID(), subtotal_cents: 99999, tax_cents: 9999, shipping_cents: 0, total_cents: 109998 }),
      ];

      const ordersForThisCampaign = orders.filter((o) => o.primary_campaign_id === campaignId);
      const report = {
        sales: summarizeSales(ordersForThisCampaign),
        tax: summarizeTaxBreakdown(ordersForThisCampaign, taxRates),
      };

      const rows = buildOrderExportRows({
        orders: ordersForThisCampaign,
        credits: [],
        taxRates,
        beneficiaryLabels: new Map(),
        campaignNames: new Map(),
        teamNames: new Map(),
      });

      // Colonnes de l'export (voir ORDER_EXPORT_HEADERS) : index 6 = "Payée",
      // 7 = Sous-total, 8 = TPS, 9 = TVQ, 10 = Livraison, 11 = Total.
      const paidRows = rows.filter((row) => row[6] === 'Oui');
      expect(paidRows).toHaveLength(2); // les 2 commandes payées de CETTE campagne, pas la 3e (non payée) ni la 4e (autre campagne)

      const sumFormatted = (values: string[]): string => formatCents(values.reduce((sum, v) => sum + parseDollars(v), 0));
      function parseDollars(formatted: string): number {
        // formatCents produit "XXX,YY $" (fr-CA) -- inverse minimal pour ce test.
        const numeric = formatted.replace(/[^\d,.-]/g, '').replace(',', '.');
        return Math.round(parseFloat(numeric) * 100);
      }

      // "Sous-total" (subtotal_cents) exclut taxe ET livraison -- le rapport
      // n'a pas de notion équivalente directe, mais
      // netSalesCents (= gross - tax) = subtotal + shipping, donc
      // sous-total = netSalesCents - shippingCents.
      expect(sumFormatted(paidRows.map((r) => r[7]!))).toBe(
        formatCents(report.sales.netSalesCents - report.sales.shippingCents),
      );
      expect(sumFormatted(paidRows.map((r) => r[10]!))).toBe(formatCents(report.sales.shippingCents));
      expect(sumFormatted(paidRows.map((r) => r[8]!))).toBe(formatCents(report.tax.tpsCents));
      expect(sumFormatted(paidRows.map((r) => r[9]!))).toBe(formatCents(report.tax.tvqCents));

      const totalExport = paidRows.reduce((sum, r) => sum + parseDollars(r[11]!), 0);
      expect(formatCents(totalExport)).toBe(formatCents(report.sales.grossSalesCents));
    },
  );
});
