/**
 * P.7 (SPEC-PARAMETRES-PLATEFORME.md §2, §4, §6) : mécanisme de dérogation
 * admin — lecture de la dérogation active pour une portée donnée + écriture
 * (justification obligatoire, réservée à `platform_admin`), table
 * `derogations_parametres` (migration 0023, étendue en migration 0027 pour
 * admettre `entite_type = 'club'` et poser ses policies RLS).
 *
 * Portée volontairement limitée aux règles DURES qui admettent explicitement
 * une dérogation (spec §4) : R1 (`campagne_duree_jours`), R3
 * (`campagne_athletes_max`), R4 (`campagne_commandes_max`), R5
 * (`campagne_produits_max`), R7 (`equipe_campagnes_par_an_max`).
 *   - R2 n'admet AUCUNE dérogation (obligation légale, spec §4) — cette clé
 *     n'apparaît jamais dans `CLES_DEROGEABLES` ci-dessous, et
 *     `createDerogation` la rejette explicitement (le message d'erreur du
 *     schéma zod le précise).
 *   - R8 (`athlete_credit_annuel_max`) a son propre mécanisme ADM décrit par
 *     la spec (« libération manuelle des crédits en attente après validation
 *     ») : ce n'est PAS un relèvement prospectif d'un plafond via ce module,
 *     mais un changement de statut sur des lignes `order_credits` déjà
 *     écrites (P.5, `credit_pending_reason = 'plafond_annuel'`) — hors
 *     périmètre de ce fichier. Voir docs/DECISIONS.md, P.7.
 *
 * Décision autonome majeure (voir docs/DECISIONS.md, P.7) — PORTÉE de la
 * dérogation par règle : R1/R3/R5 sont validées AVANT la création de la
 * campagne (`assertPlatformParameterRules`, lib/campaigns/create-campaign.ts)
 * — aucun id de campagne n'existe encore à ce moment. Une dérogation pour ces
 * trois règles cible donc l'ÉQUIPE ou le CLUB porteur de la future campagne
 * (`entite_type = 'equipe' | 'club'`, `entite_id = teamId | clubId`), jamais
 * `'campagne'`. R7 est déjà nativement scopée équipe (aucune variante club,
 * voir create-campaign.ts). R4, à l'inverse, est vérifiée AU PAIEMENT d'une
 * campagne déjà EXISTANTE (`create-checkout-session.ts`) — sa dérogation
 * cible donc directement `entite_type = 'campagne'`, cohérent avec le libellé
 * spec R4 : « relèvement possible par dérogation EN COURS de campagne ».
 *
 * Décision autonome — dérogation « active » : la table est un journal
 * d'audit append-only (aucune colonne de statut/expiration, spec §2 — et
 * aucune policy UPDATE/DELETE, migration 0027). La dérogation ACTIVE pour une
 * portée (clé + entité) est donc simplement la ligne la plus RÉCENTE
 * enregistrée pour cette portée (`cree_le DESC LIMIT 1`) — une nouvelle
 * dérogation remplace implicitement la précédente sans jamais l'effacer,
 * l'historique complet reste consultable pour l'audit.
 *
 * Décision autonome — forme de `valeur_appliquee` : un simple entier positif
 * (le nouveau plafond), jamais l'objet composite `{min,max,defaut}` de
 * `campagne_duree_jours` — seul le MAX est bloquant (R1, spec §4), `defaut`
 * n'est qu'un confort UX de pré-remplissage sans lien avec la dérogation. Le
 * MIN de `campagne_duree_jours` n'est jamais dérogeable non plus : aucun cas
 * d'usage de la spec ne motive une campagne plus COURTE que le minimum.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type AuthUser } from '@/lib/auth/permissions';
import { BusinessRuleError, PermissionError } from '@/lib/entities/errors';
import { logger } from '@/lib/logger/logger';

export type EntiteDerogation = 'campagne' | 'equipe' | 'club' | 'athlete';

/** Les 5 clés dérogeables (R1, R3, R4, R5, R7) — voir l'en-tête de fichier
 * pour R2 (jamais dérogeable) et R8 (mécanisme distinct, hors périmètre). */
