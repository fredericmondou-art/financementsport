/**
 * Assistant de création de campagne (Tâche 1.7).
 *
 * Même séparation que `lib/entities/*.ts` / `lib/catalog/products.ts` :
 * validation zod + permissions + règles métier en TypeScript pur et testable
 * (CLAUDE.md section 6), I/O injectée via `CampaignRepo`. La seule différence
 * avec les modules précédents : l'écriture est MULTI-TABLE (campagne +
 * participants + packs + règle de crédit optionnelle + QR codes) et doit
 * donc être ATOMIQUE (CLAUDE.md section 4) — `repo.createCampaignWithDetails`
 * délègue à la fonction Postgres `create_campaign_with_details`
 * (`supabase/migrations/0008_campaign_creation_assistant.sql`), une seule
 * transaction, pas de rollback manuel à gérer ici.
 *
 * Statut à la création : toujours `'active'` directement (pas de brouillon ni
 * d'étape d'approbation séparée — décision autonome, voir docs/DECISIONS.md,
 * Tâche 1.7 : le cahier exige « créer une campagne en moins de 15 minutes »
 * et l'acceptation attend une campagne déjà active en sortie d'assistant).
 * La page publique (Tâche 1.6, `v_public_campaign`) devient donc accessible
 * immédiatement après l'appel — aucun code de page publique supplémentaire
 * n'est nécessaire ici.
 *
 * Règle de crédit en self-service PLAFONNÉE (décision explicite de Frédéric,
 * voir docs/DECISIONS.md) : un taux/montant dépassant le plafond est rejeté
 * ICI avec un message clair, AVANT même d'atteindre la policy RLS
 * `credit_rules_campaign_manager_insert` (migration 0008) qui impose le même
 * plafond comme filet de sécurité final.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type AuthUser } from '@/lib/auth/permissions';
import { pickUniqueSlug } from '@/lib/slug';
import { pickUniqueQrCode } from './qr-codes';
import type { CampaignsTable } from '@/lib/db/types';
import { BusinessRuleError, PermissionError } from '@/lib/entities/errors';

/** Plafonds du self-service (voir migration 0008 — DOIVENT rester identiques
 * aux valeurs codées dans la policy RLS `credit_rules_campaign_manager_*`). */
export const SELF_SERVICE_PERCENT_BPS_CAP = 5000; // 50 %
export const SELF_SERVICE_BONUS_BPS_CAP = 5000; // 50 %
export const SELF_SERVICE_FLAT_CENTS_CAP = 10000; // 100 $

