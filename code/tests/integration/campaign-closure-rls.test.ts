/**
 * Test d'intégration -- Tâche 1.5.8 (docs/prompts/phase-1-5.md) : les
 * fonctions Postgres gardées `close_campaign`/`reopen_campaign` et la table
 * `campaign_status_log` (migration 0017).
 *
 * Même harnais que tests/integration/order-status-transitions-rls.test.ts
 * (Postgres embarqué jetable, stubs auth.uid()/anon/authenticated/
 * service_role) -- fichier dédié, même convention établie par les tâches
 * précédentes (CLAUDE.md section 6).
 *
 * Ce que ce test prouve, précisément :
 *   1. TEAM_MANAGER (gère TEAM_A) clôture sa propre campagne active --
 *      passe à `closed`, `closed_at` renseigné, une ligne
 *      `campaign_status_log` (active -> closed, changed_by = lui) créée.
 *   2. OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) ne peut
 *      PAS la clôturer.
 *   3. anon ne peut pas du tout appeler `close_campaign`/`reopen_campaign`
 *      (REVOKE explicite).
 *   4. Clôturer une campagne déjà clôturée échoue avec un message clair.
 *   5. TEAM_MANAGER ne peut PAS rouvrir la campagne (réservé admin) -- même
 *      en fournissant une raison.
 *   6. PLATFORM_ADMIN rouvre la campagne avec une raison -- repasse à
 *      `active`, `closed_at` redevient NULL, une ligne `campaign_status_log`
 *      (closed -> active, reason renseigné) créée.
 *   7. PLATFORM_ADMIN ne peut pas rouvrir SANS raison (raison vide rejetée
 *      côté serveur aussi, défense en profondeur).
 *   8. Lecture de `campaign_status_log` : TEAM_MANAGER et PLATFORM_ADMIN
 *      peuvent lire ; OTHER_MANAGER ne le peut pas.
 *   9. close_campaign refuse de clôturer s'il existe une commande
 *      `payment_pending` rattachée à la campagne (vérification défensive,
 *      voir le commentaire de tête de la migration 0017).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const CLIENT_A = '99999999-0000-0000-0000-000000000001';
const TEAM_MANAGER = '99999999-0000-0000-0000-000000000002';
const OTHER_MANAGER = '99999999-0000-0000-0000-000000000003';
const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000004';
const TEAM_A = '99999999-1111-0000-0000-000000000001';
const TEAM_B = '99999999-1111-0000-0000-000000000002';
const ATHLETE_A = '99999999-2222-0000-0000-000000000001';

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

describe('close_campaign + reopen_campaign + campaign_status_log (migration 0017, Tâche 1.5.8)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let campaignId: string;
  let pendingOrderCampaignId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-campaign-closure-rls-test-'));

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
    const dbName = `sportif_campaign_closure_rls_${port}`;
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
    // après TOUTES les migrations (même piège documenté dans
    // order-status-transitions-rls.test.ts). Ne donne PAS le droit
    // d'exécuter close_campaign/reopen_campaign à anon -- géré explicitement
    // par la migration 0017 elle-même (REVOKE/GRANT ciblés).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)',
      [
        CLIENT_A,
        'client-a@example.com',
        TEAM_MANAGER,
        'manager-a@example.com',
        OTHER_MANAGER,
        'manager-b@example.com',
        PLATFORM_ADMIN,
        'admin@example.com',
      ],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'client-a@example.com', 'Julie Tremblay', 'client'),
        ($2, 'manager-a@example.com', 'Responsable A', 'team_manager'),
        ($3, 'manager-b@example.com', 'Responsable B', 'team_manager'),
        ($4, 'admin@example.com', 'Admin Plateforme', 'platform_admin')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email`,
      [CLIENT_A, TEAM_MANAGER, OTHER_MANAGER, PLATFORM_ADMIN],
    );

    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-1-5-8'), ($2, 'Équipe B', 'equipe-b-1-5-8')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie-1-5-8')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'active', 'Campagne Équipe A 1.5.8', 'campagne-equipe-a-1-5-8', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    campaignId = campaign.rows[0]!.id;

    // Campagne distincte, active, avec UNE commande payment_pending
    // rattachée -- pour prouver la vérification défensive de close_campaign.
    // (Voir migration 0017 : ce statut n'est jamais atteint par le code
    // applicatif actuel, mais la fonction doit tout de même le bloquer si une
    // ligne existe.)
    const pendingCampaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'active', 'Campagne avec paiement en attente 1.5.8', 'campagne-pending-1-5-8', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    pendingOrderCampaignId = pendingCampaign.rows[0]!.id;

    await client.query('SET ROLE service_role');
    await client.query(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, tax_cents, total_cents, credit_total_cents, primary_campaign_id, team_id)
       VALUES ('CMD-1-5-8-0001', $1, 'payment_pending', 1000, 150, 1150, 200, $2, $3)`,
      [CLIENT_A, pendingOrderCampaignId, TEAM_A],
    );
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("anon ne peut pas du tout appeler close_campaign/reopen_campaign (REVOKE explicite, migration 0017)", async () => {
    await expect(
      asRole(client, 'anon', null, 'SELECT * FROM close_campaign($1)', [campaignId]),
    ).rejects.toThrow();
    await expect(
      asRole(client, 'anon', null, 'SELECT * FROM reopen_campaign($1, $2)', [campaignId, 'raison']),
    ).rejects.toThrow();
  });

  it("OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) ne peut PAS la clôturer", async () => {
    await expect(
      asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT * FROM close_campaign($1)', [campaignId]),
    ).rejects.toThrow();

    const campaign = await client.query<{ status: string }>('SELECT status FROM campaigns WHERE id = $1', [
      campaignId,
    ]);
    expect(campaign.rows[0]?.status).toBe('active');
  });

  it('close_campaign refuse de clôturer s\'il existe une commande payment_pending rattachée', async () => {
    await expect(
      asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT * FROM close_campaign($1)', [pendingOrderCampaignId]),
    ).rejects.toThrow(/attente de confirmation de paiement/);

    const campaign = await client.query<{ status: string }>('SELECT status FROM campaigns WHERE id = $1', [
      pendingOrderCampaignId,
    ]);
    expect(campaign.rows[0]?.status).toBe('active');
  });

  it('TEAM_MANAGER (gère TEAM_A) clôture sa propre campagne active', async () => {
    const rows = await asRole<{ id: string; status: string; closed_at: string | null }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT * FROM close_campaign($1)',
      [campaignId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('closed');
    expect(rows[0]?.closed_at).not.toBeNull();

    const log = await client.query<{ previous_status: string; new_status: string; reason: string | null; changed_by: string }>(
      'SELECT previous_status, new_status, reason, changed_by FROM campaign_status_log WHERE campaign_id = $1',
      [campaignId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      previous_status: 'active',
      new_status: 'closed',
      reason: null,
      changed_by: TEAM_MANAGER,
    });
  });

  it('clôturer une campagne déjà clôturée échoue avec un message clair', async () => {
    await expect(
      asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT * FROM close_campaign($1)', [campaignId]),
    ).rejects.toThrow(/active.*clôturée|Seule une campagne active/);
  });

  it('TEAM_MANAGER ne peut PAS rouvrir la campagne, même avec une raison (réservé platform_admin)', async () => {
    await expect(
      asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT * FROM reopen_campaign($1, $2)', [
        campaignId,
        'Je voudrais la rouvrir.',
      ]),
    ).rejects.toThrow();

    const campaign = await client.query<{ status: string }>('SELECT status FROM campaigns WHERE id = $1', [
      campaignId,
    ]);
    expect(campaign.rows[0]?.status).toBe('closed');
  });

  it('PLATFORM_ADMIN ne peut pas rouvrir SANS raison (raison vide rejetée côté serveur)', async () => {
    await expect(
      asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT * FROM reopen_campaign($1, $2)', [campaignId, '']),
    ).rejects.toThrow(/raison.*obligatoire/i);
  });

  it('PLATFORM_ADMIN rouvre la campagne avec une raison', async () => {
    const rows = await asRole<{ status: string; closed_at: string | null }>(
      client,
      'authenticated',
      PLATFORM_ADMIN,
      'SELECT * FROM reopen_campaign($1, $2)',
      [campaignId, 'Erreur de manipulation, à rouvrir.'],
    );
    expect(rows[0]?.status).toBe('active');
    expect(rows[0]?.closed_at).toBeNull();

    const log = await client.query<{ previous_status: string; new_status: string; reason: string | null }>(
      'SELECT previous_status, new_status, reason FROM campaign_status_log WHERE campaign_id = $1 ORDER BY changed_at',
      [campaignId],
    );
    expect(log.rows).toHaveLength(2);
    expect(log.rows[1]).toMatchObject({
      previous_status: 'closed',
      new_status: 'active',
      reason: 'Erreur de manipulation, à rouvrir.',
    });
  });

  it('lecture de campaign_status_log : TEAM_MANAGER et PLATFORM_ADMIN peuvent lire ; OTHER_MANAGER ne le peut pas', async () => {
    const asManager = await asRole(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT id FROM campaign_status_log WHERE campaign_id = $1',
      [campaignId],
    );
    expect(asManager.length).toBeGreaterThan(0);

    const asAdmin = await asRole(
      client,
      'authenticated',
      PLATFORM_ADMIN,
      'SELECT id FROM campaign_status_log WHERE campaign_id = $1',
      [campaignId],
    );
    expect(asAdmin.length).toBeGreaterThan(0);

    const asOther = await asRole(
      client,
      'authenticated',
      OTHER_MANAGER,
      'SELECT id FROM campaign_status_log WHERE campaign_id = $1',
      [campaignId],
    );
    expect(asOther).toHaveLength(0);
  });
});