export const CLES_DEROGEABLES = [
  'campagne_duree_jours',
  'campagne_athletes_max',
  'campagne_commandes_max',
  'campagne_produits_max',
  'equipe_campagnes_par_an_max',
] as const;
export type CleDerogeable = (typeof CLES_DEROGEABLES)[number];

export function isCleDerogeable(cle: string): cle is CleDerogeable {
  return (CLES_DEROGEABLES as readonly string[]).includes(cle);
}

/** Types d'entité valides pour chaque clé dérogeable — voir la décision de
 * portée en en-tête de fichier. */
export const ENTITES_VALIDES_PAR_CLE: Record<CleDerogeable, readonly EntiteDerogation[]> = {
  campagne_duree_jours: ['equipe', 'club'],
  campagne_athletes_max: ['equipe', 'club'],
  campagne_produits_max: ['equipe', 'club'],
  equipe_campagnes_par_an_max: ['equipe'],
  campagne_commandes_max: ['campagne'],
};

export interface DerogationRow {
  id: string;
  cleParametre: string;
  entiteType: string;
  entiteId: string;
  valeurAppliquee: unknown;
  justification: string;
  adminId: string | null;
  creeLe: string;
}

/** Accès aux données nécessaires à la lecture/écriture d'une dérogation,
 * injecté pour permettre des tests sans base de données réelle (même patron
 * que `CampaignRepo`/`ParametresRepo`). */
export interface DerogationsRepo {
  /** Dérogation ACTIVE (la plus récente) pour cette portée, ou `null` si
   * aucune — voir la décision « dérogation active » en en-tête de fichier. */
  findActive(
    cleParametre: CleDerogeable,
    entiteType: EntiteDerogation,
    entiteId: string,
  ): Promise<DerogationRow | null>;
  create(row: {
    cleParametre: CleDerogeable;
    entiteType: EntiteDerogation;
    entiteId: string;
    valeurAppliquee: number;
    justification: string;
    adminId: string;
  }): Promise<DerogationRow>;
  /** Historique complet (les N plus récentes, toutes portées confondues) —
   * utilisé uniquement par l'écran admin de consultation (P.7, tâche
   * « interface admin minimale »), jamais par les validations R1/R3/R4/R5/R7. */
  listRecent(limit: number): Promise<DerogationRow[]>;
}

interface DerogationRowRaw {
  id: string;
  cle_parametre: string;
  entite_type: string;
  entite_id: string;
  valeur_appliquee: unknown;
  justification: string;
  admin_id: string | null;
  cree_le: string;
}

function fromRawRow(row: DerogationRowRaw): DerogationRow {
  return {
    id: row.id,
    cleParametre: row.cle_parametre,
    entiteType: row.entite_type,
    entiteId: row.entite_id,
    valeurAppliquee: row.valeur_appliquee,
    justification: row.justification,
    adminId: row.admin_id,
    creeLe: row.cree_le,
  };
}

const SELECT_COLUMNS = 'id, cle_parametre, entite_type, entite_id, valeur_appliquee, justification, admin_id, cree_le';

