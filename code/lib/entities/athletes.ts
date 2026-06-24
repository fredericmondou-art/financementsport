/**
 * CRUD athlète (Tâche 1.1, assoupli à la Tâche 1.6.B2) — le module le plus
 * sensible de cette tâche (données de mineurs, CLAUDE.md sections 2 et 5).
 *
 * Règles non négociables, contrôlées ici :
 * - Un athlète mineur (`isMinor`, défaut `true`, même défaut que la colonne
 *   DB) peut être créé SANS `guardianId` (décision de Frédéric, 2026-06-23,
 *   voir docs/DECISIONS.md — Tâche 1.6.B2 : « création non bloquée » même
 *   sans tuteur connu, ex. saisie en lot par un gérant d'équipe qui n'a pas
 *   les coordonnées du parent). Un tel athlète reste un mineur SANS tuteur
 *   lié : `isAthletePubliclyVisible` le garde non publiable indéfiniment
 *   (aucun consentement ne peut être enregistré sans tuteur), et
 *   `canEditHiddenAthleteFields` (lib/auth/permissions.ts) ne donne accès aux
 *   champs `hide_*`/consentement qu'au tuteur, à l'athlète majeur lui-même,
 *   OU à `platform_admin` — c'est `platform_admin` qui rattache un tuteur
 *   après coup (`athleteUpdateSchema` exclut volontairement `guardianId` de
 *   la mise à jour générique ; le rattachement reste une opération admin
 *   hors scope de ce module, à construire si besoin).
 * - Les champs `hide_*` et `parentalConsentAt` ne sont écrits que si le
 *   demandeur EST le tuteur (`guardianId`) ou l'athlète majeur lui-même
 *   (`userId`) — même à la création par un tiers autorisé (ex: un gérant
 *   d'équipe qui inscrit ses athlètes). Sinon ils restent à leur valeur par
 *   défaut (non masqué, pas de consentement) : un tiers ne peut jamais
 *   accorder un consentement parental à la place du parent.
 * - `isAthletePubliclyVisible` reproduit exactement le filtre de la vue
 *   publique `v_public_athlete` (migration 0003) : un mineur sans
 *   `parental_consent_at` n'est jamais publiable. Défense en profondeur —
 *   la vue elle-même applique déjà ce filtre côté DB ; cette fonction permet
 *   de le signaler clairement côté application (ex: message dans le portail
 *   gérant) sans dupliquer la logique de filtrage RLS.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, canEditHiddenAthleteFields, type AuthUser } from '@/lib/auth/permissions';
import { pickUniqueSlug } from '@/lib/slug';
import type { AthletesTable } from '@/lib/db/types';
import { BusinessRuleError, NotFoundError, PermissionError } from './errors';

export const athleteInputSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Le prénom est requis.').max(100),
    lastName: z.string().trim().min(1, 'Le nom est requis.').max(100),
    teamId: z.string().uuid().nullable().optional(),
    guardianId: z.string().uuid().nullable().optional(),
    // Athlète majeur qui gère lui-même son profil (profils.id).
    userId: z.string().uuid().nullable().optional(),
    isMinor: z.boolean().optional().default(true),
    sport: z.string().trim().max(80).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    personalMessage: z.string().trim().max(2000).nullable().optional(),
    hideLastName: z.boolean().optional().default(false),
    hidePhoto: z.boolean().optional().default(false),
    hideCity: z.boolean().optional().default(false),
    hideAmounts: z.boolean().optional().default(false),
    showTeamOnly: z.boolean().optional().default(false),
    parentalConsentAt: z.string().datetime().nullable().optional(),
  });
// Pas de `.superRefine()` exigeant `guardianId` quand `isMinor` est vrai : un
// mineur sans tuteur connu est une entrée valide depuis la Tâche 1.6.B2 (voir
// le commentaire d'en-tête) — seulement non publiable, jamais bloqué.
export type AthleteInput = z.infer<typeof athleteInputSchema>;

// `guardianId`, `userId` et `isMinor` ne sont volontairement PAS modifiables
// via cette mise à jour générique : changer le lien légal tuteur/athlète ou
// le statut mineur est une opération sensible hors scope de la Tâche 1.1
// (voir docs/DECISIONS.md).
export const athleteUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  teamId: z.string().uuid().nullable().optional(),
  sport: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  personalMessage: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  hideLastName: z.boolean().optional(),
  hidePhoto: z.boolean().optional(),
  hideCity: z.boolean().optional(),
  hideAmounts: z.boolean().optional(),
  showTeamOnly: z.boolean().optional(),
  parentalConsentAt: z.string().datetime().nullable().optional(),
});
export type AthleteUpdateInput = z.infer<typeof athleteUpdateSchema>;

const HIDDEN_FIELD_KEYS = [
  'hideLastName',
  'hidePhoto',
  'hideCity',
  'hideAmounts',
  'showTeamOnly',
  'parentalConsentAt',
] as const;

export type AthleteRow = AthletesTable['Row'];

export interface AthleteContext {
  athlete: AthleteRow;
  /** club_id de l'équipe rattachée (résolu via une jointure), `null` si
   * l'athlète n'a pas d'équipe ou si l'équipe n'a pas de club. */
  teamClubId: string | null;
}

