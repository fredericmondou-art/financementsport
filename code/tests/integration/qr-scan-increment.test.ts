/**
 * Test d'intégration (Tâche 1.5.1) : la fonction Postgres
 * `resolve_and_count_qr_scan` (migration 0012) lit ET incrémente
 * `scan_count` en une seule opération atomique -- voir le commentaire de la
 * migration pour la justification (éviter la fenêtre de course d'un
 * SELECT puis UPDATE séparés, même raisonnement que `create_paid_order`,
 * migration 0006). C'est cette fonction, pas le wrapper TypeScript de la
 * route (`app/api/qr/[code]/route.ts`, simple appel `supabase.rpc()`), qui
 * porte la garantie d'atomicité -- donc c'est elle qu'il faut tester
 * directement (même principe que tests/integration/create-paid-order.test.ts).
 *
 * Même harnais Postgres embarqué que tests/integration/rls-policies.test.ts
 * (stub schéma `auth` + rôles anon/authenticated/service_role), étendu
 * jusqu'à la migration 0012. `qr_codes.target_id` est polymorphe et sans
 * contrainte de clé étrangère (commentaire du schéma, migration 0001) -- on
 * peut donc insérer une ligne de test sans dépendre du reste du seed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

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

interface ScanRow {
  target_type: string;
  target_id: string;
  redirect_url: string | null;
  expires_at: string | null;
}

describe('resolve_and_count_qr_scan (Tâche 1.5.1, atomicité du comptage de scans)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-qr-test-'));

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
    await pg.createDatabase('sportif_qr_test');

    client = pg.getPgClient('sportif_qr_test');
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
      '0007_public_campaign_views.sql',
      '0008_campaign_creation_assistant.sql',
      '0009_order_credits_select_own_order.sql',
      '0010_campaign_drafts.sql',
      '0011_campaign_supporter_count_view.sql',
      '0012_qr_scan_increment.sql',
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

  async function insertQrCode(args: {
    code: string;
    targetType: string;
    targetId: string;
    redirectUrl?: string | null;
    expiresAt?: string | null;
  }): Promise<void> {
    await client.query(
      `INSERT INTO qr_codes (target_type, target_id, code, redirect_url, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [args.targetType, args.targetId, args.code, args.redirectUrl ?? null, args.expiresAt ?? null],
    );
  }

  async function callResolveAndCount(code: string): Promise<ScanRow | null> {
    const result = await client.query<ScanRow>('SELECT * FROM resolve_and_count_qr_scan($1)', [code]);
    return result.rows[0] ?? null;
  }

  it('incrémente scan_count à chaque appel et renvoie la cible', async () => {
    const targetId = '11111111-1111-1111-1111-111111111111';
    await insertQrCode({ code: 'QR-TEST-001', targetType: 'athlete', targetId });

    const first = await callResolveAndCount('QR-TEST-001');
    expect(first).toMatchObject({ target_type: 'athlete', target_id: targetId });

    const { rows } = await client.query<{ scan_count: number }>(
      'SELECT scan_count FROM qr_codes WHERE code = $1',
      ['QR-TEST-001'],
    );
    expect(rows[0]?.scan_count).toBe(1);

    await callResolveAndCount('QR-TEST-001');
    await callResolveAndCount('QR-TEST-001');
    const { rows: rowsAfter } = await client.query<{ scan_count: number }>(
      'SELECT scan_count FROM qr_codes WHERE code = $1',
      ['QR-TEST-001'],
    );
    expect(rowsAfter[0]?.scan_count).toBe(3);
  });

  it('renvoie redirect_url et expires_at tels que stockés', async () => {
    const targetId = '22222222-2222-2222-2222-222222222222';
    await insertQrCode({
      code: 'QR-TEST-002',
      targetType: 'product',
      targetId,
      redirectUrl: 'https://exemple.com/boutique',
      expiresAt: '2020-01-01T00:00:00Z',
    });

    const row = await callResolveAndCount('QR-TEST-002');
    expect(row).toMatchObject({
      target_type: 'product',
      target_id: targetId,
      redirect_url: 'https://exemple.com/boutique',
    });
    expect(row?.expires_at).toBeTruthy();
  });

  it('ne renvoie rien (et ne plante pas) pour un code inconnu', async () => {
    const row = await callResolveAndCount('QR-INCONNU-XYZ');
    expect(row).toBeNull();
  });

  it('plusieurs scans concurrents sur le même code ne se perdent pas (atomicité)', async () => {
    const targetId = '33333333-3333-3333-3333-333333333333';
    await insertQrCode({ code: 'QR-TEST-CONCURRENT', targetType: 'team', targetId });

    await Promise.all(Array.from({ length: 10 }, () => callResolveAndCount('QR-TEST-CONCURRENT')));

    const { rows } = await client.query<{ scan_count: number }>(
      'SELECT scan_count FROM qr_codes WHERE code = $1',
      ['QR-TEST-CONCURRENT'],
    );
    expect(rows[0]?.scan_count).toBe(10);
  });
});
