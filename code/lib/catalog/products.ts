/**
 * Catalogue : produits et packs (Tâche 1.2).
 *
 * Même séparation que `lib/entities/*.ts` (Tâche 1.1) : logique métier PURE
 * et testable (validation zod, permissions, tri/filtres) séparée de l'I/O
 * via l'interface `ProductRepo` injectée — voir CLAUDE.md section 6.
 *
 * Écriture (création/mise à jour) réservée à `platform_admin`, exactement
 * comme la policy RLS `products_admin_all` (migration 0003) : `can()` (déjà
 * écrite à la Tâche 0.3, étendue à la Tâche 1.1) court-circuite déjà
 * platform_admin à `true` et refuse tout le reste pour `resource.type ===
 * 'product'` — aucune modification de `lib/auth/permissions.ts` n'était
 * donc nécessaire pour cette tâche (voir docs/DECISIONS.md).
 *
 * Lecture publique du catalogue (`listPublicProducts`) NE PASSE PAS par
 * `can()` : comme documenté dans `permissions.ts`, elle s'appuie sur la
 * policy `products_public_read` (`is_active = true`), au même titre que les
 * vues publiques `v_public_*` de la Tâche 0.4. Aucune authentification
 * requise (achat invité, CLAUDE.md section 9).
 */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type AuthUser } from '@/lib/auth/permissions';
import { pickUniqueSlug } from '@/lib/slug';
import type { ProductKind, ProductsTable } from '@/lib/db/types';
import { NotFoundError, PermissionError } from '@/lib/entities/errors';