export interface AthleteRepo {
  isSlugTaken(slug: string): Promise<boolean>;
  getTeamClubId(teamId: string): Promise<string | null>;
  insertAthlete(input: {
    firstName: string;
    lastName: string;
    slug: string;
    teamId: string | null;
    guardianId: string | null;
    userId: string | null;
    isMinor: boolean;
    sport: string | null;
    city: string | null;
    personalMessage: string | null;
    hideLastName: boolean;
    hidePhoto: boolean;
    hideCity: boolean;
    hideAmounts: boolean;
    showTeamOnly: boolean;
    parentalConsentAt: string | null;
  }): Promise<AthleteRow>;
  getAthleteContext(id: string): Promise<AthleteContext | null>;
  updateAthlete(id: string, patch: Partial<AthleteUpdateInput>): Promise<AthleteRow>;
}

export function createSupabaseAthleteRepo(supabase: SupabaseClient): AthleteRepo {
  return {
    async isSlugTaken(slug) {
      const { data, error } = await supabase
        .from('athletes')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async getTeamClubId(teamId) {
      const { data, error } = await supabase
        .from('teams')
        .select('club_id')
        .eq('id', teamId)
        .maybeSingle();
      if (error) throw error;
      return (data as { club_id: string | null } | null)?.club_id ?? null;
    },
    async insertAthlete(input) {
      const { data, error } = await supabase
        .from('athletes')
        .insert({
          first_name: input.firstName,
          last_name: input.lastName,
          slug: input.slug,
          team_id: input.teamId,
          guardian_id: input.guardianId,
          user_id: input.userId,
          is_minor: input.isMinor,
          sport: input.sport,
          city: input.city,
          personal_message: input.personalMessage,
          hide_last_name: input.hideLastName,
          hide_photo: input.hidePhoto,
          hide_city: input.hideCity,
          hide_amounts: input.hideAmounts,
          show_team_only: input.showTeamOnly,
          parental_consent_at: input.parentalConsentAt,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AthleteRow;
    },
    async getAthleteContext(id) {
      const { data, error } = await supabase
        .from('athletes')
        .select('*, teams(club_id)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as AthleteRow & { teams: { club_id: string | null } | null };
      return { athlete: row, teamClubId: row.teams?.club_id ?? null };
    },
    async updateAthlete(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.firstName !== undefined) row.first_name = patch.firstName;
      if (patch.lastName !== undefined) row.last_name = patch.lastName;
      if (patch.teamId !== undefined) row.team_id = patch.teamId;
      if (patch.sport !== undefined) row.sport = patch.sport;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.personalMessage !== undefined) row.personal_message = patch.personalMessage;
      if (patch.isActive !== undefined) row.is_active = patch.isActive;
      if (patch.hideLastName !== undefined) row.hide_last_name = patch.hideLastName;
      if (patch.hidePhoto !== undefined) row.hide_photo = patch.hidePhoto;
      if (patch.hideCity !== undefined) row.hide_city = patch.hideCity;
      if (patch.hideAmounts !== undefined) row.hide_amounts = patch.hideAmounts;
      if (patch.showTeamOnly !== undefined) row.show_team_only = patch.showTeamOnly;
      if (patch.parentalConsentAt !== undefined) row.parental_consent_at = patch.parentalConsentAt;

      const { data, error } = await supabase
        .from('athletes')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as AthleteRow;
    },
  };
}

/**
 * Crée un athlète. Si le demandeur n'est ni le tuteur (`guardianId`) ni
 * l'athlète majeur lui-même (`userId`), les champs `hide_*` et
 * `parentalConsentAt` fournis sont IGNORÉS (forcés à leurs valeurs par
 * défaut) — voir le commentaire en tête de fichier.
 */
export async function createAthlete(
  user: AuthUser,
  rawInput: unknown,
  repo: AthleteRepo,
): Promise<AthleteRow> {
  const input = athleteInputSchema.parse(rawInput);
  const teamId = input.teamId ?? null;
  const teamClubId = teamId ? await repo.getTeamClubId(teamId) : null;

  const resource = {
    type: 'athlete' as const,
    id: null,
    teamId,
    clubId: teamClubId,
    guardianId: input.guardianId ?? null,
    athleteUserId: input.userId ?? null,
  };

  if (!can(user, 'create', resource)) {
    throw new PermissionError("Vous n'avez pas le droit de créer cet athlète.");
  }

  const requesterIsGuardianOrSelf = canEditHiddenAthleteFields(user, resource);

  const fullName = `${input.firstName} ${input.lastName}`;
  const slug = await pickUniqueSlug(fullName, (candidate) => repo.isSlugTaken(candidate));

  return repo.insertAthlete({
    firstName: input.firstName,
    lastName: input.lastName,
    slug,
    teamId,
    guardianId: input.guardianId ?? null,
    userId: input.userId ?? null,
    isMinor: input.isMinor,
    sport: input.sport ?? null,
    city: input.city ?? null,
    personalMessage: input.personalMessage ?? null,
    hideLastName: requesterIsGuardianOrSelf ? input.hideLastName : false,
    hidePhoto: requesterIsGuardianOrSelf ? input.hidePhoto : false,
    hideCity: requesterIsGuardianOrSelf ? input.hideCity : false,
    hideAmounts: requesterIsGuardianOrSelf ? input.hideAmounts : false,
    showTeamOnly: requesterIsGuardianOrSelf ? input.showTeamOnly : false,
    parentalConsentAt: requesterIsGuardianOrSelf ? input.parentalConsentAt ?? null : null,
  });
}

export async function updateAthlete(
  user: AuthUser,
  athleteId: string,
  rawPatch: unknown,
  repo: AthleteRepo,
): Promise<AthleteRow> {
  const ctx = await repo.getAthleteContext(athleteId);
  if (!ctx) {
    throw new NotFoundError('Athlète introuvable.');
  }
  const { athlete, teamClubId } = ctx;

  const resource = {
    type: 'athlete' as const,
    id: athlete.id,
    teamId: athlete.team_id,
    clubId: teamClubId,
    guardianId: athlete.guardian_id,
    athleteUserId: athlete.user_id,
  };

  if (!can(user, 'update', resource)) {
    throw new PermissionError("Vous n'avez pas le droit de modifier cet athlète.");
  }

  const patch = athleteUpdateSchema.parse(rawPatch);

  const touchesHiddenFields = HIDDEN_FIELD_KEYS.some(
    (key) => patch[key as keyof AthleteUpdateInput] !== undefined,
  );
  if (touchesHiddenFields && !canEditHiddenAthleteFields(user, resource)) {
    throw new PermissionError(
      "Seul le parent/tuteur (ou l'athlète majeur lui-même) peut modifier les champs de " +
        'confidentialité (hide_*) ou le consentement parental.',
    );
  }

  if (patch.teamId !== undefined && patch.teamId !== null) {
    // Re-vérifier le scope sur la nouvelle équipe visée, pour éviter qu'un
    // gérant ne "déplace" un athlète vers une équipe qu'il ne gère pas.
    const newTeamClubId = await repo.getTeamClubId(patch.teamId);
    const canManageNewTeam = can(user, 'update', {
      type: 'athlete',
      id: athlete.id,
      teamId: patch.teamId,
      clubId: newTeamClubId,
      guardianId: athlete.guardian_id,
      athleteUserId: athlete.user_id,
    });
    if (!canManageNewTeam) {
      throw new BusinessRuleError("Vous ne gérez pas l'équipe de destination.");
    }
  }

  return repo.updateAthlete(athlete.id, patch);
}

export async function getAthlete(
  user: AuthUser,
  athleteId: string,
  repo: AthleteRepo,
): Promise<AthleteRow> {
  const ctx = await repo.getAthleteContext(athleteId);
  if (!ctx) {
    throw new NotFoundError('Athlète introuvable.');
  }
  const { athlete, teamClubId } = ctx;
  const resource = {
    type: 'athlete' as const,
    id: athlete.id,
    teamId: athlete.team_id,
    clubId: teamClubId,
    guardianId: athlete.guardian_id,
    athleteUserId: athlete.user_id,
  };
  if (!can(user, 'read', resource)) {
    throw new PermissionError("Vous n'avez pas le droit de consulter cet athlète.");
  }
  return athlete;
}

/**
 * Reproduit EXACTEMENT le filtre `WHERE` de la vue publique
 * `v_public_athlete` (migration 0003) : un athlète mineur sans
 * `parental_consent_at` n'est jamais publiable, même actif.
 */
export function isAthletePubliclyVisible(
  athlete: Pick<AthleteRow, 'is_active' | 'is_minor' | 'parental_consent_at'>,
): boolean {
  return athlete.is_active && (!athlete.is_minor || athlete.parental_consent_at !== null);
}
