/**
 * Formulaire produit partagé par les pages création (`nouveau/page.tsx`) et
 * modification (`[productId]/page.tsx`) -- mêmes champs dans les deux cas,
 * seules les valeurs par défaut et l'action diffèrent. Server Component pur
 * (aucun `'use client'`), formulaire natif + Server Action comme le reste du
 * projet (voir `app/(portails)/campagnes/nouvelle/page.tsx`).
 *
 * Prix et crédit fixe saisis directement EN CENTIMES (pas en dollars) --
 * même décision que `app/(admin)/versements/[campaignId]/actions.ts` (voir
 * son en-tête) : aucun utilitaire de conversion dollars→centimes fiable
 * n'existe dans le projet, et CLAUDE.md section 4 interdit le float pour de
 * l'argent -- plus sûr de demander l'entier directement à l'admin.
 */
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ProductKind, ProductsTable } from '@/lib/db/types';

export interface ProductFormDefaults {
  name: string;
  kind: ProductKind;
  description: string;
  imageUrl: string;
  priceCents: number;
  fixedCreditCents: number | null;
  isTaxable: boolean;
  stockQuantity: number;
  leadTimeDays: number | null;
  isActive: boolean;
}

export const NEW_PRODUCT_DEFAULTS: ProductFormDefaults = {
  name: '',
  kind: 'product',
  description: '',
  imageUrl: '',
  priceCents: 0,
  fixedCreditCents: null,
  isTaxable: true,
  stockQuantity: 0,
  leadTimeDays: null,
  isActive: true,
};

export function defaultsFromRow(row: ProductsTable['Row']): ProductFormDefaults {
  return {
    name: row.name,
    kind: row.kind,
    description: row.description ?? '',
    imageUrl: row.image_url ?? '',
    priceCents: row.price_cents,
    fixedCreditCents: row.fixed_credit_cents,
    isTaxable: row.is_taxable,
    stockQuantity: row.stock_quantity,
    leadTimeDays: row.lead_time_days,
    isActive: row.is_active,
  };
}

interface ProductFormProps {
  action: (formData: FormData) => void | Promise<void>;
  defaults: ProductFormDefaults;
  submitLabel: string;
  errorMessage?: string;
  /** Présent uniquement pour le formulaire de modification -- ajoute un
   * champ caché `productId` lu par `[productId]/actions.ts`. */
  productId?: string;
}

export function ProductForm({ action, defaults, submitLabel, errorMessage, productId }: ProductFormProps): JSX.Element {
  return (
    <form action={action} className="form form--wide stack">
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}

      <Field label="Nom" required>
        <input type="text" name="name" defaultValue={defaults.name} required maxLength={200} />
      </Field>

      <Field label="Type">
        <select name="kind" defaultValue={defaults.kind}>
          <option value="product">Produit</option>
          <option value="pack">Pack</option>
          <option value="subscription">Abonnement</option>
        </select>
      </Field>

      <Field label="Description" hint="Visible sur la fiche produit en boutique.">
        <textarea name="description" defaultValue={defaults.description} maxLength={2000} rows={4} />
      </Field>

      <Field label="URL de l'image" hint="Laisser vide pour aucune image.">
        <input type="url" name="imageUrl" defaultValue={defaults.imageUrl} />
      </Field>

      <Field label="Prix (en centimes)" required hint="Ex. : 3500 pour 35,00 $ CAD, taxes en sus si applicable.">
        <input type="number" name="priceCents" defaultValue={defaults.priceCents} min={0} step={1} required />
      </Field>

      <Field
        label="Crédit fixe (en centimes, optionnel)"
        hint="Montant fixe attribué au bénéficiaire à l'achat -- laisser vide si géré par une règle de campagne."
      >
        <input
          type="number"
          name="fixedCreditCents"
          defaultValue={defaults.fixedCreditCents ?? ''}
          min={0}
          step={1}
        />
      </Field>

      <Field label="Quantité en stock">
        <input type="number" name="stockQuantity" defaultValue={defaults.stockQuantity} min={0} step={1} />
      </Field>

      <Field label="Délai de livraison (jours, optionnel)">
        <input type="number" name="leadTimeDays" defaultValue={defaults.leadTimeDays ?? ''} min={0} step={1} />
      </Field>

      <div className="checkbox-list">
        <div className="checkbox-row">
          <input type="checkbox" id="isTaxable" name="isTaxable" defaultChecked={defaults.isTaxable} />
          <label htmlFor="isTaxable">Soumis aux taxes (TPS/TVQ)</label>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="isActive" name="isActive" defaultChecked={defaults.isActive} />
          <label htmlFor="isActive">Actif (visible en boutique)</label>
        </div>
      </div>

      <Button type="submit" variant="primary">
        {submitLabel}
      </Button>
    </form>
  );
}
