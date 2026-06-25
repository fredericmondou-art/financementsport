/**
 * Branche `lib/reports/campaign.ts` (les données) sur les utilitaires
 * génériques `lib/export/csv.ts`/`lib/export/pdf.ts` (le rendu) -- Tâche
 * 1.5.9, qui réutilise explicitement `lib/export/*` (Tâche 1.5.4).
 *
 * Même garantie que `lib/distribution/export.ts` : `flattenCampaignReport`
 * est l'UNIQUE point de transformation du rapport en lignes de tableau ; le
 * CSV et le PDF appellent tous les deux cette même fonction, donc
 * consomment structurellement les mêmes données (critère d'acceptation
 * "Export PDF et CSV cohérents") -- garanti par construction, pas par une
 * vérification au runtime.
 */
import { formatCents } from '@/lib/format-cents';
import { buildCsv } from '@/lib/export/csv';
import { buildTablePdf, type PdfTableSpec } from '@/lib/export/pdf';
import type { CampaignReport } from './campaign';

export const CAMPAIGN_REPORT_EXPORT_HEADERS = ['Ligne', 'Montant'];

function formatNullableCents(cents: number | null): string {
  return cents === null ? 'Non disponible' : formatCents(cents);
}

/** Fonction PURE : un rapport devient une liste de lignes (libellé, montant
 * formaté en CAD). L'ordre suit la structure du cahier (Tâche 1.5.9) :
 * ventes brutes, taxes (ventilées), ventes nettes, coût produits, frais de
 * paiement, livraison, crédit, profit estimé. */
export function flattenCampaignReport(report: CampaignReport): string[][] {
  return [
    ['Commandes payées', String(report.orderCount)],
    ['Ventes brutes', formatCents(report.grossSalesCents)],
    ['Taxes (total)', formatCents(report.taxTotalCents)],
    ['  dont TPS', formatCents(report.tpsCents)],
    ['  dont TVQ', formatCents(report.tvqCents)],
    ['Ventes nettes', formatCents(report.netSalesCents)],
    ['Coût produits', formatNullableCents(report.productCostCents)],
    ['Frais de paiement', formatCents(report.paymentFeesCents)],
    ['Livraison', formatCents(report.shippingCents)],
    ['Crédit total (bénéficiaires)', formatCents(report.creditTotalCents)],
    [
      report.profitEstimateExcludesCost ? 'Profit estimé (hors coût produits)' : 'Profit estimé',
      formatCents(report.profitEstimateCents),
    ],
  ];
}

export function buildCampaignReportCsv(report: CampaignReport): string {
  return buildCsv(CAMPAIGN_REPORT_EXPORT_HEADERS, flattenCampaignReport(report));
}

const PDF_COLUMN_WIDTHS = [380, 112] as const;

export async function buildCampaignReportPdf(report: CampaignReport): Promise<Buffer> {
  const columns = CAMPAIGN_REPORT_EXPORT_HEADERS.map((header, i) => ({ header, width: PDF_COLUMN_WIDTHS[i]! }));
  const subtitleParts = [
    report.campaignName,
    report.frozen ? `Rapport figé (généré le ${new Date(report.generatedAt).toLocaleDateString('fr-CA')})` : 'Rapport en direct (campagne active)',
  ];

  const spec: PdfTableSpec = {
    title: 'Rapport de campagne',
    subtitle: subtitleParts.join(' — '),
    columns,
    sections: [{ title: null, rows: flattenCampaignReport(report) }],
  };

  return buildTablePdf(spec);
}
