/**
 * Reçu imprimable d'une commande (Tâche 1.6.A3, docs/prompts/phase-1-6.md --
 * « Reçus accessibles et téléchargeables »).
 *
 * Voir `components/print-button.tsx` pour la décision « pas de librairie
 * PDF, impression navigateur » -- ce reçu est une page HTML normale, mise en
 * page sobrement pour bien s'imprimer (le bouton ne fait qu'ouvrir la boîte
 * de dialogue d'impression standard du navigateur).
 *
 * Protection d'accès : `getOrderWithDetailsForUser` (lib/orders/
 * list-orders.ts) vérifie que la commande appartient bien à l'utilisateur
 * connecté -- même `NotFoundError` qu'un id inexistant si ce n'est pas le
 * cas (jamais révéler l'existence de la commande d'un tiers), affichée ici
 * comme `notFound()` Next.js (404), pas une erreur 500.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseOrdersRepo, getOrderWithDetailsForUser } from '@/lib/orders/list-orders';
import { loadBeneficiaryLabels, beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';
import { formatCents } from '@/lib/format-cents';
import { NotFoundError } from '@/lib/entities/errors';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrintButton } from '@/components/print-button';

export const metadata = {
  title: 'Reçu de commande',
};

interface RecuPageProps {
  params: { orderId: string };
}

export default async function RecuCommandePage({ params }: RecuPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  let details: Awaited<ReturnType<typeof getOrderWithDetailsForUser>>;
  try {
    details = await getOrderWithDetailsForUser(params.orderId, user.id, createSupabaseOrdersRepo(supabase));
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const { order, items, credits } = details;
  const labels = await loadBeneficiaryLabels(
    supabase,
    credits.map((credit) => ({ beneficiaryType: credit.beneficiary_type, beneficiaryId: credit.beneficiary_id })),
  );

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Reçu -- commande {order.order_number}</h1>
        <PrintButton variant="outline">Imprimer / Enregistrer en PDF</PrintButton>
      </div>

      <Card>
        <section className="stack stack--sm">
          <p>
            Commande passée le {new Date(order.created_at).toLocaleDateString('fr-CA')}
            {order.paid_at ? ` -- payée le ${new Date(order.paid_at).toLocaleDateString('fr-CA')}` : ''}.
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Quantité</th>
                  <th>Prix unitaire</th>
                  <th>Sous-total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCents(item.unit_price_cents)}</td>
                    <td>{formatCents(item.line_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Sous-total : {formatCents(order.subtotal_cents)}
            <br />
            TPS + TVQ : {formatCents(order.tax_cents)}
            <br />
            Livraison : {formatCents(order.shipping_cents)}
            <br />
            <strong>Total payé : {formatCents(order.total_cents)}</strong>
          </p>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Impact de cette commande</h2>
          {credits.length === 0 ? (
            <p>Cette commande ne soutient aucun bénéficiaire en particulier.</p>
          ) : (
            <ul>
              {credits.map((credit) => (
                <li key={credit.id}>
                  {formatCents(credit.amount_cents)} pour{' '}
                  {labels.get(beneficiaryLabelKey(credit.beneficiary_type, credit.beneficiary_id)) ??
                    'ce bénéficiaire'}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <div>
        <Button href="/compte" variant="outline">
          Retour à mon compte
        </Button>
      </div>
    </main>
  );
}
