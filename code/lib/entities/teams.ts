/**
 * CRUD équipe (Tâche 1.1). Même structure que `lib/entities/clubs.ts` —
 * logique pure injectée avec un `TeamRepo`, voir ce fichier pour le contexte
 * détaillé sur le choix de ne pas dépendre directement de Supabase ici.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type AuthUser } from '@/lib/auth/permissions';
import { pickUniqueSlug } from '@/lib/slug';
import type { TeamsTable } from '@/lib/db/types';
import { NotFoundError, PermissionError } from './errors';

export const teamInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom de l'équipe est requis.").max(200),
  clubId: z.string().uuid().nullable().optional(),
  sport: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(), // ex: 'U11'
  logoUrl: z.string().trim().url("L'URL du logo n'est pas valide.").nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().length(2).nullable().optional(),
});
export type TeamInput = z.infer<typeof teamInputSchema>;

export const teamUpdateSchema = teamInputSchema.partial().omit({ clubId: true });
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;

export type TeamRow = TeamsTable['Row'];

export interface TeamRepo {
  isSlugTaken(slug: string): Promise<boolean>;
  insertTeam(input: {
    name: string;
    slug: string;
    clubId: string | null;
    sport: string | null;
    category: string | null;
    logoUrl: string | null;
    city: string | null;
    province: string | null;
  }): Promise<TeamRow>;
  getTeamById(id: string): Promise<TeamRow | null>;
  updateTeam(id: string, patch: Partial<TeamUpdateInput>): Promise<TeamRow>;
}

export function createSupabaseTeamRepo(supabase: SupabaseClient): TeamRepo {
  return {
    async isSlugTaken(slug) {
      const { data, error } = await supabase
        .from('teams')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async insertTeam(input) {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name: input.name,
          slug: input.slug,
          club_id: input.clubId,
          sport: input.sport,
          category: input.category,
          logo_url: input.logoUrl,
          city: input.city,
          province: input.province,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TeamRow;
    },
    async getTeamById(id) {
      const { data, error } = await supabase.from('teams').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as TeamRow) ?? null;
    },
    async updateTeam(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.sport !== undefined) row.sport = patch.sport;
      if (patch.category !== undefined) row.category = patch.category;
      if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.province !== undefined) row.province = patch.province;

      const { data, error } = await supabase
        .from('teams')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as TeamRow;
    },
  };
}

/**
 * Crée une équipe. `clubId` fourni : exige le scope `club_admin` sur ce club
 * (`teams_insert`). `clubId` absent (équipe indépendante) : réservé à
 * `platform_admin` (`manages_club(NULL)` vaut toujours faux côté RLS — voir
 * docs/DECISIONS.md, correction de la Tâche 1.1). Le club_admin gère ensuite
 * l'équipe via son scope club, sans membership supplémentaire à créer ici.
 */
export async function createTeam(
  user: AuthUser,
  rawInput: unknown,
  repo: TeamRepo,
): Promise<TeamRow> {
  const input = teamInputSchema.parse(rawInput);
  const clubId = input.clubId ?? null;

  if (!can(user, 'create', { type: 'team', id: null, clubId })) {
    throw new PermissionError("Vous n'avez pas le droit de créer cette équipe.");
  }

  const slug = await pickUniqueSlug(input.name, (candidate) => repo.isSlugTaken(candidate));

  return repo.insertTeam({
    name: input.name,
    slug,
    clubId,
    sport: input.sport ?? null,
    category: input.category ?? null,
    logoUrl: input.logoUrl ?? null,
    city: input.city ?? null,
    province: input.province === undefined ? 'QC' : input.province,
  });
}

export async function updateTeam(
  user: AuthUser,
  teamId: string,
  rawPatch: unknown,
  repo: TeamRepo,
): Promise<TeamRow> {
  const existing = await repo.getTeamById(teamId);
  if (!existing) {
    throw new NotFoundError('Équipe introuvable.');
  }
  if (!can(user, 'update', { type: 'team', id: teamId, clubId: existing.club_id })) {
    throw new PermissionError("Vous n'avez pas le droit de modifier cette équipe.");
  }

  const patch = teamUpdateSchema.parse(rawPatch);
  return repo.updateTeam(teamId, patch);
}

export async function getTeam(user: AuthUser, teamId: string, repo: TeamRepo): Promise<TeamRow> {
  const existing = await repo.getTeamById(teamId);
  if (!existing) {
    throw new NotFoundError('Équipe introuvable.');
  }
  if (!can(user, 'read', { type: 'team', id: teamId, clubId: existing.club_id })) {
    throw new PermissionError("Vous n'avez pas le droit de consulter cette équipe.");
  }
  return existing;
}
