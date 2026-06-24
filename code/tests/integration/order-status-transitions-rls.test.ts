/**
 * Test d'intégration -- Tâche 1.5.5 (docs/prompts/phase-1-5.md) : la fonction
 * Postgres gardée `advance_order_status` et la table `order_status_log`
 * (migration 0015).
 *
 * Même harnais que tests/integration/distribution-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role) --
 * fichier dédié, même convention établie par les tâches précédentes
 * (CLAUDE.md section 6).
 *
 * Ce que ce test prouve, précisément :
 *   1. TEAM_MANAGER (gère TEAM_A) fait avancer une commande `ready` vers
 *      `delivered_to_team` -- la commande change de statut, et une ligne
 *      `order_status_log` horodatée/traçable est créée (changed_by = lui).
 *   2. La transition suivante (`delivered_to_team` -> `distributed`) déclenche
 *      la notification journalisée dans `email_log` (gabarit
 *      `order_distributed`, destinataire = le client) -- mais l'étape
 *      précédente (-> `delivered_to_team`) n'en déclenche AUCUNE.
 *   3. Une transition illégale (`distributed` -> `ready`, un recul) est
 *      refusée avec un message clair, et l'état de la commande ne change pas.
 *   4. OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) ne peut PAS
 *      faire avancer une commande de la campagne de TEAM_A -- refusé.
 *   5. anon ne peut pas du tout appeler la fonction (REVOKE explicite).
 *   6. Lecture de `order_status_log` : TEAM_MANAGER et le client propriétaire
 *      de la commande peuvent lire ses lignes ; OTHER_MANAGER ne le peut pas.
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

describe('advance_order_status + order_status_log (migration 0015, Tâche 1.5.5)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let campaignId: string;
  let orderReadyId: string;
  let orderOtherTeamScopeId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-order-status-rls-test-'));

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
    const dbName = `sportif_order_status_rls_${port}`;
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
    // après TOUTES les migrations, donc après 0015 aussi. Ne donne PAS le
    // droit d'exécuter `advance_order_status` à anon -- ce droit est géré
    // explicitement par la migration elle-même (REVOKE/GRANT ciblés).
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
    // DO UPDATE pour fixer le nom/rôle/courriel plutôt qu'un INSERT simple
    // (même piège déjà rencontré et documenté dans saved-splits-rls.test.ts).
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'client-a@example.com', 'Julie Tremblay', 'client'),
        ($2, 'manager-a@example.com', 'Responsable A', 'team_manager'),
        ($3, 'manager-b@example.com', 'Responsable B', 'team_manager')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email`,
      [CLIENT_A, TEAM_MANAGER, OTHER_MANAGER],
    );

    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-1-5-5'), ($2, 'Équipe B', 'equipe-b-1-5-5')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie-1-5-5')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'active', 'Campagne Équipe A 1.5.5', 'campagne-equipe-a-1-5-5', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    campaignId = campaign.rows[0]!.id;

    // Deux commandes 'ready' sur la même campagne (TEAM_A) -- l'une pour le
    // chemin normal (TEAM_MANAGER), l'autre pour prouver qu'OTHER_MANAGER ne
    // peut pas y toucher. Créées en `service_role` (même chemin que le
    // webhook Stripe, CLAUDE.md section 4) -- pas la cible de ce test.
    await client.query('SET ROLE service_role');
    const orderReady = await client.query<{ id: string }>(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, tax_cents, total_cents, credit_total_cents, primary_campaign_id, team_id)
       VALUES ('CMD-1-5-5-0001', $1, 'ready', 1000, 150, 1150, 200, $2, $3)
       RETURNING id`,
      [CLIENT_A, campaignId, TEAM_A],
    );
    orderReadyId = orderReady.rows[0]!.id;

    const orderOtherScope = await client.query<{ id: string }>(
      `INSERT INTO orders (order_number, user_id, status, subtotal_cents, tax_cents, total_cents, credit_total_cents, primary_campaign_id, team_id)
       VALUES ('CMD-1-5-5-0002', $1, 'ready', 1000, 150, 1150, 200, $2, $3)
       RETURNING id`,
      [CLIENT_A, campaignId, TEAM_A],
    );
    orderOtherTeamScopeId = orderOtherScope.rows[0]!.id;
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("anon ne peut pas du tout appeler advance_order_status (REVOKE explicite, migration 0015)", async () => {
    await expect(
      asRole(client, 'anon', null, 'SELECT * FROM advance_order_status($1, $2)', [orderReadyId, 'delivered_to_team']),
    ).rejects.toThrow();
  });

  it("OTHER_MANAGER (gère TEAM_B, sans lien avec cette campagne) ne peut PAS faire avancer une commande de TEAM_A", async () => {
    await expect(
      asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT * FROM advance_order_status($1, $2)', [
        orderOtherTeamScopeId,
        'delivered_to_team',
      ]),
    ).rejects.toThrow();

    // L'état de la commande n'a pas bougé.
    const order = await client.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      orderOtherTeamScopeId,
    ]);
    expect(order.rows[0]?.status).toBe('ready');
  });

  it('TEAM_MANAGER (gère TEAM_A) confirme la réception : la commande passe à delivered_to_team, sans notification', async () => {
    const rows = await asRole<{ id: string; status: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT * FROM advance_order_status($1, $2)',
      [orderReadyId, 'delivered_to_team'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('delivered_to_team');

    const log = await client.query<{ from_status: string; to_status: string; changed_by: string }>(
      'SELECT from_status, to_status, changed_by FROM order_status_log WHERE order_id = $1',
      [orderReadyId],
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({
      from_status: 'ready',
      to_status: 'delivered_to_team',
      changed_by: TEAM_MANAGER,
    });

    // "Livré à l'équipe" n'est PAS un statut notifiable (cahier : seulement
    // distribué/complété) -- aucune ligne email_log encore.
    const emails = await client.query('SELECT id FROM email_log WHERE related_id = $1', [orderReadyId]);
    expect(emails.rows).toHaveLength(0);
  });

  it("l'étape suivante (-> distributed) déclenche bien la notification journalisée dans email_log", async () => {
    const rows = await asRole<{ status: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT * FROM advance_order_status($1, $2)',
      [orderReadyId, 'distributed'],
    );
    expect(rows[0]?.status).toBe('distributed');

    const emails = await client.query<{ recipient: string; template: string; related_type: string; status: string }>(
      'SELECT recipient, template, related_type, status FROM email_log WHERE related_id = $1',
      [orderReadyId],
    );
    expect(emails.rows).toHaveLength(1);
    expect(emails.rows[0]).toMatchObject({
      recipient: 'client-a@example.com',
      template: 'order_distributed',
      related_type: 'order',
      status: 'queued',
    });

    const log = await client.query('SELECT id FROM order_status_log WHERE order_id = $1', [orderReadyId]);
    expect(log.rows).toHaveLength(2); // ready->delivered_to_team, puis delivered_to_team->distributed
  });

  it('une transition illégale (recul distributed -> ready) est refusée avec un message clair, sans effet', async () => {
    await expect(
      asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT * FROM advance_order_status($1, $2)', [
        orderReadyId,
        'ready',
      ]),
    ).rejects.toThrow(/[Tt]ransition.*invalide/);

    const order = await client.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderReadyId]);
    expect(order.rows[0]?.status).toBe('distributed'); // inchangé

    const log = await client.query('SELECT id FROM order_status_log WHERE order_id = $1', [orderReadyId]);
    expect(log.rows).toHaveLength(2); // toujours les deux lignes précédentes, rien ajouté
  });

  it('lecture de order_status_log : TEAM_MANAGER et le client propriétaire peuvent lire ; OTHER_MANAGER ne le peut pas', async () => {
    const asManager = await asRole(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT id FROM order_status_log WHERE order_id = $1',
      [orderReadyId],
    );
    expect(asManager.length).toBeGreaterThan(0);

    const asOwner = await asRole(
      client,
      'authenticated',
      CLIENT_A,
      'SELECT id FROM order_status_log WHERE order_id = $1',
      [orderReadyId],
    );
    expect(asOwner.length).toBeGreaterThan(0);

    const asOther = await asRole(
      client,
      'authenticated',
      OTHER_MANAGER,
      'SELECT id FROM order_status_log WHERE order_id = $1',
      [orderReadyId],
    );
    expect(asOther).toHaveLength(0);
  });
});
