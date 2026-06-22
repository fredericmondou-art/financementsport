/**
 * Page panier (Tâche 1.4) : Server Component, appelle directement
 * `lib/cart/*.ts` (pas de round-trip HTTP interne), même pattern que
 * app/(shop)/boutique/page.tsx (CLAUDE.md section 6).
 *
 * Le contexte de campagne ("un seul contexte de campagne par panier",
 * décision de la Tâche 1.3) est dérivé du premier `campaign_id` non nul
 * trouvé sur les lignes `cart_beneficiaries` -- pas d'un paramètre d'URL --
 * puisque c'est la donnée que le panier porte réellement une fois la
 * répartition enregistrée.
 *
 * Habillage Tâche 1.4.4 : Card/table/Button du système de design,
 * présentation uniquement — le rôle `role="alert"` du message d'erreur est
 * conservé via le composant `Alert` (variante "error" → role="alert").
 *
 * État vide (Tâche 1.4.5) : "Votre panier est vide." passé dans
 * `Alert variant="info"` pour plus de clarté visuelle — texte inchangé (le
 * test unitaire `checkout-prepare-checkout.test.ts` qui référence cette
 * même phrase teste un message d'exception de logique métier, sans lien
 * avec cette page — voir docs/DECISIONS.md).
 */
import { formatCents } from '@/lib/format-cents';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import BeneficiarySplit from '@/components/beneficiary-split';
import { loadBeneficiaryLabels, beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';
import { listCartBeneficiaries, createSupabaseCartBeneficiariesRepo } from '@/lib/cart/beneficiaries';
import { createCartDataClient, createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { loadCartCreditContext } from '@/lib/cart/credit-context';
import { estimateCartCredit, formatCreditMessage } from '@/lib/cart/estimate-credit';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseCartItemsRepo, listCartItems } from '@/lib/cart/items';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { addItemAction, checkoutAction, removeItemAction, updateQuantityAction } from './actions';

interface PanierPageProps {
  searchParams: { erreur?: string };
}

export default async function PanierPage({ searchParams }: PanierPageProps): Promise<JSX.Element> {
  const identity = await resolveCartIdentity();
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();

  const cartClient = createCartDataClient();
  const cart = await getOrCreateCart(identity, createSupabaseCartRepo(cartClient));
  const [items, beneficiaries] = await Promise.all([
    listCartItems(cart, identity, createSupabaseCartItemsRepo(cartClient)),
    listCartBeneficiaries(cart, identity, createSupabaseCartBeneficiariesRepo(cartClient)),
  ]);

  const campaignId = beneficiaries.find((b) => b.campaign_id !== null)?.campaign_id ?? null;
  const creditContext = await loadCartCreditContext(
    supabase,
    items.map((item) => item.product_id),
    campaignId,
  );
  const creditEstimate = estimateCartCredit({
    items,
    productCreditInfoById: creditContext.productCreditInfoById,
    beneficiaries,
    campaignId,
    isCampaignActive: creditContext.isCampaignActive,
    rules: creditContext.rules,
  });

  const labels = await loadBeneficiaryLabels(
    supabase,
    beneficiaries.map((b) => ({ beneficiaryType: b.beneficiary_type, beneficiaryId: b.beneficiary_id })),
  );

  const subtotalCents = items.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Mon panier</h1>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}

      {!user ? (
        <p>
          Vous naviguez comme invité. <a href="/login">Connectez-vous</a> pour retrouver ce panier sur un
          autre appareil.
        </p>
      ) : null}

      {items.length === 0 ? (
        <Alert variant="info">Votre panier est vide.</Alert>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix unitaire</th>
                <th>Quantité</th>
                <th>Sous-total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.product_id}</td>
                  <td>{formatCents(item.unit_price_cents)}</td>
                  <td>
                    <form action={updateQuantityAction}>
                      <input type="hidden" name="cartId" value={cart.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="number" name="quantity" defaultValue={item.quantity} min={1} />
                      <Button type="submit" variant="outline" size="sm">
                        Mettre à jour
                      </Button>
                    </form>
                  </td>
                  <td>{formatCents(item.unit_price_cents * item.quantity)}</td>
                  <td>
                    <form action={removeItemAction}>
                      <input type="hidden" name="cartId" value={cart.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Retirer
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p>Sous-total : {formatCents(subtotalCents)}</p>

      {items.length > 0 ? (
        <Card>
          <section className="stack stack--sm">
            <h2>Impact de votre achat</h2>
            {creditEstimate.beneficiaryCredits.length === 0 ? (
              <p>Choisissez un ou plusieurs bénéficiaires ci-dessous pour voir l&apos;impact de votre achat.</p>
            ) : (
              <ul>
                {creditEstimate.beneficiaryCredits.map((b) => (
                  <li key={`${b.beneficiaryType}:${b.beneficiaryId}`}>
                    {formatCreditMessage(
                      b.amountCents,
                      labels.get(beneficiaryLabelKey(b.beneficiaryType, b.beneficiaryId)) ?? 'ce bénéficiaire',
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      ) : null}

      <section className="stack stack--sm">
        <h2>Répartition entre bénéficiaires</h2>
        <BeneficiarySplit
          cartId={cart.id}
          rows={beneficiaries.map((b) => ({
            beneficiaryType: b.beneficiary_type,
            beneficiaryId: b.beneficiary_id,
            label: labels.get(beneficiaryLabelKey(b.beneficiary_type, b.beneficiary_id)) ?? '—',
            shareBps: b.share_bps,
          }))}
        />
      </section>

      {items.length > 0 ? (
        <Card>
          <section className="stack stack--sm">
            <h2>Paiement</h2>
            <p>Total à payer : {formatCents(subtotalCents)} (taxes calculées à l&apos;étape suivante).</p>
            <form action={checkoutAction}>
              <Button type="submit">Procéder au paiement</Button>
            </form>
          </section>
        </Card>
      ) : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Ajouter un produit</h2>
          <form action={addItemAction} className="form">
            <Field label="Identifiant du produit">
              <input type="text" name="productId" required />
            </Field>
            <Field label="Quantité">
              <input type="number" name="quantity" defaultValue={1} min={1} />
            </Field>
            <Button type="submit">Ajouter au panier</Button>
          </form>
        </section>
      </Card>
    </main>
  );
}
