/**
 * CRUD club (Tâche 1.1).
 *
 * Logique métier PURE testable (validation, permissions, slug) séparée de
 * l'I/O via l'interface `ClubRepo` injectée — voir CLAUDE.md section 6
 * ("logique métier dans lib/, PAS dans les composants ni les routes") et
 * `tests/integration/entities.test.ts` (chaîne club -> équipe -> athlète,
 * testée avec un `ClubRepo` en mémoire, sans base de données réelle — le
 * réseau vers *.supabase.co est bloqué dans ce bac à sable, comme déjà
 * documenté dans docs/DECISIONS.md pour la Tâche 0.3).
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type AuthUser } from '@/lib/auth/permissions';
import { pickUniqueSlug } from '@/lib/slug';
import type { ClubsTable } from '@/lib/db/types';
import { NotFoundError, PermissionError } from './errors';

export const clubInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du club est requis.').max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  logoUrl: z.string().trim().url("L'URL du logo n'est pas valide.").nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  // Décision autonome (CLAUDE.md section 2 : "province par défaut QC") :
  // si non fournie, on assume QC plutôt que de laisser NULL. `null` explicite
  // reste accepté (cas rare d'un club hors province connue).
  province: z.string().trim().length(2).nullable().optional(),
});
export type ClubInput = z.infer<typeof clubInputSchema>;

export const clubUpdateSchema = clubInputSchema.partial();
export type ClubUpdateInput = z.infer<typeof clubUpdateSchema>;

export type ClubRow = ClubsTable['Row'];

/** Accès aux données `clubs`, injecté pour permettre des tests
 * unitaires/d'intégration sans base de données réelle. */
export interface ClubRepo {
  isSlugTaken(slug: string): Promise<boolean>;
  insertClub(input: { name: string; slug: string; description: string | null; logoUrl: string | null; city: string | null; province: string | null }): Promise<ClubRow>;
  getClubById(id: string): Promise<ClubRow | null>;
  updateClub(id: string, patch: Partial<ClubUpdateInput>): Promise<ClubRow>;
}

export function createSupabaseClubRepo(supabase: SupabaseClient): ClubRepo {
  return {
    async isSlugTaken(slug) {
      const { data, error } = await supabase
        .from('clubs')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async insertClub(input) {
      const { data, error } = await supabase
        .from('clubs')
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description,
          logo_url: input.logoUrl,
          city: input.city,
          province: input.province,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ClubRow;
    },
    async getClubById(id) {
      const { data, error } = await supabase.from('clubs').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as ClubRow) ?? null;
    },
    async updateClub(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.province !== undefined) row.province = patch.province;

      const { data, error } = await supabase
        .from('clubs')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ClubRow;
    },
  };
}

/**
 * Crée un club. Réservé à `platform_admin` (policy RLS `clubs_insert_admin`,
 * migration 0003) : pas d'auto-service en V1. L'admin assigne ensuite un
 * `club_admin` via une entrée `memberships` (écriture elle-même réservée à
 * platform_admin par `memberships_write_admin` — hors scope de ce module,
 * voir docs/DECISIONS.md). Le club démarre non approuvé
 * (`approved_at IS NULL`) : invisible publiquement jusqu'à validation admin.
 */
export async function createClub(
  user: AuthUser,
  rawInput: unknown,
  repo: ClubRepo,
): Promise<ClubRow> {
  if (!can(user, 'create', { type: 'club', id: null })) {
    throw new PermissionError("Vous n'avez pas le droit de créer un club.");
  }

  const input = clubInputSchema.parse(rawInput);
  const slug = await pickUniqueSlug(input.name, (candidate) => repo.isSlugTaken(candidate));

  return repo.insertClub({
    name: input.name,
    slug,
    description: input.description ?? null,
    logoUrl: input.logoUrl ?? null,
    city: input.city ?? null,
    province: input.province === undefined ? 'QC' : input.province,
  });
}

export async function updateClub(
  user: AuthUser,
  clubId: string,
  rawPatch: unknown,
  repo: ClubRepo,
): Promise<ClubRow> {
  const existing = await repo.getClubById(clubId);
  if (!existing) {
    throw new NotFoundError('Club introuvable.');
  }
  if (!can(user, 'update', { type: 'club', id: clubId })) {
    throw new PermissionError("Vous n'avez pas le droit de modifier ce club.");
  }

  const patch = clubUpdateSchema.parse(rawPatch);
  return repo.updateClub(clubId, patch);
}

export async function getClub(
  user: AuthUser,
  clubId: string,
  repo: ClubRepo,
): Promise<ClubRow> {
  const existing = await repo.getClubById(clubId);
  if (!existing) {
    throw new NotFoundError('Club introuvable.');
  }
  if (!can(user, 'read', { type: 'club', id: clubId })) {
    throw new PermissionError("Vous n'avez pas le droit de consulter ce club.");
  }
  return existing;
}
