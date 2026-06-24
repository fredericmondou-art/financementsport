/**
 * Répartitions favorites (Tâche 1.5.3, docs/prompts/phase-1-5.md) : un
 * client connecté peut enregistrer une répartition entre bénéficiaires sous
 * un nom, et la réappliquer plus tard à un panier différent -- évite de
 * ressaisir la même répartition (ex. 50/50 entre deux enfants) à chaque
 * commande.
 *
 * Réutilise STRICTEMENT la validation existante de la Tâche 1.4
 * (`beneficiarySplitInputSchema`/`assertSplitTotals10000`,
 * lib/cart/beneficiaries.ts) plutôt que de la dupliquer (CLAUDE.md
 * section 6) : une répartition favorite est juste une `BeneficiarySplitInput`
 * nommée et persistée, contrôlée par les mêmes règles.
 *
 * Réservé aux clients connectés -- table `saved_splits`, RLS propriétaire
 * (migration 0013) : les repos ci-dessous filtrent toujours explicitement
 * par `userId` EN PLUS de RLS (même patron que `assertCartOwnership`,
 * lib/cart/cart.ts) -- défense en profondeur, jamais un remplacement de RLS.
 *
 * « Appliquer » une répartition favorite à un panier n'a volontairement PAS
 * de fonction dédiée ici : l'application se fait simplement en pré-remplissant
 * les lignes éditables de `components/beneficiary-split.tsx` à partir des
 * données déjà chargées par cette page (voir `listSavedSplitsForUser`) --
 * l'enregistrement final repasse par le même `setBeneficiarySplitAction`/
 * `setCartBeneficiarySplit` qu'une répartition saisie à la main, donc par
 * la même validation, sans aucune duplication.
 */
import { z } from 'zod';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { SavedSplitItemsTable, SavedSplitsTable } from '@/lib/db/types';
import { BusinessRuleError, NotFoundError } from '@/lib/entities/errors';
import { assertSplitTotals10000, beneficiarySplitInputSchema, type BeneficiarySplitInput } from './beneficiaries';
import { beneficiaryLabelKey, loadBeneficiaryActiveStatus, loadBeneficiaryLabels } from './beneficiary-labels';

export type SavedSplitRow = SavedSplitsTable['Row'];
export type SavedSplitItemRow = SavedSplitItemsTable['Row'];

/** Code d'erreur Postgres pour une violation de contrainte UNIQUE (ici
 * `UNIQUE(user_id, name)`, migration 0013). */
const UNIQUE_VIOLATION_ERROR_CODE = '23505';

export const savedSplitNameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom de la répartition est requis.')
  .max(80, 'Le nom de la répartition est trop long (80 caractères maximum).');

/** Une répartition favorite avec ses bénéficiaires, prête pour l'affichage :
 * libellé et statut actif déjà résolus (voir `listSavedSplitsForUser`). */
export interface SavedSplitWithItems {
  id: string;
  name: string;
  items: Array<{
    beneficiaryType: SavedSplitItemRow['beneficiary_type'];
    beneficiaryId: string;
    campaignId: string | null;
    shareBps: number;
    label: string;
    isActive: boolean;
  }>;
}

/** Accès aux données `saved_splits`/`saved_split_items`, injecté (même
 * patron que `CartBeneficiariesRepo`, lib/cart/beneficiaries.ts). */
export interface SavedSplitsRepo {
  listByUser(userId: string): Promise<SavedSplitRow[]>;
  listItems(savedSplitIds: string[]): Promise<SavedSplitItemRow[]>;
  getByUserAndId(userId: string, savedSplitId: string): Promise<SavedSplitRow | null>;
  create(userId: string, name: string, items: BeneficiarySplitInput): Promise<SavedSplitRow>;
  remove(userId: string, savedSplitId: string): Promise<void>;
}

function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === UNIQUE_VIOLATION_ERROR_CODE;
}