export const productInputSchema = z.object({
  kind: z.enum(['product', 'pack', 'subscription']).optional(),
  // Catégories non exercées par le seed V1 (voir docs/DECISIONS.md) : le
  // champ existe dès maintenant (FK déjà dans le schéma) mais aucun endpoint
  // de gestion des catégories n'est livré à cette tâche.
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Le nom du produit est requis.').max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().url("L'URL de l'image n'est pas valide.").nullable().optional(),
  // CLAUDE.md section 4 : tout montant est un integer en CENTIMES.
  priceCents: z.number().int('Le prix doit être un nombre entier de centimes.').min(0),
  fixedCreditCents: z
    .number()
    .int('Le crédit fixe doit être un nombre entier de centimes.')
    .min(0)
    .nullable()
    .optional(),
  isTaxable: z.boolean().optional(),
  stockQuantity: z.number().int().min(0).optional(),
  leadTimeDays: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const productUpdateSchema = productInputSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productSortSchema = z
  .enum(['price_asc', 'price_desc', 'credit_desc', 'popularity'])
  .default('price_asc');
export type ProductSort = z.infer<typeof productSortSchema>;

export const listProductsQuerySchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  kind: z.enum(['product', 'pack', 'subscription']).optional(),
  sort: productSortSchema.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export type ProductRow = ProductsTable['Row'];

/** Accès aux données `products`, injecté pour permettre des tests
 * unitaires/d'intégration sans base de données réelle (voir
 * `tests/integration/catalog-products.test.ts`). */
export interface ProductRepo {
  isSlugTaken(slug: string): Promise<boolean>;
  insertProduct(input: {
    kind: ProductKind;
    categoryId: string | null;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    priceCents: number;
    fixedCreditCents: number | null;
    isTaxable: boolean;
    stockQuantity: number;
    leadTimeDays: number | null;
    isActive: boolean;
  }): Promise<ProductRow>;
  getProductById(id: string): Promise<ProductRow | null>;
  updateProduct(id: string, patch: Partial<ProductUpdateInput>): Promise<ProductRow>;
  /** Produits actifs correspondant aux filtres, AVANT tri (le tri est
   * appliqué en mémoire par `sortProducts`, logique pure et testable). */
  listActiveProducts(filter: { categoryId?: string | null; kind?: ProductKind }): Promise<ProductRow[]>;
  /** Unités vendues par produit, calculées à partir des commandes payées
   * (`order_items` via `orders.status = 'paid'`). Tant que la Tâche 1.5
   * (création de commande) n'est pas livrée, aucune commande payée n'existe
   * : la carte est vide et le tri "popularité" se comporte comme un tri
   * stable (voir docs/DECISIONS.md) — c'est le comportement correct, pas un
   * bug, en attendant de vraies ventes. */
  getUnitsSoldByProductId(): Promise<Map<string, number>>;
}

export function createSupabaseProductRepo(supabase: SupabaseClient): ProductRepo {
  return {
    async isSlugTaken(slug) {
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async insertProduct(input) {
      const { data, error } = await supabase
        .from('products')
        .insert({
          kind: input.kind,
          category_id: input.categoryId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          image_url: input.imageUrl,
          price_cents: input.priceCents,
          fixed_credit_cents: input.fixedCreditCents,
          is_taxable: input.isTaxable,
          stock_quantity: input.stockQuantity,
          lead_time_days: input.leadTimeDays,
          is_active: input.isActive,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProductRow;
    },
    async getProductById(id) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as ProductRow) ?? null;
    },
    async updateProduct(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.kind !== undefined) row.kind = patch.kind;
      if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
      if (patch.priceCents !== undefined) row.price_cents = patch.priceCents;
      if (patch.fixedCreditCents !== undefined) row.fixed_credit_cents = patch.fixedCreditCents;
      if (patch.isTaxable !== undefined) row.is_taxable = patch.isTaxable;
      if (patch.stockQuantity !== undefined) row.stock_quantity = patch.stockQuantity;
      if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
      if (patch.isActive !== undefined) row.is_active = patch.isActive;

      const { data, error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductRow;
    },
    async listActiveProducts(filter) {
      let query = supabase.from('products').select('*').eq('is_active', true);
      if (filter.categoryId !== undefined) {
        query = filter.categoryId === null
          ? query.is('category_id', null)
          : query.eq('category_id', filter.categoryId);
      }
      if (filter.kind) {
        query = query.eq('kind', filter.kind);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data as ProductRow[]) ?? [];
    },
    async getUnitsSoldByProductId() {
      const { data, error } = await supabase
        .from('order_items')
        .select('product_id, quantity, orders!inner(status)')
        .eq('orders.status', 'paid');
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of (data as Array<{ product_id: string; quantity: number }>) ?? []) {
        totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + row.quantity);
      }
      return totals;
    },
  };
}

/**
 * Crédit affiché pour le tri "crédit généré" : seul le crédit FIXE
 * (`fixed_credit_cents`, surtout les packs) est connu à ce stade. Le crédit
 * variable (règle `credit_rules`, campagne active, bonus de seuil) n'est
 * calculé qu'au moment de l'achat par le moteur de la Tâche 1.3 — un produit
 * sans crédit fixe est donc traité comme 0$ pour CE tri seulement (il reste
 * normalement affiché avec son crédit indicatif réel une fois 1.3 livré).
 */
function indicativeCreditCents(product: ProductRow): number {
  return product.fixed_credit_cents ?? 0;
}

/**
 * Trie une liste de produits déjà filtrée (logique pure, testable sans
 * base de données — voir `tests/unit/catalog-products.test.ts`).
 */
export function sortProducts(
  products: ProductRow[],
  sort: ProductSort,
  unitsSoldByProductId?: Map<string, number>,
): ProductRow[] {
  const sorted = [...products];
  switch (sort) {
    case 'price_asc':
      sorted.sort((a, b) => a.price_cents - b.price_cents);
      break;
    case 'price_desc':
      sorted.sort((a, b) => b.price_cents - a.price_cents);
      break;
    case 'credit_desc':
      sorted.sort((a, b) => indicativeCreditCents(b) - indicativeCreditCents(a));
      break;
    case 'popularity':
      sorted.sort(
        (a, b) =>
          (unitsSoldByProductId?.get(b.id) ?? 0) - (unitsSoldByProductId?.get(a.id) ?? 0),
      );
      break;
  }
  return sorted;
}

/**
 * Lecture publique du catalogue (boutique). Aucune vérification de
 * permission : tout visiteur, connecté ou non, peut lister les produits
 * actifs (voir l'en-tête de ce fichier).
 */
export async function listPublicProducts(
  rawQuery: unknown,
  repo: ProductRepo,
): Promise<ProductRow[]> {
  const query = listProductsQuerySchema.parse(rawQuery ?? {});
  const sort = query.sort ?? 'price_asc';
  const rows = await repo.listActiveProducts({ categoryId: query.categoryId, kind: query.kind });
  const unitsSold = sort === 'popularity' ? await repo.getUnitsSoldByProductId() : undefined;
  return sortProducts(rows, sort, unitsSold);
}

/**
 * Crée un produit/pack. Réservé à `platform_admin` (policy RLS
 * `products_admin_all`, migration 0003).
 */
export async function createProduct(
  user: AuthUser,
  rawInput: unknown,
  repo: ProductRepo,
): Promise<ProductRow> {
  if (!can(user, 'create', { type: 'product' })) {
    throw new PermissionError("Vous n'avez pas le droit de créer un produit.");
  }

  const input = productInputSchema.parse(rawInput);
  const slug = await pickUniqueSlug(input.name, (candidate) => repo.isSlugTaken(candidate));

  return repo.insertProduct({
    kind: input.kind ?? 'product',
    categoryId: input.categoryId ?? null,
    name: input.name,
    slug,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    priceCents: input.priceCents,
    fixedCreditCents: input.fixedCreditCents ?? null,
    isTaxable: input.isTaxable ?? true,
    stockQuantity: input.stockQuantity ?? 0,
    leadTimeDays: input.leadTimeDays ?? null,
    isActive: input.isActive ?? true,
  });
}

export async function updateProduct(
  user: AuthUser,
  productId: string,
  rawPatch: unknown,
  repo: ProductRepo,
): Promise<ProductRow> {
  const existing = await repo.getProductById(productId);
  if (!existing) {
    throw new NotFoundError('Produit introuvable.');
  }
  if (!can(user, 'update', { type: 'product' })) {
    throw new PermissionError("Vous n'avez pas le droit de modifier ce produit.");
  }

  const patch = productUpdateSchema.parse(rawPatch);
  return repo.updateProduct(productId, patch);
}

/**
 * Lecture d'un produit par id, publique OU admin selon le cas :
 * - produit actif (`is_active = true`) : visible par tout le monde, y
 *   compris un visiteur non authentifié (`user === null`), cohérent avec
 *   `products_public_read` et l'achat invité (CLAUDE.md section 9).
 * - produit inactif : réservé à `platform_admin` (`can()` court-circuite déjà
 *   ce rôle à `true` ; tout le reste, y compris un visiteur, reçoit la même
 *   `NotFoundError` qu'un id inexistant — on ne révèle pas l'existence d'un
 *   produit retiré du catalogue à un non-admin).
 */
export async function getProduct(
  user: AuthUser | null,
  productId: string,
  repo: ProductRepo,
): Promise<ProductRow> {
  const existing = await repo.getProductById(productId);
  if (!existing) {
    throw new NotFoundError('Produit introuvable.');
  }
  if (!existing.is_active && !can(user, 'read', { type: 'product' })) {
    throw new NotFoundError('Produit introuvable.');
  }
  return existing;
}
