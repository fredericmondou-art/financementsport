/**
 * Test d'intégration — Tâche 1.7 (CŒUR) : `create_campaign_with_details`
 * (migration 0008) appelée EXACTEMENT comme `lib/campaigns/create-campaign.ts`
 * le fait via `supabase.rpc()` (mêmes paramètres positionnels), mais en
 * SECURITY INVOKER réel (rôle `authenticated`, `auth.uid()` = team_manager) —
 * contrairement à `create_paid_order` (SECURITY INVOKER aussi, mais appelée
 * par le webhook via service_role), c'est ICI que RLS doit vraiment filtrer
 * chaque INSERT interne. Même harnais Postgres embarqué que
 * `tests/integration/rls-policies.test.ts` / `create-paid-order.test.ts`,
 * étendu aux migrations 0006-0008.
 *
 * Couvre le critère d'acceptation explicite de la Tâche 1.7 : un team_manager
 * crée une campagne d'équipe ACTIVE avec 3 athlètes et 4 packs, et la page
 * publique de cette campagne devient accessible (`v_public_campaign`) —
 * ainsi que les cas de refus (RLS self-service plafonné, manager hors
 * périmètre) qui complètent les tests unitaires de
 * `tests/unit/create-campaign.test.ts` (logique métier pure, sans DB).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const SEED_PATH = path.resolve(__dirname, '../../supabase/seed.sql');

// Ids du seed (voir supabase/seed.sql) — équipe U11 Hockey (club Corsaires),
// exactement 3 athlètes, exactement 4 packs actifs.
const SEED_TEAM_ID = '33333333-3333-3333-3333-333333333301';
const SEED_ATHLETE_IDS = [
  '44444444-4444-4444-4444-444444444401',
  '44444444-4444-4444-4444-444444444402',
  '44444444-4444-4444-4444-444444444403',
];
const SEED_PRODUCT_IDS = [
  '55555555-5555-5555-5555-555555555501',
  '55555555-5555-5555-5555-555555555502',
  '55555555-5555-5555-5555-555555555503',
  '55555555-5555-5555-5555-555555555504',
];

// Fixtures propres à ce test.
const TEAM_MANAGER_ID = randomUUID();
const OUTSIDE_MANAGER_ID = randomUUID(); // ne gère AUCUNE équipe/club du seed

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

interface CampaignFunctionResult {
  campaign: { id: string; slug: string; status: string; name: string };
  participant_athlete_ids: string[];
  product_ids: string[];
  credit_rule_id: string | null;
  qr_codes: Array<{ target_type: string; code: string }>;
}

describe('create_campaign_with_details (Tâche 1.7, CŒUR atomicité/RLS self-service)', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  /** Exécute une requête en tant que `role`, avec auth.uid() = jwtSub si
   * fourni — même convention que `tests/integration/rls-policies.test.ts`. */
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

  /** Appelle la fonction exactement comme `createSupabaseCampaignRepo` le
   * fait via `supabase.rpc('create_campaign_with_details', { ... })`. */
  async function callCreateCampaign(
    managerId: string,
    args: {
      name: string;
      slug: string;
      beneficiaryType: 'team' | 'club' | 'athlete';
      beneficiaryId: string;
      teamId: string | null;
      clubId: string | null;
      participantAthleteIds: string[];
      productIds: string[];
      creditRule?: { percent_bps?: number | null; flat_cents?: number | null } | null;
    },
  ): Promise<CampaignFunctionResult> {
    const qrCodes = [
      { target_type: 'campaign', target_id: null, code: `qr-${args.slug}-camp` },
      ...args.participantAthleteIds.map((athleteId, i) => ({
        target_type: 'athlete',
        target_id: athleteId,
        code: `qr-${args.slug}-ath${i}`,
      })),
    ];

    const rows = await asRole<{ result: CampaignFunctionResult }>(
      'authenticated',
      managerId,
      `SELECT create_campaign_with_details(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::uuid[], $14::uuid[], $15::jsonb, $16::jsonb
      ) AS result`,
      [
        'team',
        args.name,
        args.slug,
        'Message public de test.',
        args.beneficiaryType,
        args.beneficiaryId,
        args.clubId,
        args.teamId,
        500000,
        '2026-07-01T00:00:00Z',
        '2026-12-31T00:00:00Z',
        'active',
        args.participantAthleteIds,
        args.productIds,
        args.creditRule ? JSON.stringify(args.creditRule) : null,
        JSON.stringify(qrCodes),
      ],
    );
    return rows[0]!.result;
  }

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-campaign-test-'));

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
    await pg.createDatabase('sportif_campaign_test');

    client = pg.getPgClient('sportif_campaign_test');
    await client.connect();

    // --- Stubs Supabase, TEST UNIQUEMENT (même pattern que les autres tests d'intégration) ---
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

    // Fixture team_manager : gère l'équipe U11 Hockey du seed (et donc, par
    // transitivité de manages_campaign, toute campagne qu'il crée pour elle).
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [
      TEAM_MANAGER_ID,
      'manager.u11@example.com',
    ]);
    await client.query(
      "INSERT INTO memberships (user_id, role, team_id) VALUES ($1, 'team_manager', $2)",
      [TEAM_MANAGER_ID, SEED_TEAM_ID],
    );
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [
      OUTSIDE_MANAGER_ID,
      'manager.outsider@example.com',
    ]);
    // Aucune ligne memberships pour OUTSIDE_MANAGER_ID : ne gère rien.
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

  it('crée une campagne d’équipe active avec 3 athlètes et 4 packs, et sa page publique devient accessible', async () => {
    const slug = 'campagne-test-acceptation';
    const result = await callCreateCampaign(TEAM_MANAGER_ID, {
      name: 'Campagne test acceptation',
      slug,
      beneficiaryType: 'team',
      beneficiaryId: SEED_TEAM_ID,
      teamId: SEED_TEAM_ID,
      clubId: null,
      participantAthleteIds: SEED_ATHLETE_IDS,
      productIds: SEED_PRODUCT_IDS,
    });

    expect(result.campaign.status).toBe('active');
    expect(result.participant_athlete_ids).toHaveLength(3);
    expect(result.product_ids).toHaveLength(4);
    // 1 QR « campagne » + 1 QR par athlète participant (3) = 4.
    expect(result.qr_codes).toHaveLength(4);

    const campaignId = result.campaign.id;

    const participants = await client.query(
      'SELECT athlete_id FROM campaign_participants WHERE campaign_id = $1',
      [campaignId],
    );
    expect(participants.rows).toHaveLength(3);

    const products = await client.query(
      'SELECT product_id FROM campaign_products WHERE campaign_id = $1',
      [campaignId],
    );
    expect(products.rows).toHaveLength(4);

    // Le QR « campagne » doit avoir été résolu à l'id de LA campagne (COALESCE,
    // voir le commentaire de la migration 0008 sur le problème d'auto-référence).
    const campaignQr = await client.query(
      "SELECT target_id FROM qr_codes WHERE target_type = 'campaign' AND code = $1",
      [`qr-${slug}-camp`],
    );
    expect(campaignQr.rows[0]?.target_id).toBe(campaignId);

    // Page publique accessible (Tâche 1.6, v_public_campaign) -- en tant qu'anon.
    const publicRows = await asRole(
      'anon',
      null,
      'SELECT id, slug, beneficiary_type, beneficiary_id FROM v_public_campaign WHERE id = $1',
      [campaignId],
    );
    expect(publicRows).toHaveLength(1);
    expect(publicRows[0]).toMatchObject({ slug, beneficiary_type: 'team', beneficiary_id: SEED_TEAM_ID });

    // Les packs recommandés de la campagne sont eux aussi visibles publiquement.
    const publicProducts = await asRole(
      'anon',
      null,
      'SELECT product_id FROM v_public_campaign_products WHERE campaign_id = $1',
      [campaignId],
    );
    expect(publicProducts).toHaveLength(4);
  });

  it("refuse (RLS) qu'un manager hors périmètre crée une campagne pour l'équipe du seed", async () => {
    await expect(
      callCreateCampaign(OUTSIDE_MANAGER_ID, {
        name: 'Campagne intruse',
        slug: 'campagne-intruse',
        beneficiaryType: 'team',
        beneficiaryId: SEED_TEAM_ID,
        teamId: SEED_TEAM_ID,
        clubId: null,
        participantAthleteIds: [],
        productIds: [SEED_PRODUCT_IDS[0]!],
      }),
    ).rejects.toThrow(/row-level security|new row violates/i);

    const count = await client.query('SELECT COUNT(*)::text AS count FROM campaigns WHERE slug = $1', [
      'campagne-intruse',
    ]);
    expect(count.rows[0]?.count).toBe('0');
  });

  it('self-service plafonné (migration 0008) : un taux de crédit <= 50 % est accepté pour la propre campagne du manager', async () => {
    const result = await callCreateCampaign(TEAM_MANAGER_ID, {
      name: 'Campagne avec règle de crédit',
      slug: 'campagne-regle-credit-ok',
      beneficiaryType: 'team',
      beneficiaryId: SEED_TEAM_ID,
      teamId: SEED_TEAM_ID,
      clubId: null,
      participantAthleteIds: [],
      productIds: [SEED_PRODUCT_IDS[0]!],
      creditRule: { percent_bps: 5000 },
    });
    expect(result.credit_rule_id).not.toBeNull();

    const rule = await client.query('SELECT percent_bps, scope, campaign_id FROM credit_rules WHERE id = $1', [
      result.credit_rule_id,
    ]);
    expect(rule.rows[0]).toMatchObject({ percent_bps: 5000, scope: 'campaign', campaign_id: result.campaign.id });
  });

  it("self-service plafonné (migration 0008) : un taux de crédit > 50 % est rejeté par la policy RLS (défense en profondeur, même si l'application le bloque déjà)", async () => {
    await expect(
      callCreateCampaign(TEAM_MANAGER_ID, {
        name: 'Campagne avec règle de crédit excessive',
        slug: 'campagne-regle-credit-excessive',
        beneficiaryType: 'team',
        beneficiaryId: SEED_TEAM_ID,
        teamId: SEED_TEAM_ID,
        clubId: null,
        participantAthleteIds: [],
        productIds: [SEED_PRODUCT_IDS[0]!],
        creditRule: { percent_bps: 6000 },
      }),
    ).rejects.toThrow(/row-level security|new row violates/i);

    // La transaction entière doit avoir échoué (atomicité, CLAUDE.md section 4)
    // -- la campagne elle-même ne doit pas exister malgré l'échec localisé sur
    // l'INSERT credit_rules.
    const count = await client.query('SELECT COUNT(*)::text AS count FROM campaigns WHERE slug = $1', [
      'campagne-regle-credit-excessive',
    ]);
    expect(count.rows[0]?.count).toBe('0');
  });

  it('credit_rules_read_active (correction de bug, migration 0008) : un client/invité voit les règles actives', async () => {
    const rows = await asRole(
      'anon',
      null,
      "SELECT id FROM credit_rules WHERE is_active = true AND scope = 'product' LIMIT 1",
    );
    // Pas de règle de crédit produit dans le seed actuel -- ce test vérifie
    // surtout l'ABSENCE d'erreur RLS (la policy laisse passer, même si le
    // résultat est vide) ; complété par le test précédent qui prouve qu'une
    // règle insérée par le test ci-dessus EST bien lisible par anon.
    expect(Array.isArray(rows)).toBe(true);

    const visibleRule = await asRole(
      'anon',
      null,
      "SELECT percent_bps FROM credit_rules WHERE scope = 'campaign' AND percent_bps = 5000",
    );
    expect(visibleRule.length).toBeGreaterThanOrEqual(1);
  });
});
