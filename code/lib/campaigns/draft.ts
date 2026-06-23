/**
 * Brouillon de l'assistant de campagne, étape par étape (Tâche 1.6.B1, voir
 * docs/prompts/phase-1-6.md). Transforme le formulaire unique de la Tâche 1.7
 * en plusieurs écrans courts : « une décision principale par étape, sauvegarde
 * automatique, retour arrière sans perte, reprise sur un autre appareil ».
 *
 * Persistance EXCLUSIVEMENT côté serveur (table `campaign_drafts`, migration
 * 0010), jamais en cookie/localStorage : la reprise multi-appareil n'a de
 * sens que si l'état vit derrière `auth.uid()`, pas dans le navigateur d'un
 * appareil précis.
 *
 * Suppression de la section « Règle de crédit » de la Tâche 1.7 (principe du
 * Bloc B, docs/prompts/phase-1-6.md) : « le responsable ne touche JAMAIS aux
 * règles de crédit ni aux taux ». `buildCampaignInputFromDraft` force donc
 * `creditRule: null` — la capacité self-service plafonnée elle-même
 * (`lib/campaigns/create-campaign.ts`, migration 0008) reste intacte au
 * niveau données/permissions pour un usage admin futur, simplement plus
 * jamais exposée dans CET assistant. Voir docs/DECISIONS.md.
 *
 * Même séparation que le reste du projet (CLAUDE.md section 6) : validation
 * zod + fusion de brouillon en TypeScript pur et testable ici ; coercion des
 * `FormData` (chaînes brutes → types) dans
 * `app/(portails)/campagnes/nouvelle/actions.ts`, jamais ici.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignBaseSchema, type CampaignInput } from './create-campaign';

/** Une étape = un écran = UNE décision principale (critère d'acceptation). */
export const CAMPAIGN_DRAFT_STEP_IDS = [
  'type_nom',
  'beneficiaire',
  'objectif_dates',
  'participants',
  'packs',
  'recap',
] as const;

export type CampaignDraftStepId = (typeof CAMPAIGN_DRAFT_STEP_IDS)[number];

export const CAMPAIGN_DRAFT_STEP_LABELS: Record<CampaignDraftStepId, string> = {
  type_nom: 'Type et nom',
  beneficiaire: 'Bénéficiaire',
  objectif_dates: 'Objectif et dates',
  participants: 'Athlètes participants',
  packs: 'Packs inclus',
  recap: 'Récapitulatif',
};

export function isValidDraftStepId(value: unknown): value is CampaignDraftStepId {
  return (CAMPAIGN_DRAFT_STEP_IDS as readonly string[]).includes(value as string);
}

/** 1-based, pour un usage direct dans `?etape=N` (plus lisible pour une
 * utilisatrice/un utilisateur qu'un index 0-based dans l'URL). */
export function stepIndexFromStepId(stepId: CampaignDraftStepId): number {
  return CAMPAIGN_DRAFT_STEP_IDS.indexOf(stepId) + 1;
}

export function stepIdFromIndex(index: number): CampaignDraftStepId {
  const clamped = Math.min(Math.max(Math.trunc(index), 1), CAMPAIGN_DRAFT_STEP_IDS.length);
  return CAMPAIGN_DRAFT_STEP_IDS[clamped - 1] ?? CAMPAIGN_DRAFT_STEP_IDS[0];
}

/** Coerce et borne `searchParams.etape` (toujours une chaîne ou absente côté
 * Next.js) : une valeur absente, invalide ou hors bornes retombe sur l'étape
 * 1 plutôt que de planter la page — jamais d'état invalide affiché. */
export function clampStepQueryParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value !== undefined ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), CAMPAIGN_DRAFT_STEP_IDS.length);
}

export function nextStepId(stepId: CampaignDraftStepId): CampaignDraftStepId | null {
  const index = CAMPAIGN_DRAFT_STEP_IDS.indexOf(stepId);
  return CAMPAIGN_DRAFT_STEP_IDS[index + 1] ?? null;
}

export function previousStepId(stepId: CampaignDraftStepId): CampaignDraftStepId | null {
  const index = CAMPAIGN_DRAFT_STEP_IDS.indexOf(stepId);
  return index <= 0 ? null : CAMPAIGN_DRAFT_STEP_IDS[index - 1] ?? null;
}

/**
 * Données accumulées au fil des étapes — tout est optionnel : une étape
 * ultérieure peut ne jamais avoir été visitée. AUCUN champ `creditRule` (voir
 * en-tête de fichier).
 */
export interface CampaignDraftData {
  type?: CampaignInput['type'];
  name?: string;
  publicMessage?: string | null;
  teamId?: string | null;
  clubId?: string | null;
  beneficiaryType?: CampaignInput['beneficiaryType'];
  beneficiaryId?: string;
  goalCents?: number | null;
  startsAt?: string;
  endsAt?: string | null;
  participantAthleteIds?: string[];
  productIds?: string[];
}

/**
 * Un schéma par étape, construit à partir des MÊMES sous-schémas de champ que
 * `campaignBaseSchema` (lib/campaigns/create-campaign.ts) — aucune énumération
 * (`type`, `beneficiaryType`...) n'est redéfinie ici. Seules les règles
 * croisées (« au moins équipe ou club », « fin >= début ») qui concernent
 * exclusivement les champs DE CETTE étape sont reproduites ; la validation
 * complète et finale reste `campaignInputSchema`, appelée par `createCampaign`
 * à l'étape « recap ».
 */
