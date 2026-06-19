/**
 * Test d'intégration — applique la migration + le seed sur un Postgres
 * embarqué jetable et vérifie que le résultat est cohérent.
 *
 * Pourquoi un Postgres embarqué plutôt qu'un vrai projet Supabase :
 * les identifiants Supabase réels ne sont pas encore disponibles (ils seront
 * fournis pour le déploiement). `embedded-postgres` télécharge et lance un
 * vrai moteur PostgreSQL en local, sans droits root, ce qui permet de valider
 * la migration avec le même moteur SQL que Supabase. Une migration qui
 * s'applique proprement ici doit s'appliquer proprement sur Supabase.
 *
 * `auth.users` est fourni par Supabase en production. Ici, on crée un stub
 * minimal AVANT d'appliquer la migration réelle, uniquement pour satisfaire
 * la contrainte `profiles.id REFERENCES auth.users(id)`. Ce stub ne fait
 * PARTIE NI de la migration réelle ni du seed réel : il vit uniquement dans
 * ce harnais de test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0001_initial_schema.sql',
);
const SEED_PATH = path.resolve(__dirname, '../../supabase/seed.sql');

/** Trouve un port TCP libre sur localhost pour éviter les collisions entre
 * exécutions concurrentes de la suite de tests. */
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

describe('migration + seed sur Postgres embarqué', () => {
  let pg: EmbeddedPostgres;
  let client: Client;
  let dataDir: string;

  beforeAll(async () => {
    const port = await getFreePort();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sportif-pg-test-'));

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
    await pg.createDatabase('sportif_test');

    client = pg.getPgClient('sportif_test');
    await client.connect();

    // Stub minimal d'auth.users — JAMAIS dans le fichier de migration réel.
    await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
    await client.query(
      'CREATE TABLE auth.users (id uuid primary key default gen_random_uuid());',
    );
    // gen_random_uuid() nécessite pgcrypto ; la migration la crée aussi, mais
    // le stub auth.users est créé avant la migration donc on l'active ici.
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    await client.query(migrationSql);

    const seedSql = fs.readFileSync(SEED_PATH, 'utf-8');
    await client.query(seedSql);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    if (pg) {
      // persistent: false => stop() supprime aussi les fichiers de données.
      await pg.stop();
    }
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('crée exactement 4 packs', async () => {
    const result = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM products WHERE kind = 'pack'",
    );
    expect(Number(result.rows[0]?.count)).toBe(4);
  });

  it('crée une campagne avec le statut actif', async () => {
    const result = await client.query<{ id: string; status: string; name: string }>(
      "SELECT id, status, name FROM campaigns WHERE status = 'active'",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.status).toBe('active');
  });

  it("v_campaign_progress renvoie raised_cents = 0 pour la campagne créée (aucun crédit encore émis)", async () => {
    const campaignResult = await client.query<{ id: string }>(
      "SELECT id FROM campaigns WHERE status = 'active'",
    );
    const campaignId = campaignResult.rows[0]?.id;
    expect(campaignId).toBeDefined();

    const progressResult = await client.query<{
      campaign_id: string;
      goal_cents: number;
      raised_cents: string;
    }>('SELECT campaign_id, goal_cents, raised_cents FROM v_campaign_progress WHERE campaign_id = $1', [
      campaignId,
    ]);

    expect(progressResult.rows).toHaveLength(1);
    expect(Number(progressResult.rows[0]?.raised_cents)).toBe(0);
    expect(progressResult.rows[0]?.goal_cents).toBe(500000);
  });

  it('crée exactement 3 athlètes dont exactement 1 avec hide_last_name = true', async () => {
    const totalResult = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM athletes',
    );
    expect(Number(totalResult.rows[0]?.count)).toBe(3);

    const hiddenResult = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM athletes WHERE hide_last_name = true',
    );
    expect(Number(hiddenResult.rows[0]?.count)).toBe(1);
  });

  it('enregistre le taux de taxe combiné QC (TPS 5% + TVQ 9.975% = 1498 bps)', async () => {
    const result = await client.query<{ rate_bps: number; label: string | null }>(
      "SELECT rate_bps, label FROM tax_rates WHERE province = 'QC' ORDER BY rate_bps",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rate_bps).toBe(1498);
    expect(result.rows[0]?.label).toMatch(/TPS/);
    expect(result.rows[0]?.label).toMatch(/TVQ/);
  });
});
