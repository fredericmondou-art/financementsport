/**
 * Répartition entre bénéficiaires d'un panier (Tâche 1.4).
 *
 * Règle explicite du cahier : "La répartition doit totaliser 100 %
 * (SUM(share_bps)=10000) avant checkout ; bloquer sinon." — `assertSplit
 * Totals10000` est une fonction PURE, testée indépendamment, appelée à la
 * fois ici (dès qu'on enregistre une répartition) et devra l'être de nouveau
 * juste avant le paiement à la Tâche 1.5 (défense en profondeur : la
 * répartition stockée pourrait théoriquement devenir invalide entre deux
 * requêtes concurrentes).
 *
 * `campaignId` par bénéficiaire existe dans le schéma (`cart_beneficiaries.
 * campaign_id`) mais N'EST PAS utilisé par le moteur de crédit (Tâche 1.3) :
 * une commande a UNE seule campagne de contexte, partagée par tous ses
 * bénéficiaires (voir docs/DECISIONS.md, Tâche 1.3). Le champ est conservé
 * ici tel quel (au cas où un bénéficiaire est rattaché à une campagne
 * spécifique pour l'affichage/l'historique), mais `estimate-credit.ts`
 * n'en tient pas compte pour le calcul.
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType, CartBeneficiariesTable } from '@/lib/db/types';
import { BusinessRuleError } from '@/lib/entities/errors';
import { assertCartOwnership, type CartRow } from './cart';
import type { CartIdentity } from './types';

export type CartBeneficiaryRow = CartBeneficiariesTable['Row'];

export const beneficiarySplitInputSchema = z
  .array(
    z.object({
      beneficiaryType: z.enum(['athlete', 'team', 'club']),
      beneficiaryId: z.string().uuid(),
      campaignId: z.string().uuid().nullable().optional(),
      shareBps: z
        .number()
        .int('La part doit être un nombre entier de points de base.')
        .min(1, 'La part doit être positive.')
        .max(10000),
    }),
  )
  .min(1, 'Au moins un bénéficiaire est requis.');
export type BeneficiarySplitInput = z.infer<typeof beneficiarySplitInputSchema>;

/** Accès aux données `cart_beneficiaries`, injecté (voir `CartRepo`). */
export interface CartBeneficiariesRepo {
  listBeneficiaries(cartId: string): Promise<CartBeneficiaryRow[]>;
  /** Remplace l'intégralité de la répartition d'un panier (le panier est un
   * brouillon pré-paiement : pas d'historique à conserver ligne par ligne,
   * contrairement à `order_credits` après paiement). */
  replaceBeneficiaries(
    cartId: string,
    rows: Array<{
      beneficiaryType: BeneficiaryType;
      beneficiaryId: string;
      campaignId: string | null;
      shareBps: number;
    }>,
  ): Promise<CartBeneficiaryRow[]>;
}

export function createSupabaseCartBeneficiariesRepo(supabase: SupabaseClient): CartBeneficiariesRepo {
  return {
    async listBeneficiaries(cartId) {
      const { data, error } = await supabase
        .from('cart_beneficiaries')
        .select('*')
        .eq('cart_id', cartId);
      if (error) throw error;
      return (data as CartBeneficiaryRow[]) ?? [];
    },
    async replaceBeneficiaries(cartId, rows) {
      const { error: deleteError } = await supabase
        .from('cart_beneficiaries')
        .delete()
        .eq('cart_id', cartId);
      if (deleteError) throw deleteError;

      if (rows.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('cart_beneficiaries')
        .insert(
          rows.map((row) => ({
            cart_id: cartId,
            beneficiary_type: row.beneficiaryType,
            beneficiary_id: row.beneficiaryId,
            campaign_id: row.campaignId,
            share_bps: row.shareBps,
          })),
        )
        .select();
      if (error) throw error;
      return (data as CartBeneficiaryRow[]) ?? [];
    },
  };
}

/**
 * Valide que la répartition totalise 100 % (`SUM(share_bps) = 10000`).
 * Fonction PURE, sans I/O — testée indépendamment de tout repo.
 */
export function assertSplitTotals10000(split: BeneficiarySplitInput): void {
  const totalBps = split.reduce((sum, beneficiary) => sum + beneficiary.shareBps, 0);
  if (totalBps !== 10000) {
    throw new BusinessRuleError(
      `La répartition entre bénéficiaires doit totaliser 100 % (10000 points de base) ; total actuel : ${totalBps}.`,
    );
  }
}

/**
 * Répartit `totalBps` points de base également entre `count` parts. Chaque
 * part est arrondie à la baisse, le reliquat va à la PREMIÈRE part — même
 * convention d'arrondi déterministe que `splitCreditAmongBeneficiaries`
 * (lib/credits/calculate.ts) et `deriveBeneficiarySplitFromCredits` (lib/
 * reorder/reorder.ts), appliquée ici aux points de base plutôt qu'aux
 * centimes. Fonction PURE, sans I/O.
 *
 * Ajoutée pour la Tâche 1.6.A4 (« répartition égale proposée AUTOMATIQUEMENT
 * dès qu'on ajoute plusieurs enfants », docs/prompts/phase-1-6.md) :
 * `components/beneficiary-split.tsx` l'utilise pour (a) égaliser toutes les
 * parts quand le nombre de bénéficiaires change, et (b) redistribuer le
 * reliquat entre les AUTRES bénéficiaires quand l'utilisateur ajuste une part
 * manuellement (le total reste ainsi toujours forcé à 10000 sans jamais
 * dupliquer `assertSplitTotals10000`, qui continue de valider le résultat
 * final côté serveur).
 */
export function splitBpsEqually(totalBps: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(totalBps / count);
  const allocatedBps = base * count;
  const remainderBps = totalBps - allocatedBps;
  return Array.from({ length: count }, (_, index) => base + (index === 0 ? remainderBps : 0));
}

/** Cas particulier de `splitBpsEqually` pour une répartition à 100 % --
 * raccourci le plus utilisé (égaliser N bénéficiaires sur le total). */
export function equalSplitBps(count: number): number[] {
  return splitBpsEqually(10000, count);
}

export async function setCartBeneficiarySplit(
  cart: CartRow,
  identity: CartIdentity,
  rawSplit: unknown,
  repo: CartBeneficiariesRepo,
): Promise<CartBeneficiaryRow[]> {
  assertCartOwnership(cart, identity);
  const split = beneficiarySplitInputSchema.parse(rawSplit);
  assertSplitTotals10000(split);

  return repo.replaceBeneficiaries(
    cart.id,
    split.map((beneficiary) => ({
      beneficiaryType: beneficiary.beneficiaryType,
      beneficiaryId: beneficiary.beneficiaryId,
      campaignId: beneficiary.campaignId ?? null,
      shareBps: beneficiary.shareBps,
    })),
  );
}

export async function listCartBeneficiaries(
  cart: CartRow,
  identity: CartIdentity,
  repo: CartBeneficiariesRepo,
): Promise<CartBeneficiaryRow[]> {
  assertCartOwnership(cart, identity);
  return repo.listBeneficiaries(cart.id);
}