const creditRuleInputSchema = z
  .object({
    percentBps: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .nullable()
      .optional(),
    flatCents: z.number().int().min(0).nullable().optional(),
    minBasketCents: z.number().int().min(0).nullable().optional(),
    bonusPercentBps: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .refine((v) => (v.percentBps ?? null) !== null || (v.flatCents ?? null) !== null, {
    message: 'La règle de crédit doit définir un pourcentage ou un montant fixe.',
  })
  .refine((v) => (v.percentBps ?? 0) <= SELF_SERVICE_PERCENT_BPS_CAP, {
    message: `Le taux de crédit en libre-service est plafonné à ${SELF_SERVICE_PERCENT_BPS_CAP / 100} %.`,
    path: ['percentBps'],
  })
  .refine((v) => (v.bonusPercentBps ?? 0) <= SELF_SERVICE_BONUS_BPS_CAP, {
    message: `Le bonus de seuil en libre-service est plafonné à ${SELF_SERVICE_BONUS_BPS_CAP / 100} %.`,
    path: ['bonusPercentBps'],
  })
  .refine((v) => (v.flatCents ?? 0) <= SELF_SERVICE_FLAT_CENTS_CAP, {
    message: `Le montant fixe en libre-service est plafonné à ${SELF_SERVICE_FLAT_CENTS_CAP / 100} $.`,
    path: ['flatCents'],
  });
export type CreditRuleInput = z.infer<typeof creditRuleInputSchema>;

/**
 * Objet de base AVANT les `.refine()` croisés ci-dessous — exporté séparément
 * (Tâche 1.6.B1) pour que `lib/campaigns/draft.ts` puisse réutiliser les
 * mêmes sous-schémas de champs (`campaignBaseSchema.shape.type`, etc.) lors
 * de la validation étape par étape de l'assistant, SANS dupliquer les listes
 * d'énumération (`type`, `beneficiaryType`) ailleurs — un seul endroit à
 * tenir à jour. `campaignInputSchema` (validation complète, croisée entre
 * champs) reste la SEULE source de vérité utilisée à la création réelle de la
 * campagne (`createCampaign` ci-dessous) ; les schémas par étape de
 * `draft.ts` ne valident que des sous-ensembles de champs et ne remplacent
 * jamais cette validation finale.
 */
export const campaignBaseSchema = z.object({
  type: z.enum(['team', 'club', 'athlete', 'event', 'annual', 'reorder']),
  name: z.string().trim().min(1, 'Le nom de la campagne est requis.').max(200),
  publicMessage: z.string().trim().max(2000).nullable().optional(),
  beneficiaryType: z.enum(['athlete', 'team', 'club']),
  beneficiaryId: z.string().uuid('Un bénéficiaire est requis.'),
  clubId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  goalCents: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().datetime({ message: 'La date de début est requise et doit être une date valide.' }),
  endsAt: z.string().datetime().nullable().optional(),
  participantAthleteIds: z.array(z.string().uuid()).max(500).optional().default([]),
  productIds: z
    .array(z.string().uuid())
    .min(1, 'Au moins un pack doit être inclus dans la campagne.'),
  creditRule: creditRuleInputSchema.nullable().optional(),
});

export const campaignInputSchema = campaignBaseSchema
  .refine((v) => v.clubId != null || v.teamId != null, {
    message: 'Une campagne doit être rattachée à au moins une équipe ou un club.',
    path: ['teamId'],
  })
  .refine(
    (v) => v.endsAt == null || new Date(v.endsAt).getTime() >= new Date(v.startsAt).getTime(),
    { message: 'La date de fin doit être postérieure ou égale à la date de début.', path: ['endsAt'] },
  );
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export type CampaignRow = CampaignsTable['Row'];

export interface CreatedCampaignResult {
  campaign: CampaignRow;
  participantAthleteIds: string[];
  productIds: string[];
  creditRuleId: string | null;
  qrCodes: Array<{ targetType: string; code: string }>;
}

interface AthleteScopeRow {
  id: string;
  teamId: string | null;
  clubId: string | null;
}

/** Accès aux données nécessaires à la création d'une campagne, injecté pour
 * permettre des tests sans base de données réelle. */
export interface CampaignRepo {
  isSlugTaken(slug: string): Promise<boolean>;
  isQrCodeTaken(code: string): Promise<boolean>;
  /** Athlètes (participants ET/OU bénéficiaire si `beneficiaryType ===
   * 'athlete'`), avec leur équipe et le club de cette équipe — nécessaire
   * pour valider qu'un athlète appartient bien au périmètre de la campagne. */
  getAthletesScope(ids: string[]): Promise<AthleteScopeRow[]>;
  /** Sous-ensemble de `ids` correspondant à des produits EXISTANTS et ACTIFS
   * (même condition que `lib/catalog/products.ts#listPublicProducts`). */
  getActiveProductIds(ids: string[]): Promise<string[]>;
  createCampaignWithDetails(args: {
    type: CampaignInput['type'];
    name: string;
    slug: string;
    publicMessage: string | null;
    beneficiaryType: CampaignInput['beneficiaryType'];
    beneficiaryId: string;
    clubId: string | null;
    teamId: string | null;
    goalCents: number | null;
    startsAt: string;
    endsAt: string | null;
    status: 'active';
    participantAthleteIds: string[];
    productIds: string[];
    creditRule: {
      percentBps: number | null;
      flatCents: number | null;
      minBasketCents: number | null;
      bonusPercentBps: number | null;
    } | null;
    /** `targetId: null` pour le QR « campagne » : son id n'est connu qu'après
     * l'INSERT dans `campaigns`, à l'intérieur même de la fonction SQL
     * (`create_campaign_with_details`, migration 0008), qui le résout. */
    qrCodes: Array<{ targetType: string; targetId: string | null; code: string }>;
  }): Promise<CreatedCampaignResult>;
}

export function createSupabaseCampaignRepo(supabase: SupabaseClient): CampaignRepo {
  return {
    async isSlugTaken(slug) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async isQrCodeTaken(code) {
      const { data, error } = await supabase
        .from('qr_codes')
        .select('id')
        .eq('code', code)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async getAthletesScope(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('athletes')
        .select('id, team_id, teams(club_id)')
        .in('id', ids);
      if (error) throw error;
      return ((data as unknown as Array<{
        id: string;
        team_id: string | null;
        teams: { club_id: string | null } | null;
      }>) ?? []).map((row) => ({
        id: row.id,
        teamId: row.team_id,
        clubId: row.teams?.club_id ?? null,
      }));
    },
    async getActiveProductIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .in('id', ids)
        .eq('is_active', true);
      if (error) throw error;
      return ((data as Array<{ id: string }>) ?? []).map((row) => row.id);
    },
    async createCampaignWithDetails(args) {
      const { data, error } = await supabase.rpc('create_campaign_with_details', {
        p_type: args.type,
        p_name: args.name,
        p_slug: args.slug,
        p_public_message: args.publicMessage,
        p_beneficiary_type: args.beneficiaryType,
        p_beneficiary_id: args.beneficiaryId,
        p_club_id: args.clubId,
        p_team_id: args.teamId,
        p_goal_cents: args.goalCents,
        p_starts_at: args.startsAt,
        p_ends_at: args.endsAt,
        p_status: args.status,
        p_participant_athlete_ids: args.participantAthleteIds,
        p_product_ids: args.productIds,
        p_credit_rule: args.creditRule
          ? {
              percent_bps: args.creditRule.percentBps,
              flat_cents: args.creditRule.flatCents,
              min_basket_cents: args.creditRule.minBasketCents,
              bonus_percent_bps: args.creditRule.bonusPercentBps,
            }
          : null,
        p_qr_codes: args.qrCodes.map((qr) => ({
          target_type: qr.targetType,
          target_id: qr.targetId,
          code: qr.code,
        })),
      });
      if (error) throw error;

      const result = data as {
        campaign: CampaignRow;
        participant_athlete_ids: string[];
        product_ids: string[];
        credit_rule_id: string | null;
        qr_codes: Array<{ target_type: string; code: string }>;
      };

      return {
        campaign: result.campaign,
        participantAthleteIds: result.participant_athlete_ids,
        productIds: result.product_ids,
        creditRuleId: result.credit_rule_id,
        qrCodes: result.qr_codes.map((qr) => ({ targetType: qr.target_type, code: qr.code })),
      };
    },
  };
}

/**
 * Valide qu'un athlète appartient bien au périmètre de la campagne :
 *   - campagne d'équipe (`teamId` fourni, pas de `clubId` distinct) :
 *     l'athlète doit appartenir à CETTE équipe précise ;
 *   - campagne de club (`clubId` fourni) : l'athlète doit appartenir à une
 *     équipe de CE club.
 * Défense en profondeur : la policy RLS `campaign_participants_scoped` ne
 * vérifie que `manages_campaign(campaign_id)`, PAS l'appartenance de
 * l'athlète lui-même (lacune pré-existante du schéma, voir
 * docs/DECISIONS.md) — sans ce contrôle applicatif, un team_manager pourrait
 * rattacher l'athlète de N'IMPORTE QUELLE équipe à sa propre campagne.
 */
function assertAthleteInScope(
  athlete: AthleteScopeRow,
  scope: { clubId: string | null; teamId: string | null },
): void {
  if (scope.teamId !== null && athlete.teamId === scope.teamId) return;
  if (scope.clubId !== null && athlete.clubId === scope.clubId) return;
  throw new BusinessRuleError(
    `L'athlète ${athlete.id} n'appartient pas au périmètre (équipe/club) de cette campagne.`,
  );
}

export async function createCampaign(
  user: AuthUser,
  rawInput: unknown,
  repo: CampaignRepo,
): Promise<CreatedCampaignResult> {
  const input = campaignInputSchema.parse(rawInput);
  const clubId = input.clubId ?? null;
  const teamId = input.teamId ?? null;

  if (!can(user, 'create', { type: 'campaign', clubId, teamId })) {
    throw new PermissionError("Vous n'avez pas le droit de créer cette campagne.");
  }

  // Cohérence bénéficiaire <-> périmètre (au moins un bénéficiaire valide,
  // critère d'acceptation du cahier) : un bénéficiaire équipe/club doit être
  // l'équipe/club de la campagne elle-même ; un bénéficiaire athlète doit
  // appartenir à ce périmètre.
  if (input.beneficiaryType === 'team') {
    if (teamId === null || input.beneficiaryId !== teamId) {
      throw new BusinessRuleError(
        "Le bénéficiaire 'équipe' doit être l'équipe rattachée à la campagne.",
      );
    }
  } else if (input.beneficiaryType === 'club') {
    if (clubId === null || input.beneficiaryId !== clubId) {
      throw new BusinessRuleError("Le bénéficiaire 'club' doit être le club rattaché à la campagne.");
    }
  }

  const uniqueProductIds = [...new Set(input.productIds)];
  const activeProductIds = new Set(await repo.getActiveProductIds(uniqueProductIds));
  const missingProductIds = uniqueProductIds.filter((id) => !activeProductIds.has(id));
  if (missingProductIds.length > 0) {
    throw new BusinessRuleError(
      `Pack(s) introuvable(s) ou inactif(s) : ${missingProductIds.join(', ')}.`,
    );
  }

  const uniqueParticipantIds = [...new Set(input.participantAthleteIds)];
  const athleteIdsToFetch = [...new Set([...uniqueParticipantIds, ...(input.beneficiaryType === 'athlete' ? [input.beneficiaryId] : [])])];
  const athleteScopeRows = await repo.getAthletesScope(athleteIdsToFetch);
  const athleteScopeById = new Map(athleteScopeRows.map((row) => [row.id, row]));

  if (input.beneficiaryType === 'athlete') {
    const beneficiaryAthlete = athleteScopeById.get(input.beneficiaryId);
    if (!beneficiaryAthlete) {
      throw new BusinessRuleError('Athlète bénéficiaire introuvable.');
    }
    assertAthleteInScope(beneficiaryAthlete, { clubId, teamId });
  }

  for (const athleteId of uniqueParticipantIds) {
    const athlete = athleteScopeById.get(athleteId);
    if (!athlete) {
      throw new BusinessRuleError(`Athlète participant introuvable : ${athleteId}.`);
    }
    assertAthleteInScope(athlete, { clubId, teamId });
  }

  const slug = await pickUniqueSlug(input.name, (candidate) => repo.isSlugTaken(candidate));

  // Un code QR n'a pas besoin de connaître l'id de sa cible à l'avance (seul
  // `code` doit être unique) : on génère donc directement les N codes (1 pour
  // la campagne + 1 par participant). Le `target_id` du QR « campagne » n'est
  // résolu qu'à l'intérieur de `create_campaign_with_details` (migration
  // 0008), une fois la ligne `campaigns` insérée dans la même transaction —
  // voir `targetId: null` ci-dessous.
  const campaignQrCode = await pickUniqueQrCode((candidate) => repo.isQrCodeTaken(candidate));
  const participantQrCodes = await Promise.all(
    uniqueParticipantIds.map(async (athleteId) => ({
      targetType: 'athlete',
      targetId: athleteId,
      code: await pickUniqueQrCode((candidate) => repo.isQrCodeTaken(candidate)),
    })),
  );

  const creditRule = input.creditRule
    ? {
        percentBps: input.creditRule.percentBps ?? null,
        flatCents: input.creditRule.flatCents ?? null,
        minBasketCents: input.creditRule.minBasketCents ?? null,
        bonusPercentBps: input.creditRule.bonusPercentBps ?? null,
      }
    : null;

  const result = await repo.createCampaignWithDetails({
    type: input.type,
    name: input.name,
    slug,
    publicMessage: input.publicMessage ?? null,
    beneficiaryType: input.beneficiaryType,
    beneficiaryId: input.beneficiaryId,
    clubId,
    teamId,
    goalCents: input.goalCents ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    status: 'active',
    participantAthleteIds: uniqueParticipantIds,
    productIds: uniqueProductIds,
    creditRule,
    qrCodes: [
      // `targetId: null` : résolu côté SQL à `v_campaign.id` (voir migration
      // 0008) — la campagne n'a pas encore d'id à ce stade en TypeScript.
      { targetType: 'campaign', targetId: null, code: campaignQrCode },
      ...participantQrCodes,
    ],
  });

  return result;
}
