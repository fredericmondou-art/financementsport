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
 */
import { formatCents } from '@/lib/format-cents';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import BeneficiarySplit from '@/components/beneficiary-split';
import { loadBeneficiaryLabels, beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';
import { listCartBeneficiaries, createSupabaseCartBeneficiariesRepo } from '@/lib/cart/beneficiaries';
import { createSupabaseCartRepo, getOrCreateCart } from '@/lib/cart/cart';
import { loadCartCreditContext } from '@/lib/cart/credit-context';
import { estimateCartCredit, formatCreditMessage } from '@/lib/cart/estimate-credit';
import { resolveCartIdentity } from '@/lib/cart/identity';
import { createSupabaseCartItemsRepo, listCartItems } from '@/lib/cart/items';
import { addItemAction, removeItemAction, updateQuantityAction } from './actions';

interface PanierPageProps {
  searchParams: { erreur?: string };
}

export default async function PanierPage({ searchParams }: PanierPageProps): Promise<JSX.Element> {
  const identity = await resolveCartIdentity();
  const supabase = createSupabaseServerClient();
  const user = await getCurrentUser();

  const cart = await getOrCreateCart(identity, createSupabaseCartRepo(supabase));
  const [items, beneficiaries] = await Promise.all([
    listCartItems(cart, identity, createSupabaseCartItemsRepo(supabase)),
    listCartBeneficiaries(cart, identity, createSupabaseCartBeneficiariesRepo(supabase)),
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
    <main>
      <h1>Mon panier</h1>

      {searchParams.erreur ? <p role="alert">{searchParams.erreur}</p> : null}

      {!user ? (
        <p>
          Vous naviguez comme invité. <a href="/login">Connectez-vous</a> pour retrouver ce panier sur un
          autre appareil.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p>Votre panier est vide.</p>
      ) : (
        <table>
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
                    <button type="submit">Mettre à jour</button>
                  </form>
                </td>
                <td>{formatCents(item.unit_price_cents * item.quantity)}</td>
                <td>
                  <form action={removeItemAction}>
                    <input type="hidden" name="cartId" value={cart.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit">Retirer</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>Sous-total : {formatCents(subtotalCents)}</p>

      {items.length > 0 ? (
        <section>
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
      ) : null}

      <section>
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

      <section>
        <h2>Ajouter un produit</h2>
        <form action={addItemAction}>
          <label htmlFor="productId">Identifiant du produit</label>
          <input id="productId" type="text" name="productId" required />
          <label htmlFor="quantity">Quantité</label>
          <input id="quantity" type="number" name="quantity" defaultValue={1} min={1} />
          <button type="submit">Ajouter au panier</button>
        </form>
      </section>
    </main>
  );
}
