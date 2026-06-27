import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { logoutAction } from '../../(auth)/login/actions';
import {
  createSupabaseOrdersRepo,
  listOrdersWithDetailsForUser,
  summarizeImpactByBeneficiary,
} from '@/lib/orders/list-orders';
import { loadBeneficiaryLabels, beneficiaryLabelKey } from '@/lib/cart/beneficiary-labels';
import { createSupabaseMyAthletesRepo } from '@/lib/athletes/profile';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { reorderAction } from './actions';

/**
 * Page protégée pour la Tâche 0.3 (sert aussi de cible au test e2e signup →
 * login → page protégée -- `data-testid="user-role"` reste sur le même
 * paragraphe, texte inchangé, voir tests/e2e/auth.spec.ts).
 *
 * Enrichie à la Tâche 1.6.A3 (docs/prompts/phase-1-6.md) : espace parent
 * minimal -- historique des commandes, impact généré par bénéficiaire
 * (agrégé sur toutes les commandes), lien vers le reçu de chacune, et bouton
 * « Racheter » qui reconstruit le panier à l'identique (voir
 * `lib/reorder/reorder.ts` et `./actions.ts`).
 */
interface ComptePageProps {
  searchParams: { erreur?: string };
}

export default async function ComptePage({ searchParams }: ComptePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const orders = await listOrdersWithDetailsForUser(user.id, createSupabaseOrdersRepo(supabase));
  const impact = summarizeImpactByBeneficiary(orders);

  const allCredits = orders.flatMap((detail) => detail.credits);
  const labels = await loadBeneficiaryLabels(
    supabase,
    allCredits.map((credit) => ({ beneficiaryType: credit.beneficiary_type, beneficiaryId: credit.beneficiary_id })),
  );
  // Tâche 1.6.C1 : lien « Mes athlètes » affiché seulement si l'utilisateur
  // est effectivement tuteur/athlète majeur d'au moins un profil -- pour ne
  // pas encombrer l'espace compte d'un client qui n'a jamais ce rôle.
  const myAthletes = await createSupabaseMyAthletesRepo(supabase).listAthletesManagedByUser(user.id);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Mon compte</h1>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}

      <Card>
        <div className="stack stack--sm">
          <p data-testid="user-role">
            Rôle : <Badge variant="info">{user.role}</Badge>
          </p>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Se déconnecter
            </Button>
          </form>
        </div>
      </Card>

      {myAthletes.length > 0 ? (
        <Card>
          <section className="stack stack--sm">
            <h2>Mes athlètes</h2>
            <p>Complétez le profil public de vos athlètes : message, photo, confidentialité.</p>
            <div className="form__actions">
              <Button href="/compte/athletes" variant="outline">
                Gérer mes athlètes
              </Button>
            </div>
          </section>
        </Card>
      ) : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Impact généré</h2>
          {impact.length === 0 ? (
            <EmptyState title="Aucun achat encore associé à un bénéficiaire." actionHref="/boutique" actionLabel="Découvrir la boutique">
              Choisissez un produit et un athlète à encourager pour voir l&apos;impact apparaître ici.
            </EmptyState>
          ) : (
            <ul>
              {impact.map((line) => (
                <li key={`${line.beneficiaryType}:${line.beneficiaryId}`}>
                  Tu as généré {formatCents(line.totalAmountCents)} pour{' '}
                  {labels.get(beneficiaryLabelKey(line.beneficiaryType, line.beneficiaryId)) ?? 'ce bénéficiaire'}.
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Mes commandes</h2>
          {orders.length === 0 ? (
            <EmptyState title="Vous n'avez encore aucune commande." actionHref="/boutique" actionLabel="Faire un premier achat">
              Vos commandes et leurs reçus apparaîtront ici.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Commande</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Bénéficiaire(s)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map(({ order, credits }) => (
                    <tr key={order.id}>
                      <td>{order.order_number}</td>
                      <td>{new Date(order.created_at).toLocaleDateString('fr-CA')}</td>
                      <td>{formatCents(order.total_cents)}</td>
                      <td>
                        {credits.length === 0
                          ? '—'
                          : credits
                              .map(
                                (credit) =>
                                  labels.get(beneficiaryLabelKey(credit.beneficiary_type, credit.beneficiary_id)) ??
                                  'ce bénéficiaire',
                              )
                              .join(', ')}
                      </td>
                      <td>
                        <div className="stack stack--sm">
                          <Button href={`/compte/commandes/${order.id}/recu`} variant="outline" size="sm">
                            Voir le reçu
                          </Button>
                          <form action={reorderAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Racheter
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>
    </main>
  );
}
