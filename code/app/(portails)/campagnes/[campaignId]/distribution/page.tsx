/**
 * Liste de distribution d'une campagne (Tâche 1.5.4, docs/prompts/
 * phase-1-5.md) : commandes regroupées par athlète puis par client, avec
 * statut de paiement -- pour que le responsable sache quoi remettre à qui.
 *
 * Même pattern d'authentification que `affiches/page.tsx`/`qr/page.tsx`
 * (Tâches 1.5.1/1.5.2, CLAUDE.md section 9) : `getCurrentUser()` +
 * redirection si non connecté, requête RLS-scoped + `notFound()` si
 * absente/non autorisée -- ici, la policy `orders_select_campaign_managers`
 * (migration 0014) qui comble l'écart découvert en construisant cette
 * tâche (voir docs/DECISIONS.md).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { buildDistributionList, createSupabaseDistributionRepo } from '@/lib/distribution/build-list';
import { formatCents } from '@/lib/format-cents';
import type { CampaignsTable } from '@/lib/db/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Liste de distribution',
};

interface DistributionPageProps {
  params: { campaignId: string };
}

type CampaignRow = CampaignsTable['Row'];

export default async function DistributionPage({ params }: DistributionPageProps): Promise<JSX.Element> {
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

  const { list, groups } = await buildDistributionList(
    campaign.id,
    campaign.team_id,
    createSupabaseDistributionRepo(supabase),
    supabase,
  );

  const totalOrders = groups.reduce((sum, group) => sum + group.orders.length, 0);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Liste de distribution -- {campaign.name}</h1>
        <p>
          {totalOrders === 0
            ? 'Aucune commande pour cette campagne pour le moment.'
            : `${totalOrders} commande(s) réparties sur ${groups.length} groupe(s).`}
        </p>
        <div className="form__actions hide-print">
          <Button href={`/api/campagnes/${campaign.id}/distribution/csv`} variant="outline">
            Exporter en CSV
          </Button>
          <Button href={`/api/campagnes/${campaign.id}/distribution/pdf`} variant="primary">
            Exporter en PDF
          </Button>
        </div>
        <p className="muted">
          Statut de la liste : <strong>{list.status}</strong> (générée le{' '}
          {new Date(list.generated_at).toLocaleString('fr-CA')}).
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <p>Rien à distribuer pour l&apos;instant.</p>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={`${group.beneficiaryType ?? 'unassigned'}:${group.beneficiaryId ?? 'na'}`}>
            <section className="stack stack--sm">
              <h2>{group.beneficiaryLabel}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>N° commande</th>
                      <th>Statut</th>
                      <th>Produits</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.orders.map((order) => (
                      <tr key={order.orderId}>
                        <td>{order.buyerDisplayName}</td>
                        <td>{order.orderNumber}</td>
                        <td>{order.isPaid ? order.statusLabel : <strong>{order.statusLabel}</strong>}</td>
                        <td>
                          <ul>
                            {order.items.map((item, index) => (
                              <li key={index}>
                                {item.quantity} x {item.productName}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>{formatCents(order.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>
        ))
      )}

      <div className="hide-print">
        <Button href={`/campagnes/${campaign.id}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
