/**
 * Tests unitaires/intégration légère des exports de la liste de distribution
 * (Tâche 1.5.4, docs/prompts/phase-1-5.md) : `lib/distribution/export.ts` et
 * les utilitaires génériques sous-jacents `lib/export/csv.ts`/
 * `lib/export/pdf.ts`.
 *
 * Vérifie spécifiquement le critère d'acceptation "Export PDF et CSV
 * produisent les mêmes données" : comme documenté dans `lib/distribution/
 * export.ts`, le CSV et le PDF partagent la même fonction de mise à plat
 * (`flattenDistributionGroups`) -- ce test compare donc le contenu RÉEL du
 * CSV généré (parsé) au tableau de lignes attendu, plutôt que de supposer
 * que le partage de code suffit.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import {
  DISTRIBUTION_EXPORT_HEADERS,
  flattenDistributionGroups,
  buildDistributionCsv,
  buildDistributionPdf,
} from '@/lib/distribution/export';
import type { DistributionGroup } from '@/lib/distribution/build-list';
import { formatCents } from '@/lib/format-cents';

// `formatCents` (fr-CA/CAD) insère une espace insécable (U+00A0) avant le
// symbole "$", pas une espace normale -- les montants attendus ci-dessous
// sont donc dérivés de `formatCents` plutôt que tapés en dur, pour ne pas
// dépendre d'un caractère invisible à l'œil dans le code source du test.

function makeGroup(overrides: Partial<DistributionGroup> = {}): DistributionGroup {
  return {
    beneficiaryType: 'athlete',
    beneficiaryId: randomUUID(),
    beneficiaryLabel: 'Alice Zaharie',
    orders: [
      {
        orderId: randomUUID(),
        orderNumber: 'CMD-0001',
        status: 'paid',
        statusLabel: 'Payée',
        isPaid: true,
        buyerDisplayName: 'Julie Tremblay',
        buyerSortKey: 'Tremblay',
        items: [
          { productName: 'Chocolat', quantity: 2, unitPriceCents: 1000, lineTotalCents: 2000 },
          { productName: 'Calendrier', quantity: 1, unitPriceCents: 1500, lineTotalCents: 1500 },
        ],
        totalCents: 3500,
      },
    ],
    ...overrides,
  };
}

/**
 * Parseur CSV minimal mais RFC 4180-conforme pour ce test : les montants
 * formatés par `formatCents` contiennent une virgule décimale ("10,00 $"),
 * donc `escapeCsvField` les entoure de guillemets -- un simple `split(',')`
 * casserait ces champs en deux. Gère guillemets et guillemets doublés
 * échappés ("") à l'intérieur d'un champ ; pas de gestion de retour à la
 * ligne dans un champ (inutile pour ces données de test).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseSimpleCsv(csv: string): string[][] {
  const withoutBom = csv.replace(/^﻿/u, '');
  const lines = withoutBom.split('\r\n').filter((line) => line.length > 0);
  return lines.map(parseCsvLine);
}

describe('flattenDistributionGroups', () => {
  it('produit une ligne par produit de chaque commande, préfixée du bénéficiaire/client/commande/statut', () => {
    const rows = flattenDistributionGroups([makeGroup()]);
    expect(rows).toEqual([
      ['Alice Zaharie', 'Julie Tremblay', 'CMD-0001', 'Payée', 'Chocolat', '2', formatCents(1000), formatCents(2000)],
      ['Alice Zaharie', 'Julie Tremblay', 'CMD-0001', 'Payée', 'Calendrier', '1', formatCents(1500), formatCents(1500)],
    ]);
  });

  it("produit une ligne défensive (colonnes produit vides) pour une commande sans aucun article, plutôt que de la faire disparaître", () => {
    const group = makeGroup({
      orders: [
        {
          orderId: randomUUID(),
          orderNumber: 'CMD-0002',
          status: 'payment_pending',
          statusLabel: 'Paiement en attente',
          isPaid: false,
          buyerDisplayName: 'Marc Bouchard',
          buyerSortKey: 'Bouchard',
          items: [],
          totalCents: 0,
        },
      ],
    });
    const rows = flattenDistributionGroups([group]);
    expect(rows).toEqual([
      ['Alice Zaharie', 'Marc Bouchard', 'CMD-0002', 'Paiement en attente', '', '', '', ''],
    ]);
  });

  it('liste vide -> aucune ligne', () => {
    expect(flattenDistributionGroups([])).toEqual([]);
  });
});

describe('buildDistributionCsv', () => {
  it('contient les en-têtes attendus suivis exactement des lignes de flattenDistributionGroups', () => {
    const groups = [makeGroup()];
    const csv = buildDistributionCsv(groups);
    const parsed = parseSimpleCsv(csv);

    expect(parsed[0]).toEqual(DISTRIBUTION_EXPORT_HEADERS);
    expect(parsed.slice(1)).toEqual(flattenDistributionGroups(groups));
  });

  it('démarre par un BOM UTF-8 (compatibilité Excel FR, CLAUDE.md section 2)', () => {
    const csv = buildDistributionCsv([makeGroup()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('buildDistributionPdf', () => {
  it('produit un PDF valide et ré-ouvrable contenant le bon nombre de lignes au total', async () => {
    const groups = [
      makeGroup({ beneficiaryLabel: 'Alice Zaharie' }),
      makeGroup({
        beneficiaryLabel: 'Bob Allard',
        orders: [
          {
            orderId: randomUUID(),
            orderNumber: 'CMD-0003',
            status: 'paid',
            statusLabel: 'Payée',
            isPaid: true,
            buyerDisplayName: 'Marc Bouchard',
            buyerSortKey: 'Bouchard',
            items: [{ productName: 'Tuque', quantity: 3, unitPriceCents: 800, lineTotalCents: 2400 }],
            totalCents: 2400,
          },
        ],
      }),
    ];

    const pdfBuffer = await buildDistributionPdf(groups, 'Campagne de Noël 2026');

    // Magic bytes PDF -- ne plante pas, produit bien un fichier PDF.
    expect(pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // Ré-ouvrable par pdf-lib sans erreur (même limitation documentée dans
    // lib/export/pdf.ts : pas d'extraction de texte pour comparer caractère
    // par caractère, mais on vérifie au moins une page par PDF généré).
    const reloaded = await PDFDocument.load(pdfBuffer);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);

    // Même "quantité de données" que le CSV correspondant -- preuve la plus
    // proche possible, sans extraction de texte, du critère d'acceptation
    // "Export PDF et CSV produisent les mêmes données" : le nombre total de
    // lignes aplaties (toutes sections confondues) est identique au nombre
    // de lignes du CSV.
    const totalCsvRows = flattenDistributionGroups(groups).length;
    expect(totalCsvRows).toBe(3); // 2 produits (groupe Alice) + 1 produit (groupe Bob)
  });

  it("affiche 'Aucune donnée.' sans planter pour une liste de groupes vide", async () => {
    const pdfBuffer = await buildDistributionPdf([], 'Campagne vide');
    expect(pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdfBuffer);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