export function createSupabaseSavedSplitsRepo(supabase: SupabaseClient): SavedSplitsRepo {
  return {
    async listByUser(userId) {
      const { data, error } = await supabase
        .from('saved_splits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as SavedSplitRow[]) ?? [];
    },
    async listItems(savedSplitIds) {
      if (savedSplitIds.length === 0) return [];
      const { data, error } = await supabase
        .from('saved_split_items')
        .select('*')
        .in('saved_split_id', savedSplitIds);
      if (error) throw error;
      return (data as SavedSplitItemRow[]) ?? [];
    },
    async getByUserAndId(userId, savedSplitId) {
      const { data, error } = await supabase
        .from('saved_splits')
        .select('*')
        .eq('user_id', userId)
        .eq('id', savedSplitId)
        .maybeSingle();
      if (error) throw error;
      return (data as SavedSplitRow | null) ?? null;
    },
    async create(userId, name, items) {
      const { data: inserted, error: insertError } = await supabase
        .from('saved_splits')
        .insert({ user_id: userId, name })
        .select()
        .single();
      if (insertError) {
        if (isUniqueViolation(insertError)) {
          throw new BusinessRuleError(`Vous avez déjà une répartition favorite nommée « ${name} ».`);
        }
        throw insertError;
      }
      const savedSplit = inserted as SavedSplitRow;

      const { error: itemsError } = await supabase.from('saved_split_items').insert(
        items.map((item) => ({
          saved_split_id: savedSplit.id,
          beneficiary_type: item.beneficiaryType,
          beneficiary_id: item.beneficiaryId,
          campaign_id: item.campaignId ?? null,
          share_bps: item.shareBps,
        })),
      );
      if (itemsError) throw itemsError;

      return savedSplit;
    },
    async remove(userId, savedSplitId) {
      const { error } = await supabase.from('saved_splits').delete().eq('user_id', userId).eq('id', savedSplitId);
      if (error) throw error;
    },
  };
}

const saveSplitInputSchema = z.object({
  name: savedSplitNameSchema,
  items: beneficiarySplitInputSchema,
});
export type SaveSplitInput = z.infer<typeof saveSplitInputSchema>;

/**
 * Enregistre la répartition COURANTE (du formulaire panier) sous un nom.
 * Réutilise `beneficiarySplitInputSchema`/`assertSplitTotals10000`
 * (lib/cart/beneficiaries.ts) -- aucune validation de somme dupliquée ici.
 */
export async function saveSplitAsNamed(
  userId: string,
  rawInput: { name: unknown; items: unknown },
  repo: SavedSplitsRepo,
): Promise<SavedSplitRow> {
  const parsed = saveSplitInputSchema.parse({ name: rawInput.name, items: rawInput.items });
  assertSplitTotals10000(parsed.items);
  return repo.create(userId, parsed.name, parsed.items);
}

/** Supprime une répartition favorite -- vérifie explicitement la propriété
 * (défense en profondeur en plus de RLS) avant de lever `NotFoundError`
 * plutôt qu'une erreur Postgres opaque si elle n'appartient pas à `userId`. */
export async function deleteSavedSplit(userId: string, savedSplitId: string, repo: SavedSplitsRepo): Promise<void> {
  const existing = await repo.getByUserAndId(userId, savedSplitId);
  if (!existing) {
    throw new NotFoundError('Répartition favorite introuvable.');
  }
  await repo.remove(userId, savedSplitId);
}

/**
 * Charge toutes les répartitions favorites d'un client, enrichies pour
 * l'affichage direct (libellé + statut actif par bénéficiaire) -- réutilise
 * `loadBeneficiaryLabels`/`loadBeneficiaryActiveStatus`
 * (lib/cart/beneficiary-labels.ts), aucune requête de résolution dupliquée.
 */
export async function listSavedSplitsForUser(
  userId: string,
  repo: SavedSplitsRepo,
  supabase: SupabaseClient,
): Promise<SavedSplitWithItems[]> {
  const savedSplits = await repo.listByUser(userId);
  if (savedSplits.length === 0) return [];

  const items = await repo.listItems(savedSplits.map((savedSplit) => savedSplit.id));
  const beneficiaryRefs = items.map((item) => ({
    beneficiaryType: item.beneficiary_type,
    beneficiaryId: item.beneficiary_id,
  }));
  const [labels, activeByKey] = await Promise.all([
    loadBeneficiaryLabels(supabase, beneficiaryRefs),
    loadBeneficiaryActiveStatus(supabase, beneficiaryRefs),
  ]);

  const itemsBySavedSplitId = new Map<string, SavedSplitItemRow[]>();
  for (const item of items) {
    const list = itemsBySavedSplitId.get(item.saved_split_id) ?? [];
    list.push(item);
    itemsBySavedSplitId.set(item.saved_split_id, list);
  }

  return savedSplits.map((savedSplit) => ({
    id: savedSplit.id,
    name: savedSplit.name,
    items: (itemsBySavedSplitId.get(savedSplit.id) ?? []).map((item) => {
      const key = beneficiaryLabelKey(item.beneficiary_type, item.beneficiary_id);
      return {
        beneficiaryType: item.beneficiary_type,
        beneficiaryId: item.beneficiary_id,
        campaignId: item.campaign_id,
        shareBps: item.share_bps,
        label: labels.get(key) ?? 'Bénéficiaire introuvable',
        // Un bénéficiaire absent de la map (supprimé depuis l'enregistrement
        // de la répartition) est traité comme inactif -- voir
        // `loadBeneficiaryActiveStatus`.
        isActive: activeByKey.get(key) ?? false,
      };
    }),
  }));
}

/**
 * Critère d'acceptation (docs/prompts/phase-1-5.md, Tâche 1.5.3) : « une
 * répartition référençant un bénéficiaire désormais inactif est signalée à
 * l'application ». Fonction PURE -- ne lève jamais, ne touche pas au
 * panier : c'est à l'appelant (page/composant) de décider quoi afficher
 * (avertissement non bloquant, le client corrige lui-même avant
 * d'enregistrer -- jamais un blocage silencieux).
 */
export function findInactiveItems(savedSplit: SavedSplitWithItems): SavedSplitWithItems['items'] {
  return savedSplit.items.filter((item) => !item.isActive);
}
