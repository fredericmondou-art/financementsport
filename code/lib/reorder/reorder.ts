/**
 * Rachat en un clic (Tâche 1.6.A3, docs/prompts/phase-1-6.md) : reconstruit
 * un panier à partir d'une commande passée -- mêmes produits, même
 * bénéficiaire -- modifiable avant paiement.
 *
 * Décision autonome (voir docs/DECISIONS.md, Tâche 1.6.A3) : le rachat NE
 * fait JAMAIS confiance aux prix/au statut figés sur l'ancienne commande
 * (`order_items.unit_price_cents`, `product_name`) -- exactement comme
 * `lib/cart/items.ts` (« le prix unitaire n'est jamais fourni par le client »).
 * Chaque produit est revalidé contre le catalogue ACTUEL (prix, actif, stock)
 * avant d'être ajouté au panier ; un produit retiré du catalogue ou en
 * rupture de stock est écarté (ou sa quantité réduite) plutôt que de bloquer
 * tout le rachat -- gestion du cas limite "stock épuisé"/"mauvais produit"
 * (CLAUDE.md section 7).
 *
 * Le rachat AJOUTE au panier courant plutôt que de l'écraser (même
 * comportement que `addItemToCart`, qui additionne les quantités d'un
 * produit déjà présent) : un panier déjà entamé par le parent n'est jamais
 * vidé silencieusement. La répartition entre bénéficiaires de l'ancienne
 * commande, elle, REMPLACE la répartition courante du panier sans condition
 * (contrairement à la pré-sélection "Encourager" de `app/(shop)/panier/
 * actions.ts`, qui ne s'applique que si le panier n'a encore aucune
 * répartition) : le parent est venu ICI spécifiquement pour reproduire ce
 * don précis, donc cette répartition doit gagner.
 */
import type { BeneficiaryType } from '@/lib/db/types';
import { addItemToCart, type CartItemsRepo, type CartProductSnapshot } from '@/lib/cart/items';
import { setCartBeneficiarySplit, type CartBeneficiariesRepo } from '@/lib/cart/beneficiaries';
import { getOrCreateCart, type CartRepo, type CartRow } from '@/lib/cart/cart';
import type { CartIdentity } from '@/lib/cart/types';
import { BusinessRuleError } from '@/lib/entities/errors';

export interface ReorderSourceItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface ReorderBeneficiaryCredit {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  amountCents: number;
}

export interface ReorderPlanLine {
  productId: string;
  quantity: number;
}

export interface ReorderUnavailableLine {
  productName: string;
  reason: string;
}

export interface ReorderPlan {
  linesToAdd: ReorderPlanLine[];
  unavailable: ReorderUnavailableLine[];
}

/** Mêmes champs que `CartProductSnapshot` (lib/cart/items.ts) : instantané du
 * produit ACTUEL chargé par l'appelant via `lib/catalog/products.ts`. */
export type CurrentProductInfo = CartProductSnapshot;

/**
 * Calcule quelles lignes de l'ancienne commande peuvent être réajoutées au
 * panier, en fonction de l'état ACTUEL du catalogue. Fonction PURE, testée
 * indépendamment de tout repo.
 */
export function buildReorderPlan(
  sourceItems: ReorderSourceItem[],
  currentProductsById: Map<string, CurrentProductInfo>,
): ReorderPlan {
  const linesToAdd: ReorderPlanLine[] = [];
  const unavailable: ReorderUnavailableLine[] = [];

  for (const item of sourceItems) {
    const current = currentProductsById.get(item.productId);
    if (!current || !current.isActive) {
      unavailable.push({
        productName: item.productName,
        reason: "Ce produit n'est plus disponible au catalogue.",
      });
      continue;
    }
    if (current.stockQuantity <= 0) {
      unavailable.push({
        productName: item.productName,
        reason: 'Ce produit est actuellement en rupture de stock.',
      });
      continue;
    }

    const quantity = Math.min(item.quantity, current.stockQuantity);
    linesToAdd.push({ productId: item.productId, quantity });
    if (quantity < item.quantity) {
      unavailable.push({
        productName: item.productName,
        reason: `Quantité réduite à ${quantity} (stock insuffisant pour ${item.quantity}).`,
      });
    }
  }

  return { linesToAdd, unavailable };
}

