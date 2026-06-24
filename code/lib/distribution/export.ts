/**
 * Branche `lib/distribution/build-list.ts` (les données) sur les
 * utilitaires génériques `lib/export/csv.ts`/`lib/export/pdf.ts` (le
 * rendu) -- Tâche 1.5.4.
 *
 * `flattenDistributionGroups` est l'UNIQUE point de transformation des
 * groupes en lignes de tableau : le CSV et le PDF appellent tous les deux
 * cette même fonction, donc consomment structurellement les mêmes données
 * (critère d'acceptation "Export PDF et CSV produisent les mêmes
 * données") -- ce n'est pas une coïncidence à vérifier au runtime, c'est
 * garanti par le partage du code (voir tests/integration/
 * distribution-export.test.ts pour la vérification malgré tout).
 */
import { formatCents } from '@/lib/format-cents';
import { buildCsv } from '@/lib/export/csv';
import { buildTablePdf, type PdfTableSpec } from '@/lib/export/pdf';
import type { DistributionGroup } from './build-list';

export const DISTRIBUTION_EXPORT_HEADERS = [
  'Bénéficiaire',
  'Client',
  'N° commande',
  'Statut',
  'Produit',
  'Quantité',
  'Prix unitaire',
  'Total ligne',
];

/** Fonction PURE : un groupe de bénéficiaire devient N lignes (une par
 * produit de chaque commande). Une commande sans aucune ligne de produit
 * (état défensif) produit tout de même UNE ligne, pour qu'elle reste
 * visible dans l'export plutôt que de disparaître silencieusement. */
export function flattenDistributionGroups(groups: DistributionGroup[]): string[][] {
  const rows: string[][] = [];
  for (const group of groups) {
    for (const order of group.orders) {
      if (order.items.length === 0) {
        rows.push([group.beneficiaryLabel, order.buyerDisplayName, order.orderNumber, order.statusLabel, '', '', '', '']);
        continue;
      }
      for (const item of order.items) {
        rows.push([
          group.beneficiaryLabel,
          order.buyerDisplayName,
          order.orderNumber,
          order.statusLabel,
          item.productName,
          String(item.quantity),
          formatCents(item.unitPriceCents),
          formatCents(item.lineTotalCents),
        ]);
      }
    }
  }
  return rows;
}

export function buildDistributionCsv(groups: DistributionGroup[]): string {
  return buildCsv(DISTRIBUTION_EXPORT_HEADERS, flattenDistributionGroups(groups));
}

const PDF_COLUMN_WIDTHS = [80, 90, 70, 75, 100, 40, 50, 60] as const;

/**
 * PDF sectionné par bénéficiaire (plus lisible à l'impression pour le
 * responsable qui distribue physiquement par athlète), mais dont les
 * lignes proviennent du MÊME `flattenDistributionGroups` que le CSV --
 * seul l'agencement visuel diffère, jamais les données.
 */
export async function buildDistributionPdf(groups: DistributionGroup[], campaignName: string): Promise<Buffer> {
  const columns = DISTRIBUTION_EXPORT_HEADERS.map((header, i) => ({ header, width: PDF_COLUMN_WIDTHS[i]! }));

  const sections = groups.map((group) => {
    const rows: string[][] = [];
    for (const order of group.orders) {
      if (order.items.length === 0) {
        rows.push([order.buyerDisplayName, order.orderNumber, order.statusLabel, '', '', '', '']);
        continue;
      }
      for (const item of order.items) {
        rows.push([
          order.buyerDisplayName,
          order.orderNumber,
          order.statusLabel,
          item.productName,
          String(item.quantity),
          formatCents(item.unitPriceCents),
          formatCents(item.lineTotalCents),
        ]);
      }
    }
    return { title: group.beneficiaryLabel, rows };
  });

  // Les sections PDF omettent la colonne "Bénéficiaire" (déjà le titre de
  // section) -- on retire donc la 1re colonne du spec pour cette mise en
  // page sectionnée, tout en gardant les 7 autres alignées avec les lignes
  // ci-dessus.
  const spec: PdfTableSpec = {
    title: 'Liste de distribution',
    subtitle: campaignName,
    columns: columns.slice(1),
    sections,
  };

  return buildTablePdf(spec);
}
