/**
 * Test d'intégration -- Tâche 1.5.10 (docs/prompts/phase-1-5.md, « tâche
 * financière sensible ») : la fonction Postgres gardée
 * `advance_payout_status`, le trigger `payouts_guard_amount_lock`, la table
 * `payout_status_log` et les policies RLS associées (migration 0019), ainsi
 * que la frontière d'écriture directe sur `payouts` (`payouts_staff_write`,
 * migration 0005) exploitée par `lib/payouts/calculate.ts` (INSERT/UPDATE
 * ordinaires, sans RPC -- voir le commentaire de tête de la migration 0019
 * sur cette différence avec `orders`/`campaigns`).
 *
 * Même harnais que tests/integration/campaign-closure-rls.test.ts (Postgres
 * embarqué jetable, stubs auth.uid()/anon/authenticated/service_role).
 *
 * Point important à NE PAS « corriger » (voir docs/DECISIONS.md, Tâche
 * 1.5.10, et lib/auth/permissions.ts) : `advance_payout_status` autorise
 * `platform_admin` ET `accounting` à transitionner un versement -- c'est la
 * RLS/le RPC qui posent cette frontière. La couche applicative
 * (`lib/auth/permissions.ts#can`), elle, réserve VOLONTAIREMENT l'écriture à
 * `platform_admin` seul (`accounting` n'a que la lecture dans l'UI) -- un
 * écart de défense-en-profondeur intentionnel, déjà couvert par
 * `tests/unit/permissions.test.ts`. Ce test d'intégration vérifie donc la
 * frontière RÉELLE en base (platform_admin OU accounting), pas la frontière
 * (plus stricte) de l'UI admin.
 *
 * Ce que ce test prouve, précisément :
 *   1. anon ne peut pas du tout appeler `advance_payout_status` (REVOKE).
 *   2. TEAM_MANAGER (lecture seule sur les versements de ses bénéficiaires,
 *      migration 0016) ne peut PAS appeler la transition.
 *   3. ACCOUNTING peut faire avancer un versement ("calculated" ->
 *      "approved") -- trace d'audit (`payout_status_log`) correcte.
 *   4. Passer à "paid" sans preuve échoue côté serveur, même pour un rôle
 *      autorisé.
 *   5. PLATFORM_ADMIN complète le cycle "approved" -> "paid" avec preuve --
 *      `paid_at`/`proof_url` renseignés, trace d'audit correcte.
 *   6. PLATFORM_ADMIN ferme le versement ("paid" -> "closed") ; "closed" est
 *      un état terminal -- aucune transition sortante n'est acceptée après.
 *   7. Une transition absente du graphe ("calculated" -> "paid" direct) est
 *      rejetée.
 *   8. "adjusted" exige un nouveau montant ET une raison -- chaque absence
 *      est rejetée séparément ; un ajustement complet réécrit
 *      `amount_cents`/`fee_held_cents` et trace la raison dans le journal.
 *   9. Le trigger `payouts_guard_amount_lock` bloque toute modification
 *      directe (hors RPC) de `amount_cents` une fois le versement sorti des
 *      statuts ouverts au recalcul -- même pour `platform_admin`, même via
 *      une simple instruction `UPDATE`.
 *  10. Écriture directe (INSERT, hors RPC) sur `payouts` : `TEAM_MANAGER` est
 *      bloqué par `payouts_staff_write` ; `ACCOUNTING` réussit (la frontière
 *      qu'exploite `lib/payouts/calculate.ts` pour le calcul).
 *  11. Lecture de `payout_status_log` : `TEAM_MANAGER` (gère le bénéficiaire)
 *      voit l'historique ; `OTHER_MANAGER` (équipe non liée) n'en voit
 *      aucune ligne ; `ACCOUNTING`/`PLATFORM_ADMIN` voient tout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

const TEAM_MANAGER = '99999999-0000-0000-0000-000000000010';
const OTHER_MANAGER = '99999999-0000-0000-0000-000000000011';
const ACCOUNTING_USER = '99999999-0000-0000-0000-000000000012';
const PLATFORM_ADMIN = '99999999-0000-0000-0000-000000000013';
const TEAM_A = '99999999-1111-0000-0000-000000000010';
const TEAM_B = '99999999-1111-0000-0000-000000000011';
const ATHLETE_A = '99999999-2222-0000-0000-000000000010';

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

async function insertPayoutAsService(
  client: Client,
  campaignId: string,
  status: string,
  amountCents: number,
  extra: { feeHeldCents?: number; proofUrl?: string | null } = {},
): Promise<string> {
  await client.query('SET ROLE service_role');
  const result = await client.query<{ id: string }>(
    `INSERT INTO payouts (campaign_id, beneficiary_type, beneficiary_id, amount_cents, fee_held_cents, status, proof_url)
     VALUES ($1, 'athlete', $2, $3, $4, $5, $6)
     RETURNING id`,
    [campaignId, ATHLETE_A, amountCents, extra.feeHeldCents ?? 0, status, extra.proofUrl ?? null],
  );
  await client.query('RESET ROLE');
  return result.rows[0]!.id;
}

describe('advance_payout_status + payout_status_log + payouts_guard_amount_lock (migration 0019, Tâche 1.5.10)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;
  let campaignId: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-payout-status-rls-test-'));

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
    const dbName = `sportif_payout_status_rls_${port}`;
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
    // campaign-closure-rls.test.ts). Ne donne PAS le droit d'exécuter
    // advance_payout_status à anon -- géré explicitement par la migration
    // 0019 elle-même (REVOKE/GRANT ciblés).
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;',
    );
    await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;');
    await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');

    await client.query(
      'INSERT INTO auth.users (id, email) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)',
      [
        TEAM_MANAGER,
        'manager-a-1-5-10@example.com',
        OTHER_MANAGER,
        'manager-b-1-5-10@example.com',
        ACCOUNTING_USER,
        'accounting-1-5-10@example.com',
        PLATFORM_ADMIN,
        'admin-1-5-10@example.com',
      ],
    );
    await client.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES
        ($1, 'manager-a-1-5-10@example.com', 'Responsable A', 'team_manager'),
        ($2, 'manager-b-1-5-10@example.com', 'Responsable B', 'team_manager'),
        ($3, 'accounting-1-5-10@example.com', 'Comptabilité', 'accounting'),
        ($4, 'admin-1-5-10@example.com', 'Admin Plateforme', 'platform_admin')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, email = EXCLUDED.email`,
      [TEAM_MANAGER, OTHER_MANAGER, ACCOUNTING_USER, PLATFORM_ADMIN],
    );

    await client.query(
      `INSERT INTO teams (id, name, slug) VALUES ($1, 'Équipe A', 'equipe-a-1-5-10'), ($2, 'Équipe B', 'equipe-b-1-5-10')`,
      [TEAM_A, TEAM_B],
    );
    await client.query(
      `INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2), ($3, 'team_manager', $4)`,
      [TEAM_MANAGER, TEAM_A, OTHER_MANAGER, TEAM_B],
    );
    await client.query(
      `INSERT INTO athletes (id, team_id, first_name, last_name, slug) VALUES ($1, $2, 'Béatrice', 'Roy', 'beatrice-roy-1-5-10')`,
      [ATHLETE_A, TEAM_A],
    );

    const campaign = await client.query<{ id: string }>(
      `INSERT INTO campaigns (type, status, name, slug, beneficiary_type, beneficiary_id, team_id)
       VALUES ('team', 'closed', 'Campagne Équipe A 1.5.10', 'campagne-equipe-a-1-5-10', 'athlete', $1, $2)
       RETURNING id`,
      [ATHLETE_A, TEAM_A],
    );
    campaignId = campaign.rows[0]!.id;
  });

  afterAll(async () => {
    await client.end();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("anon ne peut pas du tout appeler advance_payout_status (REVOKE explicite, migration 0019)", async () => {
    const payoutId = await insertPayoutAsService(client, campaignId, 'calculated', 10000);
    await expect(
      asRole(client, 'anon', null, 'SELECT * FROM advance_payout_status($1, $2)', [payoutId, 'approved']),
    ).rejects.toThrow();

    const row = await client.query<{ status: string }>('SELECT status FROM payouts WHERE id = $1', [payoutId]);
    expect(row.rows[0]?.status).toBe('calculated');
  });

  it("TEAM_MANAGER (lecture seule sur ses versements, migration 0016) ne peut PAS appeler la transition", async () => {
    const payoutId = await insertPayoutAsService(client, campaignId, 'calculated', 10000);
    await expect(
      asRole(client, 'authenticated', TEAM_MANAGER, 'SELECT * FROM advance_payout_status($1, $2)', [
        payoutId,
        'approved',
      ]),
    ).rejects.toThrow(/autorisé/);

    const row = await client.query<{ status: string }>('SELECT status FROM payouts WHERE id = $1', [payoutId]);
    expect(row.rows[0]?.status).toBe('calculated');
  });

  it('une transition absente du graphe ("calculated" -> "paid" direct) est rejetée, même pour un rôle autorisé', async () => {
    const payoutId = await insertPayoutAsService(client, campaignId, 'calculated', 10000);
    await expect(
      asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT * FROM advance_payout_status($1, $2, $3)', [
        payoutId,
        'paid',
        'https://exemple.test/preuve-invalide.pdf',
      ]),
    ).rejects.toThrow(/Transition de statut de versement invalide/);
  });

  describe('cycle complet "calculated" -> "approved" -> "paid" -> "closed" avec traçabilité', () => {
    let payoutId: string;

    it('ACCOUNTING fait avancer le versement de "calculated" à "approved"', async () => {
      payoutId = await insertPayoutAsService(client, campaignId, 'calculated', 25000);

      const rows = await asRole<{ id: string; status: string; approved_by: string | null }>(
        client,
        'authenticated',
        ACCOUNTING_USER,
        'SELECT * FROM advance_payout_status($1, $2)',
        [payoutId, 'approved'],
      );
      expect(rows[0]?.status).toBe('approved');
      expect(rows[0]?.approved_by).toBe(ACCOUNTING_USER);

      const log = await client.query<{
        from_status: string;
        to_status: string;
        changed_by: string;
        note: string | null;
      }>('SELECT from_status, to_status, changed_by, note FROM payout_status_log WHERE payout_id = $1', [payoutId]);
      expect(log.rows).toHaveLength(1);
      expect(log.rows[0]).toMatchObject({
        from_status: 'calculated',
        to_status: 'approved',
        changed_by: ACCOUNTING_USER,
        note: null,
      });
    });

    it('passer à "paid" sans preuve échoue côté serveur, même pour PLATFORM_ADMIN', async () => {
      await expect(
        asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT * FROM advance_payout_status($1, $2)', [
          payoutId,
          'paid',
        ]),
      ).rejects.toThrow(/preuve de paiement/);

      const row = await client.query<{ status: string }>('SELECT status FROM payouts WHERE id = $1', [payoutId]);
      expect(row.rows[0]?.status).toBe('approved');
    });

    it('PLATFORM_ADMIN complète "approved" -> "paid" avec une preuve', async () => {
      const rows = await asRole<{ status: string; paid_at: string | null; proof_url: string | null }>(
        client,
        'authenticated',
        PLATFORM_ADMIN,
        'SELECT * FROM advance_payout_status($1, $2, $3)',
        [payoutId, 'paid', 'https://exemple.test/recu-1-5-10.pdf'],
      );
      expect(rows[0]?.status).toBe('paid');
      expect(rows[0]?.paid_at).not.toBeNull();
      expect(rows[0]?.proof_url).toBe('https://exemple.test/recu-1-5-10.pdf');

      const log = await client.query<{ from_status: string; to_status: string }>(
        'SELECT from_status, to_status FROM payout_status_log WHERE payout_id = $1 ORDER BY changed_at',
        [payoutId],
      );
      expect(log.rows).toHaveLength(2);
      expect(log.rows[1]).toMatchObject({ from_status: 'approved', to_status: 'paid' });
    });

    it('PLATFORM_ADMIN ferme le versement ("paid" -> "closed")', async () => {
      const rows = await asRole<{ status: string }>(
        client,
        'authenticated',
        PLATFORM_ADMIN,
        'SELECT * FROM advance_payout_status($1, $2)',
        [payoutId, 'closed'],
      );
      expect(rows[0]?.status).toBe('closed');
    });

    it('"closed" est un état terminal -- aucune transition sortante (même pour PLATFORM_ADMIN)', async () => {
      await expect(
        asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT * FROM advance_payout_status($1, $2)', [
          payoutId,
          'disputed',
        ]),
      ).rejects.toThrow(/Transition de statut de versement invalide/);
    });

    it('le trigger payouts_guard_amount_lock bloque toute modification DIRECTE (hors RPC) du montant une fois le versement fermé, même pour PLATFORM_ADMIN', async () => {
      await expect(
        asRole(client, 'authenticated', PLATFORM_ADMIN, 'UPDATE payouts SET amount_cents = $2 WHERE id = $1', [
          payoutId,
          999,
        ]),
      ).rejects.toThrow(/ne peut être modifié que via une transition "adjusted"/);

      const row = await client.query<{ amount_cents: number }>('SELECT amount_cents FROM payouts WHERE id = $1', [
        payoutId,
      ]);
      expect(row.rows[0]?.amount_cents).toBe(25000);
    });
  });

  describe('transition "adjusted" -- montant ET raison obligatoires (traçabilité d\'un ajustement)', () => {
    it('rejette "adjusted" sans nouveau montant', async () => {
      const payoutId = await insertPayoutAsService(client, campaignId, 'approved', 5000);
      await expect(
        asRole(client, 'authenticated', PLATFORM_ADMIN, 'SELECT * FROM advance_payout_status($1, $2, $3, $4)', [
          payoutId,
          'adjusted',
          null,
          'Correction après remboursement partiel',
        ]),
      ).rejects.toThrow(/nouveau montant/);
    });

    it('rejette "adjusted" sans raison (même avec un montant fourni)', async () => {
      const payoutId = await insertPayoutAsService(client, campaignId, 'approved', 5000);
      await expect(
        asRole(
          client,
          'authenticated',
          PLATFORM_ADMIN,
          'SELECT * FROM advance_payout_status($1, $2, NULL, NULL, $3)',
          [payoutId, 'adjusted', 3000],
        ),
      ).rejects.toThrow(/raison.*obligatoire/i);
    });

    it('accepte un ajustement complet (montant + raison) et trace la raison dans payout_status_log.note', async () => {
      const payoutId = await insertPayoutAsService(client, campaignId, 'approved', 5000);
      const rows = await asRole<{ status: string; amount_cents: number; fee_held_cents: number }>(
        client,
        'authenticated',
        PLATFORM_ADMIN,
        'SELECT * FROM advance_payout_status($1, $2, NULL, $3, $4, $5)',
        [payoutId, 'adjusted', 'Remboursement partiel d\'un supporteur', 3000, 500],
      );
      expect(rows[0]).toMatchObject({ status: 'adjusted', amount_cents: 3000, fee_held_cents: 500 });

      const log = await client.query<{ note: string | null }>(
        'SELECT note FROM payout_status_log WHERE payout_id = $1',
        [payoutId],
      );
      expect(log.rows[0]?.note).toBe("Remboursement partiel d'un supporteur");
    });
  });

  describe('écriture DIRECTE (hors RPC) sur payouts -- frontière exploitée par lib/payouts/calculate.ts', () => {
    it("payouts_staff_write bloque l'INSERT direct par TEAM_MANAGER (ni platform_admin, ni accounting)", async () => {
      await expect(
        asRole(
          client,
          'authenticated',
          TEAM_MANAGER,
          `INSERT INTO payouts (campaign_id, beneficiary_type, beneficiary_id, amount_cents)
           VALUES ($1, 'athlete', $2, $3) RETURNING id`,
          [campaignId, ATHLETE_A, 1000],
        ),
      ).rejects.toThrow();
    });

    it('payouts_staff_write autorise ACCOUNTING à insérer directement (frontière utilisée par recalculatePayoutsForCampaign)', async () => {
      const rows = await asRole<{ id: string; amount_cents: number }>(
        client,
        'authenticated',
        ACCOUNTING_USER,
        `INSERT INTO payouts (campaign_id, beneficiary_type, beneficiary_id, amount_cents)
         VALUES ($1, 'athlete', $2, $3) RETURNING id, amount_cents`,
        [campaignId, ATHLETE_A, 1500],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount_cents).toBe(1500);
    });
  });

  describe('lecture de payout_status_log (RLS) -- même scope que la lecture du versement', () => {
    let payoutId: string;

    it('prépare un versement avec un historique (calculated -> approved)', async () => {
      payoutId = await insertPayoutAsService(client, campaignId, 'calculated', 8000);
      await asRole(client, 'authenticated', ACCOUNTING_USER, 'SELECT * FROM advance_payout_status($1, $2)', [
        payoutId,
        'approved',
      ]);
    });

    it('TEAM_MANAGER (gère ATHLETE_A via TEAM_A) voit cet historique', async () => {
      const rows = await asRole(
        client,
        'authenticated',
        TEAM_MANAGER,
        'SELECT id FROM payout_status_log WHERE payout_id = $1',
        [payoutId],
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it("OTHER_MANAGER (gère TEAM_B, sans lien avec ce bénéficiaire) ne voit AUCUNE ligne", async () => {
      const rows = await asRole(
        client,
        'authenticated',
        OTHER_MANAGER,
        'SELECT id FROM payout_status_log WHERE payout_id = $1',
        [payoutId],
      );
      expect(rows).toHaveLength(0);
    });

    it('ACCOUNTING et PLATFORM_ADMIN voient tout (pas de scope par bénéficiaire)', async () => {
      const asAccounting = await asRole(
        client,
        'authenticated',
        ACCOUNTING_USER,
        'SELECT id FROM payout_status_log WHERE payout_id = $1',
        [payoutId],
      );
      expect(asAccounting.length).toBeGreaterThan(0);

      const asAdmin = await asRole(
        client,
        'authenticated',
        PLATFORM_ADMIN,
        'SELECT id FROM payout_status_log WHERE payout_id = $1',
        [payoutId],
      );
      expect(asAdmin.length).toBeGreaterThan(0);
    });
  });
});
