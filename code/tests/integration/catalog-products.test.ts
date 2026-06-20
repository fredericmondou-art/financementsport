/**
 * Test d'intégration Tâche 1.2 : création admin, refus non-admin, lecture
 * publique du catalogue, avec un repo en mémoire (même motif que
 * `tests/integration/entities.test.ts`, Tâche 1.1 — réseau Supabase bloqué
 * en sandbox, voir docs/DECISIONS.md Tâche 0.3).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth/permissions';
import {
  createProduct,
  getProduct,
  listPublicProducts,
  updateProduct,
  type ProductRepo,
  type ProductRow,
  type ProductUpdateInput,
} from '@/lib/catalog/products';
import { NotFoundError, PermissionError } from '@/lib/entities/errors';

function createFakeProductRepo(): ProductRepo {
  const products = new Map<string, ProductRow>();
  const unitsSold = new Map<string, number>();
  return {
    async isSlugTaken(slug) {
      return [...products.values()].some((p) => p.slug === slug);
    },
    async insertProduct(input) {
      const id = randomUUID();
      const row: ProductRow = {
        id,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      products.set(id, row);
      return row;
    },
    async getProductById(id) {
      return products.get(id) ?? null;
    },
    async updateProduct(id, patch: Partial<ProductUpdateInput>) {
      const existing = products.get(id);
      if (!existing) throw new Error('produit introuvable (fake repo)');
      const row: Record<string, unknown> = { ...existing };
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
      const updated = row as ProductRow;
      products.set(id, updated);
      return updated;
    },
    async listActiveProducts(filter) {
      return [...products.values()].filter((p) => {
        if (!p.is_active) return false;
        if (filter.categoryId !== undefined && p.category_id !== filter.categoryId) return false;
        if (filter.kind && p.kind !== filter.kind) return false;
        return true;
      });
    },
    async getUnitsSoldByProductId() {
      return unitsSold;
    },
  };
}

const platformAdmin: AuthUser = { id: randomUUID(), role: 'platform_admin', memberships: [] };
const client: AuthUser = { id: randomUUID(), role: 'client', memberships: [] };

describe('Catalogue produits/packs (critères d’acceptation Tâche 1.2)', () => {
  it('platform_admin crée un produit, visible ensuite dans le catalogue public', async () => {
    const repo = createFakeProductRepo();

    const product = await createProduct(
      platformAdmin,
      { name: 'Pack Maison', priceCents: 3500, fixedCreditCents: 500, kind: 'pack' },
      repo,
    );
    expect(product.slug).toBe('pack-maison');
    expect(product.is_active).toBe(true);

    const catalogue = await listPublicProducts({}, repo);
    expect(catalogue.map((p) => p.id)).toContain(product.id);
  });

  it('refuse à un client (non-admin) de créer un produit', async () => {
    const repo = createFakeProductRepo();
    await expect(
      createProduct(client, { name: 'Pack Pirate', priceCents: 1000 }, repo),
    ).rejects.toThrow(PermissionError);
  });

  it('refuse à un client de modifier un produit existant', async () => {
    const repo = createFakeProductRepo();
    const product = await createProduct(platformAdmin, { name: 'Pack Famille', priceCents: 6000 }, repo);

    await expect(
      updateProduct(client, product.id, { priceCents: 1 }, repo),
    ).rejects.toThrow(PermissionError);
  });

  it('deux packs nommés "Pack Saison" produisent deux slugs distincts', async () => {
    const repo = createFakeProductRepo();
    const first = await createProduct(platformAdmin, { name: 'Pack Saison', priceCents: 12000 }, repo);
    const second = await createProduct(platformAdmin, { name: 'Pack Saison', priceCents: 12000 }, repo);

    expect(first.slug).toBe('pack-saison');
    expect(second.slug).toBe('pack-saison-2');
    expect(first.slug).not.toBe(second.slug);
  });

  it('le catalogue public n’affiche que les 4 packs actifs du seed (exemple), pas un pack désactivé', async () => {
    const repo = createFakeProductRepo();
    const maison = await createProduct(platformAdmin, { name: 'Pack Maison', priceCents: 3500 }, repo);
    await createProduct(platformAdmin, { name: 'Pack Famille', priceCents: 6000 }, repo);
    const saison = await createProduct(platformAdmin, { name: 'Pack Saison', priceCents: 12000 }, repo);
    const sportPropre = await createProduct(platformAdmin, { name: 'Pack Sport Propre', priceCents: 4500 }, repo);
    await updateProduct(platformAdmin, sportPropre.id, { isActive: false }, repo);

    const catalogue = await listPublicProducts({}, repo);
    const ids = catalogue.map((p) => p.id);
    expect(ids).toContain(maison.id);
    expect(ids).toContain(saison.id);
    expect(ids).not.toContain(sportPropre.id);
    expect(catalogue).toHaveLength(3);
  });

  it('filtre par kind', async () => {
    const repo = createFakeProductRepo();
    const pack = await createProduct(platformAdmin, { name: 'Pack', priceCents: 1000, kind: 'pack' }, repo);
    await createProduct(platformAdmin, { name: 'Cocarde', priceCents: 500, kind: 'product' }, repo);

    const onlyPacks = await listPublicProducts({ kind: 'pack' }, repo);
    expect(onlyPacks.map((p) => p.id)).toEqual([pack.id]);
  });

  it('getProduct : un produit inactif n’est pas révélé à un visiteur non authentifié (NotFoundError, pas PermissionError)', async () => {
    const repo = createFakeProductRepo();
    const product = await createProduct(platformAdmin, { name: 'Pack Retiré', priceCents: 1000 }, repo);
    await updateProduct(platformAdmin, product.id, { isActive: false }, repo);

    await expect(getProduct(null, product.id, repo)).rejects.toThrow(NotFoundError);
    await expect(getProduct(client, product.id, repo)).rejects.toThrow(NotFoundError);
  });

  it('getProduct : platform_admin peut lire un produit inactif', async () => {
    const repo = createFakeProductRepo();
    const product = await createProduct(platformAdmin, { name: 'Pack Retiré 2', priceCents: 1000 }, repo);
    await updateProduct(platformAdmin, product.id, { isActive: false }, repo);

    const fetched = await getProduct(platformAdmin, product.id, repo);
    expect(fetched.id).toBe(product.id);
  });

  it('getProduct : un produit actif est visible par un visiteur non authentifié', async () => {
    const repo = createFakeProductRepo();
    const product = await createProduct(platformAdmin, { name: 'Pack Visible', priceCents: 1000 }, repo);

    const fetched = await getProduct(null, product.id, repo);
    expect(fetched.id).toBe(product.id);
  });
});
