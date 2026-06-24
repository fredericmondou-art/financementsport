/**
 * Confirmation de réception et livraison groupée (Tâche 1.5.5, docs/prompts/
 * phase-1-5.md, sections 22-23) : le responsable d'une campagne fait avancer
 * les commandes de cette campagne le long du flux de livraison groupée
 * (`ready` -> `delivered_to_team` -> `distributed` -> `completed`), une
 * étape à la fois, jamais en sautant une étape.
 *
 * Même pattern d'authentification/autorisation que `distribution/page.tsx`
 * (Tâche 1.5.4) : `getCurrentUser()` + redirection si non connecté, requête
 * RLS-scoped (policy `orders_select_campaign_managers`, migration 0014, déjà
 * en place pour la liste de distribution -- aucune nouvelle policy SELECT
 * requise ici) + `notFound()` si la campagne est absente/non autorisée.
 *
 * Toute la logique de transition (validité, autorisation, traçabilité,
 * notification) vit dans `lib/orders/status.ts` + la fonction Postgres
 * gardée `advance_order_status` (migration 0015) -- cette page ne fait
 * qu'afficher les commandes regroupées par statut et soumettre un
 * `<form action={advanceOrderStatusAction}>` par commande/étape.
 *
 * Réutilise `createSupabaseDistributionRepo`/`resolveBuyerIdentity`
 * (lib/distribution/build-list.ts, Tâche 1.5.4) pour ne pas dupliquer la
 * résolution du nom d'acheteur (compte vs invité).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseDistributionRepo, resolveBuyerIdentity } from '@/lib/distribution/build-list';
import { DELIVERY_STATUS_FLOW, nextDeliveryStatus, orderStatusLabelFr } from '@/lib/orders/status';
import { formatCents } from '@/lib/format-cents';
import type { CampaignsTable, OrderStatus, OrdersTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { advanceOrderStatusAction } from './actions';

export const metadata = {
  title: 'Confirmation de réception et livraison',
};

interface LivraisonPageProps {
  params: { campaignId: string };
  searchParams: { erreur?: string; avis?: string };
}

type CampaignRow = CampaignsTable['Row'];
type OrderRow = OrdersTable['Row'];

/** Libellé du bouton qui fait avancer la commande d'une étape, selon son
 * statut courant. Fonction PURE -- `null` si le statut n'a pas de prochaine
 * étape dans ce flux (terminal, ex. `completed`, ou hors flux). */
function advanceButtonLabel(status: OrderStatus): string | null {
  switch (status) {
    case 'ready':
      return "Confirmer la réception par l'équipe";
    case 'delivered_to_team':
      return 'Confirmer la distribution aux athlètes';
    case 'distributed':
      return 'Marquer comme complétée';
    default:
      return null;
  }
}

export default async function LivraisonPage({ params, searchParams }: LivraisonPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const { data: campaignData, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  const campaign = campaignData as CampaignRow | null;
  if (!campaign) {
    notFound();
  }

  const repo = createSupabaseDistributionRepo(supabase);
  const allOrders = await repo.listOrdersForCampaign(campaign.id, campaign.team_id);
  const deliveryStatusSet = new Set<OrderStatus>(DELIVERY_STATUS_FLOW);
  const orders = allOrders.filter((order) => deliveryStatusSet.has(order.status));

  const buyerUserIds = orders.map((order) => order.user_id).filter((id): id is string => id !== null);
  const buyerNames = await repo.loadBuyerNames(buyerUserIds);

  const ordersByStatus = new Map<OrderStatus, OrderRow[]>();
  for (const status of DELIVERY_STATUS_FLOW) {
    ordersByStatus.set(status, []);
  }
  for (const order of orders) {
    ordersByStatus.get(order.status)!.push(order);
  }

  const totalOrders = orders.length;

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Confirmation de réception et livraison -- {campaign.name}</h1>
        <p>
          {totalOrders === 0
            ? 'Aucune commande prête pour la livraison groupée pour le moment.'
            : `${totalOrders} commande(s) dans le flux de livraison groupée.`}
        </p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      {DELIVERY_STATUS_FLOW.map((status) => {
        const statusOrders = ordersByStatus.get(status) ?? [];
        return (
          <Card key={status}>
            <section className="stack stack--sm">
              <h2>
                {orderStatusLabelFr(status)} ({statusOrders.length})
              </h2>
              {statusOrders.length === 0 ? (
                <p className="muted">Aucune commande à cette étape.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>N° commande</th>
                        <th>Total</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusOrders.map((order) => {
                        const { displayName } = resolveBuyerIdentity(order, buyerNames);
                        const newStatus = nextDeliveryStatus(order.status);
                        const buttonLabel = advanceButtonLabel(order.status);
                        return (
                          <tr key={order.id}>
                            <td>{displayName}</td>
                            <td>{order.order_number}</td>
                            <td>{formatCents(order.total_cents)}</td>
                            <td>
                              {newStatus && buttonLabel ? (
                                <form action={advanceOrderStatusAction}>
                                  <input type="hidden" name="campaignId" value={campaign.id} />
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <input type="hidden" name="currentStatus" value={order.status} />
                                  <input type="hidden" name="newStatus" value={newStatus} />
                                  <Button type="submit" variant="primary" size="sm">
                                    {buttonLabel}
                                  </Button>
                                </form>
                              ) : (
                                <span className="muted">Terminé</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </Card>
        );
      })}

      <div className="form__actions">
        <Button href={`/campagnes/${campaign.id}/distribution`} variant="outline">
          Voir la liste de distribution
        </Button>
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