const stepSchemas = {
  type_nom: z.object({
    type: campaignBaseSchema.shape.type,
    name: campaignBaseSchema.shape.name,
    publicMessage: campaignBaseSchema.shape.publicMessage,
  }),
  beneficiaire: z
    .object({
      teamId: campaignBaseSchema.shape.teamId,
      clubId: campaignBaseSchema.shape.clubId,
      beneficiaryType: campaignBaseSchema.shape.beneficiaryType,
      beneficiaryId: campaignBaseSchema.shape.beneficiaryId,
    })
    .refine((v) => v.clubId != null || v.teamId != null, {
      message: 'Une campagne doit être rattachée à au moins une équipe ou un club.',
      path: ['teamId'],
    }),
  objectif_dates: z
    .object({
      goalCents: campaignBaseSchema.shape.goalCents,
      startsAt: campaignBaseSchema.shape.startsAt,
      endsAt: campaignBaseSchema.shape.endsAt,
    })
    .refine(
      (v) => v.endsAt == null || new Date(v.endsAt).getTime() >= new Date(v.startsAt).getTime(),
      { message: 'La date de fin doit être postérieure ou égale à la date de début.', path: ['endsAt'] },
    ),
  participants: z.object({
    participantAthleteIds: campaignBaseSchema.shape.participantAthleteIds,
  }),
  packs: z.object({
    productIds: campaignBaseSchema.shape.productIds,
  }),
  // Étape de relecture seulement — aucun champ propre à valider ici ; la
  // validation complète (campaignInputSchema) a lieu au moment de la création
  // réelle (voir createCampaignFromDraftAction).
  recap: z.object({}),
} satisfies Record<CampaignDraftStepId, z.ZodTypeAny>;

/** Valide les champs d'UNE étape (déjà coercés en types primitifs par
 * `actions.ts`) et renvoie le sous-ensemble de `CampaignDraftData` à fusionner
 * dans le brouillon. Lève `ZodError` (gérée par `redirectWithError`, comme le
 * reste du projet) si l'étape est invalide. */
export function parseStepInput(stepId: CampaignDraftStepId, raw: unknown): Partial<CampaignDraftData> {
  return stepSchemas[stepId].parse(raw) as Partial<CampaignDraftData>;
}

/** Fusion pure, volontairement superficielle (`shallow merge`) : chaque étape
 * possède son propre sous-ensemble DISJOINT de clés (voir `stepSchemas`
 * ci-dessus), donc un simple spread ne perd jamais de données déjà
 * enregistrées par une étape précédente — c'est exactement ce qui garantit
 * « retour arrière sans perte » et la reprise multi-appareil. */
export function mergeDraftData(
  current: CampaignDraftData,
  patch: Partial<CampaignDraftData>,
): CampaignDraftData {
  return { ...current, ...patch };
}

/**
 * Assemble l'entrée attendue par `createCampaign` (lib/campaigns/
 * create-campaign.ts) à partir du brouillon assemblé. `creditRule: null`
 * TOUJOURS (principe du Bloc B — voir en-tête de fichier) : ce n'est pas un
 * oubli, c'est la seule valeur que cet assistant peut produire. La validation
 * (champs requis manquants, etc.) reste entièrement déléguée à
 * `campaignInputSchema.parse` à l'intérieur de `createCampaign` — si une
 * étape n'a jamais été remplie, l'erreur Zod qui en résulte redirige
 * normalement vers l'assistant (même mécanisme que la Tâche 1.7).
 */
export function buildCampaignInputFromDraft(data: CampaignDraftData): unknown {
  return {
    type: data.type,
    name: data.name,
    publicMessage: data.publicMessage ?? null,
    beneficiaryType: data.beneficiaryType,
    beneficiaryId: data.beneficiaryId,
    clubId: data.clubId ?? null,
    teamId: data.teamId ?? null,
    goalCents: data.goalCents ?? null,
    startsAt: data.startsAt,
    endsAt: data.endsAt ?? null,
    participantAthleteIds: data.participantAthleteIds ?? [],
    productIds: data.productIds ?? [],
    creditRule: null,
  };
}

export interface CampaignDraftRecord {
  currentStepId: CampaignDraftStepId;
  data: CampaignDraftData;
}

/** Accès aux données du brouillon, injecté pour permettre des tests sans base
 * de données réelle (même patron que `CampaignRepo`, create-campaign.ts). */
export interface CampaignDraftRepo {
  getDraft(userId: string): Promise<CampaignDraftRecord | null>;
  /** Fusionne `data` dans le brouillon existant (ou le crée) et avance
   * `current_step` à `nextStepId` — un seul aller-retour DB par étape. */
  saveStep(userId: string, nextStepId: CampaignDraftStepId, data: CampaignDraftData): Promise<void>;
  discardDraft(userId: string): Promise<void>;
}

export function createSupabaseCampaignDraftRepo(supabase: SupabaseClient): CampaignDraftRepo {
  return {
    async getDraft(userId) {
      const { data, error } = await supabase
        .from('campaign_drafts')
        .select('current_step, draft_data')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        currentStepId: isValidDraftStepId(data.current_step) ? data.current_step : CAMPAIGN_DRAFT_STEP_IDS[0],
        data: (data.draft_data ?? {}) as CampaignDraftData,
      };
    },
    async saveStep(userId, stepId, data) {
      const { error } = await supabase
        .from('campaign_drafts')
        .upsert(
          { user_id: userId, current_step: stepId, draft_data: data, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
    },
    async discardDraft(userId) {
      const { error } = await supabase.from('campaign_drafts').delete().eq('user_id', userId);
      if (error) throw error;
    },
  };
}
