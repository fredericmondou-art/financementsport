/**
 * Test d'intégration -- Tâche 1.5.6 (docs/prompts/phase-1-5.md) : isolation
 * par scope du dashboard équipe -- « un responsable ne peut pas ouvrir le
 * dashboard d'une équipe qui n'est pas la sienne » (critère d'acceptation
 * explicite de la tâche).
 *
 * Même harnais que tests/integration/distribution-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role) --
 * fichier dédié plutôt qu'ajouté à rls-policies.test.ts, même convention
 * établie par les tâches précédentes (CLAUDE.md section 6).
 *
 * Ce que ce test prouve, précisément :
 *   1. `teams_select` (déjà existante, migration 0005) scope bien l'accès :
 *      TEAM_MANAGER (gère TEAM_A) lit TEAM_A mais PAS TEAM_B -- c'est ce
 *      garde-fou qui fait que `app/(portails)/equipe/[teamId]/page.tsx`
 *      retourne `notFound()` pour une équipe hors scope, sans vérification
 *      applicative supplémentaire (voir lib/dashboards/team.ts, en-tête).
 *   2. La NOUVELLE policy de la migration 0016 (`payouts_select_campaign_managers`)
 *      fonctionne pour les DEUX formes de bénéficiaire utilisées par le
 *      dashboard équipe : un versement attribué à l'équipe elle-même
 *      (`beneficiary_type = 'team'`) ET un versement attribué à un de ses
 *      athlètes (`beneficiary_type = 'athlete'`, via la cascade
 *      `manages_athlete` -> `manages_team`).
 *   3. OTHER_MANAGER (gère TEAM_B, sans lien avec TEAM_A/ATHLETE_A) ne voit
 *      RIEN de tout ça -- ni la ligne `teams`, ni les deux versements.
 *   4. anon (invité) ne voit rien non plus.
 *   5. Régression : `payouts_staff_read` (migration 0005, accès
 *      `platform_admin`/`accounting`) n'est pas affectée -- la nouvelle
 *      policy est ADDITIVE (OR), pas un remplacement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const TEAM_MANAGER = '99999999-0000-0000-0000-000000000001';
const OTHER_MANAGER = '99999999-0000-0000-0000-000000000002';
const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000003';
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

describe('RLS teams/payouts pour le dashboard équipe (migration 0016, Tâche 1.5.6)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let payoutTeamId: string;
  let payoutAthleteId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-team-dashboard-rls-test-'));

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
    const dbName = `sportif_team_dash_rls_${port}`;
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
    // après TOUTES les migrations (donc après 0016 aussi). Voir
    // tests/integration/saved-splits-rls.test.ts pour le détail du piège.
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [
        TEAM_MANAGER,
        'manager-a@example.com',
        OTHER_MANAGER,
        'manager-b@example.com',
        PLATFORM_ADMIN,
        'admin@example.com',
      ],
    );
    // `on_auth_user_created` (migration 0002) crée déjà une ligne `profiles`
    // par trigger dès l'insertion dans `auth.users` ci-dessus -- ON CONFLICT
    // DO UPDATE pour fixer le nom/rôle plutôt qu'un INSERT simple.
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'manager-a@example.com', 'Responsable A', 'team_manager'),
        ($2, 'manager-b@example.com', 'Responsable B', 'team_manager'),
        ($3, 'admin@example.com', 'Admin Plateforme', 'platform_admin')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [TEAM_MANAGER, OTHER_MANAGER, PLATFORM_ADMIN],
    );

    // Deux équipes distinctes, deux memberships distincts -- TEAM_MANAGER ne
    // gère QUE TEAM_A, OTHER_MANAGER ne gère QUE TEAM_B.
    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-dash'), ($2, 'Équipe B', 'equipe-b-dash')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Alice', 'Zaharie', 'alice-zaharie-dash')`,
      [ATHLETE_A, TEAM_A],
    );

    // Deux versements distincts, en tant que `service_role` (calcul par un
    // job, pas la cible de ce test -- seulement des données de départ) :
    // un attribué à l'équipe elle-même, un attribué à un de ses athlètes.
    await client.query('SET ROLE service_role');
    const teamPayout = await client.query<{ id: string }>(
      `INSERT INTO payouts (beneficiary_type, beneficiary_id, amount_cents, status)
       VALUES ('team', $1, 150000, 'calculated') RETURNING id`,
      [TEAM_A],
    );
    payoutTeamId = teamPayout.rows[0]!.id;
    const athletePayout = await client.query<{ id: string }>(
      `INSERT INTO payouts (beneficiary_type, beneficiary_id, amount_cents, status)
       VALUES ('athlete', $1, 50000, 'paid') RETURNING id`,
      [ATHLETE_A],
    );
    payoutAthleteId = athletePayout.rows[0]!.id;
    await client.query('RESET ROLE');
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("TEAM_MANAGER (gère TEAM_A) lit la ligne `teams` de TEAM_A -- garde-fou de notFound() de la page", async () => {
    const teams = await asRole<{ id: string }>(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM teams WHERE id = $1', [
      TEAM_A,
    ]);
    expect(teams).toHaveLength(1);
  });

  it("TEAM_MANAGER ne peut PAS lire TEAM_B : le dashboard d'une équipe qui n'est pas la sienne est introuvable", async () => {
    const teams = await asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM teams WHERE id = $1', [TEAM_B]);
    expect(teams).toHaveLength(0);
  });

  it('TEAM_MANAGER lit le versement attribué directement à TEAM_A (migration 0016, bénéficiaire = équipe)', async () => {
    const payouts = await asRole<{ id: string }>(client, 'authenticated', TEAM_MANAGER, 'SELECT id FROM payouts WHERE id = $1', [
      payoutTeamId,
    ]);
    expect(payouts).toHaveLength(1);
  });

  it('TEAM_MANAGER lit le versement attribué à ATHLETE_A (migration 0016, bénéficiaire = athlète de son équipe)', async () => {
    const payouts = await asRole<{ id: string }>(
      client,
      'authenticated',
      TEAM_MANAGER,
      'SELECT id FROM payouts WHERE id = $1',
      [payoutAthleteId],
    );
    expect(payouts).toHaveLength(1);
  });

  it("OTHER_MANAGER (gère TEAM_B, sans lien avec TEAM_A) NE voit AUCUN des deux versements ni la ligne `teams` de TEAM_A", async () => {
    const teams = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM teams WHERE id = $1', [TEAM_A]);
    expect(teams).toHaveLength(0);

    const payouts = await asRole(client, 'authenticated', OTHER_MANAGER, 'SELECT id FROM payouts WHERE id IN ($1, $2)', [
      payoutTeamId,
      payoutAthleteId,
    ]);
    expect(payouts).toHaveLength(0);
  });

  it('anon (invité) ne voit ni les équipes ni les versements', async () => {
    const teams = await asRole(client, 'anon', null, 'SELECT id FROM teams');
    expect(teams).toHaveLength(0);

    const payouts = await asRole(client, 'anon', null, 'SELECT id FROM payouts');
    expect(payouts).toHaveLength(0);
  });

  it('régression : platform_admin lit toujours tous les versements (policy `payouts_staff_read`, migration 0005, non affectée -- additive, pas un remplacement)', async () => {
    const payouts = await asRole<{ id: string }>(
      client,
      'authenticated',
      PLATFORM_ADMIN,
      'SELECT id FROM payouts WHERE id IN ($1, $2)',
      [payoutTeamId, payoutAthleteId],
    );
    expect(payouts).toHaveLength(2);
  });
});