export function createSupabaseDerogationsRepo(supabase: SupabaseClient): DerogationsRepo {
  return {
    async findActive(cleParametre, entiteType, entiteId) {
      const { data, error } = await supabase
        .from('derogations_parametres')
        .select(SELECT_COLUMNS)
        .eq('cle_parametre', cleParametre)
        .eq('entite_type', entiteType)
        .eq('entite_id', entiteId)
        .order('cree_le', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? fromRawRow(data as DerogationRowRaw) : null;
    },
    async create(row) {
      const { data, error } = await supabase
        .from('derogations_parametres')
        .insert({
          cle_parametre: row.cleParametre,
          entite_type: row.entiteType,
          entite_id: row.entiteId,
          valeur_appliquee: row.valeurAppliquee,
          justification: row.justification,
          admin_id: row.adminId,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return fromRawRow(data as DerogationRowRaw);
    },
    async listRecent(limit) {
      const { data, error } = await supabase
        .from('derogations_parametres')
        .select(SELECT_COLUMNS)
        .order('cree_le', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data as DerogationRowRaw[]) ?? []).map(fromRawRow);
    },
  };
}

// =============================================================================
// LECTURE — résolution de la limite effective (pure).
// =============================================================================

const valeurAppliqueeSchema = z.number().int().positive();

/**
 * Limite effective à appliquer pour une règle donnée : la valeur de la
 * dérogation ACTIVE si elle est présente et valide, sinon la limite de base
 * (`parametres_plateforme`). Fonction PURE — ne lit jamais la DB elle-même,
 * l'appelant a déjà résolu `derogation` via `DerogationsRepo.findActive`
 * (même séparation pure/IO que `lib/checkout/campaign-order-cap.ts`).
 *
 * Défense en profondeur : une `valeur_appliquee` corrompue en base (ne
 * devrait jamais arriver — validée à l'ÉCRITURE par `createDerogation`)
 * retombe silencieusement sur la limite de base plutôt que de faire planter
 * une création de campagne ou un paiement — même philosophie de repli que
 * `lib/parametres.ts` (une donnée invalide ne doit jamais faire échouer tout
 * le reste).
 */
export function resolveEffectiveLimit(baseLimit: number, derogation: DerogationRow | null): number {
  if (!derogation) return baseLimit;
  const parsed = valeurAppliqueeSchema.safeParse(derogation.valeurAppliquee);
  if (!parsed.success) {
    logger.warn('Dérogation active avec une valeur_appliquee invalide, limite de base utilisée', {
      derogationId: derogation.id,
      cleParametre: derogation.cleParametre,
    });
    return baseLimit;
  }
  return parsed.data;
}

// =============================================================================
// ÉCRITURE — réservée à platform_admin, justification obligatoire.
// =============================================================================

const createDerogationInputSchema = z.object({
  cleParametre: z.string().refine(isCleDerogeable, {
    message:
      'Ce paramètre n\'admet aucune dérogation (R2, obligation légale) ou n\'est pas géré par ce mécanisme (R8, libération manuelle distincte).',
  }),
  entiteType: z.enum(['campagne', 'equipe', 'club', 'athlete']),
  entiteId: z.string().uuid('Portée (id) invalide.'),
  valeurAppliquee: z.number().int().positive('La nouvelle valeur doit être un entier positif.'),
  justification: z
    .string()
    .trim()
    .min(10, 'La justification doit être détaillée (10 caractères minimum).')
    .max(2000),
});
export type CreateDerogationInput = z.infer<typeof createDerogationInputSchema>;

/**
 * Pose une dérogation (P.7). Réservé à `platform_admin` (`can(admin,
 * 'create', { type: 'derogation' })`, voir `lib/auth/permissions.ts`) —
 * vérifié ICI en plus de la policy RLS `derogations_parametres_insert_admin`
 * (migration 0027), même défense en profondeur que `createCampaign`/
 * `createProduct`.
 */
export async function createDerogation(
  admin: AuthUser,
  rawInput: unknown,
  repo: DerogationsRepo,
): Promise<DerogationRow> {
  if (!can(admin, 'create', { type: 'derogation' })) {
    throw new PermissionError('Seul un administrateur de la plateforme peut poser une dérogation.');
  }

  const input = createDerogationInputSchema.parse(rawInput);
  const cle = input.cleParametre as CleDerogeable;

  const entitesValides = ENTITES_VALIDES_PAR_CLE[cle];
  if (!entitesValides.includes(input.entiteType)) {
    throw new BusinessRuleError(
      `Le paramètre « ${cle} » se déroge par ${entitesValides.join(' ou ')}, pas par « ${input.entiteType} ».`,
    );
  }

  return repo.create({
    cleParametre: cle,
    entiteType: input.entiteType,
    entiteId: input.entiteId,
    valeurAppliquee: input.valeurAppliquee,
    justification: input.justification,
    adminId: admin.id,
  });
}