export interface ReorderBeneficiarySplitLine {
  beneficiaryType: BeneficiaryType;
  beneficiaryId: string;
  shareBps: number;
}

/**
 * Reconstruit une répartition (en points de base, somme = 10000) à partir
 * des MONTANTS de crédit déjà attribués à la commande d'origine -- direction
 * inverse de `splitCreditAmongBeneficiaries` (lib/credits/calculate.ts),
 * même convention d'arrondi : part de chacun arrondie à la baisse, le
 * reliquat de points de base attribué au PREMIER bénéficiaire (CLAUDE.md
 * section 4 : « Gère les centimes restants de l'arrondi en les attribuant au
 * premier bénéficiaire » -- même principe appliqué ici aux points de base).
 * Fonction PURE, testée indépendamment de tout repo.
 *
 * Retourne un tableau vide si la commande n'a aucun crédit (ne devrait pas
 * arriver pour une commande payée, mais défensif) -- l'appelant laisse alors
 * le panier sans répartition plutôt que d'échouer tout le rachat.
 */
export function deriveBeneficiarySplitFromCredits(
  credits: ReorderBeneficiaryCredit[],
): ReorderBeneficiarySplitLine[] {
  const totalCents = credits.reduce((sum, credit) => sum + credit.amountCents, 0);
  if (credits.length === 0 || totalCents <= 0) {
    return [];
  }

  const flooredEntries = credits.map((credit) => ({
    credit,
    flooredBps: Math.floor((credit.amountCents * 10000) / totalCents),
  }));
  const allocatedBps = flooredEntries.reduce((sum, entry) => sum + entry.flooredBps, 0);
  const remainderBps = 10000 - allocatedBps;

  return flooredEntries.map((entry, index) => ({
    beneficiaryType: entry.credit.beneficiaryType,
    beneficiaryId: entry.credit.beneficiaryId,
    shareBps: entry.flooredBps + (index === 0 ? remainderBps : 0),
  }));
}

export interface ReorderRepos {
  cart: CartRepo;
  items: CartItemsRepo;
  beneficiaries: CartBeneficiariesRepo;
}

export interface ReorderResult {
  cart: CartRow;
  unavailable: ReorderUnavailableLine[];
}

/**
 * Orchestration complète du rachat : panier courant (créé au besoin) +
 * ajout des lignes encore disponibles + répartition reconstruite. Lève
 * `BusinessRuleError` si AUCUNE ligne n'est plus disponible -- un rachat qui
 * n'ajouterait rien au panier ne doit jamais se présenter comme un succès.
 */
export async function reorderOrderToCart(
  identity: CartIdentity,
  source: { items: ReorderSourceItem[]; credits: ReorderBeneficiaryCredit[] },
  currentProductsById: Map<string, CurrentProductInfo>,
  repos: ReorderRepos,
): Promise<ReorderResult> {
  const plan = buildReorderPlan(source.items, currentProductsById);
  if (plan.linesToAdd.length === 0) {
    throw new BusinessRuleError(
      'Aucun article de cette commande n’est encore disponible — impossible de la racheter.',
    );
  }

  const cart = await getOrCreateCart(identity, repos.cart);

  for (const line of plan.linesToAdd) {
    const product = currentProductsById.get(line.productId);
    if (!product) {
      continue; // déjà écarté par buildReorderPlan, garde-fou seulement.
    }
    await addItemToCart(cart, identity, product, line.quantity, repos.items);
  }

  const split = deriveBeneficiarySplitFromCredits(source.credits);
  if (split.length > 0) {
    await setCartBeneficiarySplit(cart, identity, split, repos.beneficiaries);
  }

  return { cart, unavailable: plan.unavailable };
}
