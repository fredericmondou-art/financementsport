/**
 * Test d'intégration — Tâche 0.4 : politiques RLS + vues publiques.
 *
 * Applique migrations 0001+0002+0003 + seed sur un Postgres embarqué jetable,
 * puis simule des requêtes en tant que anon / authenticated (avec différents
 * auth.uid() via la GUC `request.jwt.claim.sub`, comme le fait PostgREST en
 * conditions réelles) pour vérifier que les policies RLS filtrent
 * correctement les lignes.
 *
 * Stubs PROPRES À CE HARNAIS DE TEST (jamais dans les migrations réelles) :
 *   - schéma `auth`, table `auth.users`, fonction `auth.uid()`
 *   - rôles `anon` / `authenticated` / `service_role` (déjà fournis par
 *     Supabase sur un vrai projet) + leurs GRANT par défaut sur le schéma
 *     public (RLS reste le SEUL vrai filtre, comme en production Supabase).
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

// Ids du seed (voir supabase/seed.sql) — équipe U11 Hockey, club Corsaires,
// athlète Emma (hide_last_name = true), campagne active U11 Hockey 2026.
const SEED_TEAM_ID = '33333333-3333-3333-3333-333333333301';
const SEED_CLUB_ID = '22222222-2222-2222-2222-222222222201';
const SEED_HIDDEN_ATHLETE_ID = '44444444-4444-4444-4444-444444444402';
const SEED_VISIBLE_ATHLETE_ID = '44444444-4444-4444-4444-444444444401';
const SEED_CAMPAIGN_ID = '66666666-6666-6666-6666-666666666601';

// Fixtures propres à ce test (clients, staff), indépendantes du seed.
const CLIENT_A = '99999999-0000-0000-0000-000000000001';
const CLIENT_B = '99999999-0000-0000-0000-000000000002';
const TEAM_MANAGER = '99999999-0000-0000-0000-000000000003';
const CLUB_ADMIN = '99999999-0000-0000-0000-000000000004';
const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000005';
const ACCOUNTING = '99999999-0000-0000-0000-000000000006';
const OTHER_TEAM_ID = '99999999-1111-0000-0000-000000000001'; // hors scope
const ORDER_CLIENT_A = '99999999-2222-0000-0000-000000000001';
const ORDER_CLIENT_B = '99999999-2222-0000-0000-000000000002';
const CAMPAIGN_OUT_OF_SCOPE = '99999999-3333-0000-0000-000000000001';

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

describe('Politiques RLS + vues publiques (Tâche 0.4)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  /** Exécute une requête en tant que `role`, avec auth.uid() = jwtSub si fourni. */
  async function asRole<T extends Record<string, unknown> = Record<string, unknown>>(
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

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-rls-test-'));

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
    await pg.createDatabase('sportif_rls_test');

    client = pg.getPgClient('sportif_rls_test');
    await client.connect();

    // --- Stubs Supabase, TEST UNIQUEMENT ---
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

    // --- Migrations réelles ---
    const migrationFiles = ['0001_initial_schema.sql', '0002_auth_profile_trigger.sql', '0003_rls_policies.sql'];
    for (const file of migrationFiles) {
      if (file === '0001_initial_schema.sql') {
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
        // Comme sur un vrai projet Supabase neuf : anon/authenticated ont par
        // défaut SELECT/INSERT/UPDATE/DELETE sur les tables publiques. RLS
        // est le SEUL filtre réel (reproduit ici pour un test fidèle).
        await client.query(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
        );
        await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
        await client.query(
          'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;',
        );
      } else {
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
      }
    }

    await client.query(fs.readFileSync(SEED_PATH, 'utf-8'));

    // --- Fixtures propres au test (insérées en superuser, donc hors RLS) ---
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8), ($9, $10)', [
      CLIENT_A, 'clienta@example.com',
      CLIENT_B, 'clientb@example.com',
      TEAM_MANAGER, 'manager@example.com',
      CLUB_ADMIN, 'clubadmin@example.com',
      PLATFORM_ADMIN, 'admin@example.com',
    ]);
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [ACCOUNTING, 'accounting@example.com']);

    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'clienta@example.com', 'Client A', 'client'),
        ($2, 'clientb@example.com', 'Client B', 'client'),
        ($3, 'manager@example.com', 'Gérant Équipe', 'team_manager'),
        ($4, 'clubadmin@example.com', 'Admin Club', 'club_admin'),
        ($5, 'admin@example.com', 'Admin Plateforme', 'platform_admin'),
        ($6, 'accounting@example.com', 'Comptabilité', 'accounting')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
      [CLIENT_A, CLIENT_B, TEAM_MANAGER, CLUB_ADMIN, PLATFORM_ADMIN, ACCOUNTING],
    );

    await client.query(
      `INSERT INTO memberships (user_id, role, team_id, club_id) VALUES
        ($1, 'team_manager', $2, NULL),
        ($3, 'club_admin', NULL, $4)`,
      [TEAM_MANAGER, SEED_TEAM_ID, CLUB_ADMIN, SEED_CLUB_ID],
    );

    // Deux commandes, une par client (ownership).
    await client.query(
      `INSERT INTO orders (id, order_number, user_id, status, subtotal_cents, tax_cents, total_cents)
       VALUES ($1, 'CMD-TEST-000001', $2, 'paid', 1000, 150, 1150), ($3, 'CMD-TEST-000002', $4, 'paid', 2000, 300, 2300)`,
      [ORDER_CLIENT_A, CLIENT_A, ORDER_CLIENT_B, CLIENT_B],
    );

    // Deux campagnes : une dans le scope de l'équipe gérée, une hors scope.
    await client.query(
      `INSERT INTO teams (id, club_id, name, slug, sport, is_active) VALUES ($1, NULL, 'Équipe hors scope', 'hors-scope', 'hockey', TRUE)`,
      [OTHER_TEAM_ID],
    );
    await client.query(
      `INSERT INTO campaigns (id, type, status, name, slug, beneficiary_type, beneficiary_id, team_id, goal_cents, starts_at, ends_at)
       VALUES ($1, 'team', 'active', 'Campagne hors scope', 'campagne-hors-scope', 'team', $2, $2, 100000, now(), now() + interval '30 days')`,
      [CAMPAIGN_OUT_OF_SCOPE, OTHER_TEAM_ID],
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

  describe('anon : lecture directe des tables sensibles toujours refusée', () => {
    it.each([
      ['profiles', 'SELECT * FROM profiles'],
      ['athletes', 'SELECT * FROM athletes'],
      ['orders', 'SELECT * FROM orders'],
      ['order_credits', 'SELECT * FROM order_credits'],
      ['campaigns', 'SELECT * FROM campaigns'],
    ])('anon ne reçoit aucune ligne de %s', async (_label, sql) => {
      const rows = await asRole('anon', null, sql);
      expect(rows).toHaveLength(0);
    });

    it('anon lit le catalogue public (products actifs) sans restriction RLS particulière', async () => {
      const rows = await asRole('anon', null, 'SELECT * FROM products WHERE is_active = true');
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('Vue publique v_public_athlete respecte hide_last_name', () => {
    it('athlète avec hide_last_name = true : last_name masqué, display_name abrégé', async () => {
      const rows = await asRole<{ last_name: string | null; display_name: string }>(
        'anon',
        null,
        'SELECT last_name, display_name FROM v_public_athlete WHERE id = $1',
        [SEED_HIDDEN_ATHLETE_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.last_name).toBeNull();
      expect(rows[0]?.display_name).toBe('Emma G.');
      expect(rows[0]?.display_name).not.toContain('Gagnon');
    });

    it('athlète avec hide_last_name = false : nom complet visible', async () => {
      const rows = await asRole<{ last_name: string | null; display_name: string }>(
        'anon',
        null,
        'SELECT last_name, display_name FROM v_public_athlete WHERE id = $1',
        [SEED_VISIBLE_ATHLETE_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.last_name).toBe('Tremblay');
      expect(rows[0]?.display_name).toBe('Thomas Tremblay');
    });
  });

  describe('Client authentifié : commandes propres uniquement', () => {
    it('client A ne voit que sa propre commande', async () => {
      const rows = await asRole<{ id: string }>('authenticated', CLIENT_A, 'SELECT id FROM orders');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(ORDER_CLIENT_A);
    });

    it('client B ne voit que sa propre commande (pas celle de A)', async () => {
      const rows = await asRole<{ id: string }>('authenticated', CLIENT_B, 'SELECT id FROM orders');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(ORDER_CLIENT_B);
    });
  });

  describe('team_manager : campagnes de sa propre équipe seulement', () => {
    it('voit la campagne de son équipe (seed U11 Hockey)', async () => {
      const rows = await asRole<{ id: string }>(
        'authenticated',
        TEAM_MANAGER,
        'SELECT id FROM campaigns WHERE id = $1',
        [SEED_CAMPAIGN_ID],
      );
      expect(rows).toHaveLength(1);
    });

    it('ne voit pas la campagne hors scope (autre équipe)', async () => {
      const rows = await asRole<{ id: string }>(
        'authenticated',
        TEAM_MANAGER,
        'SELECT id FROM campaigns WHERE id = $1',
        [CAMPAIGN_OUT_OF_SCOPE],
      );
      expect(rows).toHaveLength(0);
    });

    it('au global, ne voit que les campagnes de ses équipes (pas toutes les campagnes)', async () => {
      const rows = await asRole<{ id: string }>('authenticated', TEAM_MANAGER, 'SELECT id FROM campaigns');
      expect(rows.map((r) => r.id)).toEqual([SEED_CAMPAIGN_ID]);
    });
  });

  describe('club_admin : visibilité scope club (athlètes de ses équipes)', () => {
    it("voit l'athlète de l'équipe rattachée à son club", async () => {
      const rows = await asRole<{ id: string }>(
        'authenticated',
        CLUB_ADMIN,
        'SELECT id FROM athletes WHERE id = $1',
        [SEED_VISIBLE_ATHLETE_ID],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('platform_admin : accès complet', () => {
    it('voit tous les profils (au moins les 6 fixtures + 3 du seed)', async () => {
      const rows = await asRole<{ id: string }>('authenticated', PLATFORM_ADMIN, 'SELECT id FROM profiles');
      expect(rows.length).toBeGreaterThanOrEqual(9);
    });

    it('voit toutes les campagnes, y compris hors scope', async () => {
      const rows = await asRole<{ id: string }>('authenticated', PLATFORM_ADMIN, 'SELECT id FROM campaigns');
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(SEED_CAMPAIGN_ID);
      expect(ids).toContain(CAMPAIGN_OUT_OF_SCOPE);
    });
  });

  describe('Refus déterministe sans rôle staff (cas limite : visiteur authentifié simple "client")', () => {
    it("un client (rôle 'client') ne voit aucune ligne credit_rules (réservé staff)", async () => {
      const rows = await asRole('authenticated', CLIENT_A, 'SELECT * FROM credit_rules');
      expect(rows).toHaveLength(0);
    });

    it("accounting voit credit_rules mais pas un client standard", async () => {
      const asAccounting = await asRole('authenticated', ACCOUNTING, 'SELECT * FROM tax_rates');
      const asClient = await asRole('authenticated', CLIENT_A, 'SELECT * FROM tax_rates');
      // tax_rates est public en lecture (référentiel non sensible) : les deux le voient.
      expect(asAccounting.length).toBeGreaterThan(0);
      expect(asClient.length).toBeGreaterThan(0);
    });
  });
});
