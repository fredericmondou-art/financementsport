/**
 * Export des commandes (admin) -- Tâche 1.5.11, docs/prompts/phase-1-5.md.
 *
 * Formulaire GET classique (mêmes `searchParams` que `app/(shop)/boutique/
 * page.tsx`) : filtres combinables (campagne, équipe, statut, période),
 * aperçu des commandes correspondantes, et un lien d'export CSV qui transmet
 * la MÊME chaîne de requête -- garantit que l'export téléchargé contient
 * exactement ce que l'aperçu affiche (critère d'acceptation explicite).
 *
 * Garde de page : `canExportOrders(user.role)` (voir `lib/export/orders.ts`
 * -- même patron que `lib/dashboards/admin.ts#canViewAdminDashboard`). RLS
 * (migrations 0005/0020) autorise déjà `platform_admin`/`accounting` à lire
 * `orders`/`order_items`/`order_credits`/`campaigns`/`teams`, mais ne bloque
 * pas la page elle-même -- d'où cette garde explicite, 404 sinon (même
 * convention que `app/(admin)/versements/page.tsx` : pas de message "accès
 * refusé" qui révélerait l'existence de la page à un rôle non autorisé).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  canExportOrders,
  createSupabaseOrderExportRepo,
  loadOrderExportData,
  ORDER_STATUS_VALUES,
  parseOrderExportFilters,
  type OrderExportSearchParams,
} from '@/lib/export/orders';
import { orderStatusLabelFr } from '@/lib/distribution/build-list';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';

export const metadata = {
  title: 'Export des commandes',
};

const PREVIEW_ROW_LIMIT = 50;

interface CommandesExportPageProps {
  searchParams: OrderExportSearchParams;
}

export default async function CommandesExportPage({ searchParams }: CommandesExportPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!canExportOrders(user.role)) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const repo = createSupabaseOrderExportRepo(supabase);
  const filters = parseOrderExportFilters(searchParams);

  const [{ orders, rows }, campaigns, teams] = await Promise.all([
    loadOrderExportData(filters, repo, supabase),
    repo.listCampaignsForFilters(),
    repo.listTeamsForFilters(),
  ]);

  // Même chaîne de requête transmise au formulaire ET au lien d'export CSV --
  // voir le commentaire de tête de ce fichier.
  const queryString = new URLSearchParams(
    Object.entries(searchParams).filter(([, value]) => typeof value === 'string' && value.length > 0) as Array<
      [string, string]
    >,
  ).toString();

  return (
    <main className="page page--wide stack">
      <div className="page-header">
        <h1>Export des commandes</h1>
        <p>
          Filtrez par campagne, équipe, statut et période, puis exportez en CSV pour la comptabilité ou la logistique.
          L&apos;export téléchargé contient exactement les commandes affichées ci-dessous -- ni plus, ni moins.
        </p>
      </div>

      <Card>
        <form method="get" className="stack stack--sm">
          <div className="form-grid">
            <Field label="Campagne">
              <select name="campaignId" defaultValue={filters.campaignId ?? ''}>
                <option value="">Toutes les campagnes</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Équipe">
              <select name="teamId" defaultValue={filters.teamId ?? ''}>
                <option value="">Toutes les équipes</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select name="status" defaultValue={filters.status ?? ''}>
                <option value="">Tous les statuts</option>
                {ORDER_STATUS_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {orderStatusLabelFr(status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Du">
              <input type="date" name="periodStart" defaultValue={searchParams.periodStart ?? ''} />
            </Field>
            <Field label="Au">
              <input type="date" name="periodEnd" defaultValue={searchParams.periodEnd ?? ''} />
            </Field>
          </div>
          <div className="form__actions">
            <Button type="submit" variant="primary">
              Filtrer
            </Button>
            <Button href={`/api/commandes/export/csv${queryString ? `?${queryString}` : ''}`} variant="outline">
              Exporter en CSV ({orders.length})
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {orders.length === 0 ? (
          <Alert variant="info">Aucune commande ne correspond à ces filtres. Essayez d&apos;élargir la période ou de retirer un filtre.</Alert>
        ) : (
          <>
            <p className="muted">
              {orders.length} commande{orders.length > 1 ? 's' : ''} correspondante{orders.length > 1 ? 's' : ''}
              {rows.length > PREVIEW_ROW_LIMIT ? ` -- aperçu limité aux ${PREVIEW_ROW_LIMIT} premières, l'export CSV les contient toutes` : ''}.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>N° commande</th>
                    <th>Créée</th>
                    <th>Campagne</th>
                    <th>Équipe</th>
                    <th>Statut</th>
                    <th>Total</th>
                    <th>Crédit total</th>
                    <th>Bénéficiaires</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROW_LIMIT).map((row, index) => (
                    <tr key={orders[index]!.id}>
                      <td>{row[0]}</td>
                      <td>{row[1]}</td>
                      <td>{row[3]}</td>
                      <td>{row[4]}</td>
                      <td>{row[5]}</td>
                      <td>{row[11]}</td>
                      <td>{row[12]}</td>
                      <td>{row[13]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>
                      <strong>Total ({orders.length} commande{orders.length > 1 ? 's' : ''})</strong>
                    </td>
                    <td>
                      <strong>{formatCents(orders.reduce((sum, order) => sum + order.total_cents, 0))}</strong>
                    </td>
                    <td>
                      <strong>{formatCents(orders.reduce((sum, order) => sum + order.credit_total_cents, 0))}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
