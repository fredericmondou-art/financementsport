/**
 * Rapport financier d'une campagne (Tâche 1.5.9, docs/prompts/phase-1-5.md,
 * section 36) : ventes brutes, taxes (TPS/TVQ), ventes nettes, coût
 * produits, frais de paiement, livraison, crédit total, profit estimé.
 *
 * Même pattern d'authentification/RLS que `distribution/page.tsx` (Tâche
 * 1.5.4) : `getCurrentUser()` + redirection si non connecté, requête
 * RLS-scoped + `notFound()` si absente/non autorisée -- ici, aucune
 * nouvelle policy n'a été nécessaire pour `orders`/`order_credits`/
 * `payouts` (déjà couverts par les migrations 0005/0014/0016), seule la
 * nouvelle table `campaign_reports` (migration 0018) a sa propre policy.
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseCampaignReportRepo, loadCampaignReport } from '@/lib/reports/campaign';
import { formatCents } from '@/lib/format-cents';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Rapport de campagne',
};

interface RapportPageProps {
  params: { campaignId: string };
}

export default async function RapportPage({ params }: RapportPageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const supabase = createSupabaseServerClient();
  const report = await loadCampaignReport(params.campaignId, createSupabaseCampaignReportRepo(supabase), {
    generatedBy: user.id,
  });
  if (!report) {
    notFound();
  }

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Rapport de campagne -- {report.campaignName}</h1>
        <p className="muted">
          {report.frozen
            ? `Rapport figé (campagne clôturée) -- généré le ${new Date(report.generatedAt).toLocaleString('fr-CA')}. Les chiffres ne bougeront plus.`
            : `Rapport en direct (campagne active) -- recalculé à chaque visite, au ${new Date(report.generatedAt).toLocaleString('fr-CA')}.`}
        </p>
        <div className="form__actions hide-print">
          <Button href={`/api/campagnes/${report.campaignId}/rapport/csv`} variant="outline">
            Exporter en CSV
          </Button>
          <Button href={`/api/campagnes/${report.campaignId}/rapport/pdf`} variant="primary">
            Exporter en PDF
          </Button>
        </div>
      </div>

      <Card>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <td>Commandes payées</td>
                <td>{report.orderCount}</td>
              </tr>
              <tr>
                <td>Ventes brutes</td>
                <td>{formatCents(report.grossSalesCents)}</td>
              </tr>
              <tr>
                <td>Taxes (total)</td>
                <td>{formatCents(report.taxTotalCents)}</td>
              </tr>
              <tr>
                <td className="muted">&nbsp;&nbsp;dont TPS</td>
                <td>{formatCents(report.tpsCents)}</td>
              </tr>
              <tr>
                <td className="muted">&nbsp;&nbsp;dont TVQ</td>
                <td>{formatCents(report.tvqCents)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Ventes nettes</strong>
                </td>
                <td>
                  <strong>{formatCents(report.netSalesCents)}</strong>
                </td>
              </tr>
              <tr>
                <td>Coût produits</td>
                <td>
                  {report.productCostCents === null ? (
                    <span className="muted">{report.productCostReason ?? 'Non disponible'}</span>
                  ) : (
                    formatCents(report.productCostCents)
                  )}
                </td>
              </tr>
              <tr>
                <td>Frais de paiement</td>
                <td>{formatCents(report.paymentFeesCents)}</td>
              </tr>
              <tr>
                <td>Livraison</td>
                <td>{formatCents(report.shippingCents)}</td>
              </tr>
              <tr>
                <td>Crédit total (bénéficiaires)</td>
                <td>{formatCents(report.creditTotalCents)}</td>
              </tr>
              <tr>
                <td>
                  <strong>{report.profitEstimateExcludesCost ? 'Profit estimé (hors coût produits)' : 'Profit estimé'}</strong>
                </td>
                <td>
                  <strong>{formatCents(report.profitEstimateCents)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="hide-print">
        <Button href={`/campagnes/${report.campaignId}/demarrage`} variant="outline">
          Retour à l&apos;écran de démarrage
        </Button>
      </div>
    </main>
  );
}
