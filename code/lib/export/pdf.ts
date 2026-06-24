/**
 * Export PDF tabulaire générique (Tâche 1.5.4, docs/prompts/phase-1-5.md),
 * pensé pour être réutilisé tel quel par la Tâche 1.5.11 ("Réutilise
 * `lib/export/*` (tâche 1.5.4)") -- aucune connaissance du domaine ici,
 * seulement un titre, des colonnes, et des sections de lignes déjà sous
 * forme de chaînes (même contrat que `lib/export/csv.ts#buildCsv`, pour que
 * les deux exports consomment toujours les MÊMES données préparées par
 * l'appelant -- voir `lib/distribution/export.ts`).
 *
 * Seule librairie PDF disponible dans ce projet : `pdf-lib` (CLAUDE.md
 * section 3 ; choisie à la Tâche 1.5.1 pour la compatibilité serverless
 * Vercel, voir docs/DECISIONS.md). Conventions reprises de
 * `lib/posters/generate.ts`/`lib/qr/generate.ts` (page lettre 612x792 pt,
 * `StandardFonts.Helvetica`).
 *
 * Pas une fonction pure au sens strict (manipulation de buffers), mais sans
 * aucune dépendance réseau/DB -- couverte par des tests qui vérifient "ne
 * plante pas, produit un PDF valide, et contient le même nombre de lignes
 * que les données fournies", pas par des assertions de rendu pixel par
 * pixel (même limitation documentée que les Tâches 1.5.1/1.5.2 : pas de
 * librairie d'extraction de texte PDF disponible pour comparer le rendu
 * caractère par caractère).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface PdfTableColumn {
  header: string;
  /** Largeur en points PDF (72 pt/po). */
  width: number;
}

export interface PdfTableSection {
  /** Titre de section (ex. nom du bénéficiaire), affiché au-dessus de ses
   * lignes. `null` pour une table sans sous-titres de section. */
  title: string | null;
  rows: string[][];
}

export interface PdfTableSpec {
  title: string;
  subtitle?: string;
  columns: PdfTableColumn[];
  sections: PdfTableSection[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const ROW_HEIGHT = 16;
const HEADER_ROW_HEIGHT = 18;
const SECTION_TITLE_HEIGHT = 20;

/** Tronque `text` à `maxWidth` pour `font`/`fontSize` donnés, en ajoutant
 * "…" si nécessaire -- une seule ligne par cellule (pas de retour à la
 * ligne automatique dans une cellule de tableau, contrairement à
 * `lib/posters/generate.ts#wrapText` qui gère un bloc de texte libre). */
function truncateToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
    return text;
  }
  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, fontSize) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/**
 * Génère un PDF tabulaire paginé : titre, sous-titre optionnel, puis chaque
 * section (titre de section + en-têtes de colonnes répétés + lignes),
 * paginant automatiquement quand le contenu dépasse la hauteur de page,
 * avec ré-affichage des en-têtes de colonnes sur chaque nouvelle page.
 */
export async function buildTablePdf(spec: PdfTableSpec): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const fontSize = 9;
  const titleSize = 16;
  const subtitleSize = 10;
  const sectionTitleSize = 11;

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  function newPage(): void {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(needed: number): void {
    if (cursorY - needed < MARGIN) {
      newPage();
    }
  }

  function drawColumnRow(values: string[], y: number, useFont: PDFFont, size: number): void {
    let x = MARGIN;
    for (let i = 0; i < spec.columns.length; i++) {
      const column = spec.columns[i]!;
      const value = values[i] ?? '';
      page.drawText(truncateToWidth(value, useFont, size, column.width - 4), {
        x,
        y,
        size,
        font: useFont,
        color: rgb(0, 0, 0),
      });
      x += column.width;
    }
  }

  page.drawText(spec.title, { x: MARGIN, y: cursorY - titleSize, size: titleSize, font: boldFont });
  cursorY -= titleSize + 8;

  if (spec.subtitle) {
    page.drawText(spec.subtitle, {
      x: MARGIN,
      y: cursorY - subtitleSize,
      size: subtitleSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    cursorY -= subtitleSize + 14;
  } else {
    cursorY -= 6;
  }

  function drawColumnHeaders(): void {
    ensureSpace(HEADER_ROW_HEIGHT);
    drawColumnRow(spec.columns.map((c) => c.header), cursorY - fontSize, boldFont, fontSize);
    cursorY -= HEADER_ROW_HEIGHT;
    page.drawLine({
      start: { x: MARGIN, y: cursorY + 4 },
      end: { x: MARGIN + contentWidth, y: cursorY + 4 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  let totalRowsWritten = 0;

  for (const section of spec.sections) {
    if (section.title) {
      ensureSpace(SECTION_TITLE_HEIGHT + HEADER_ROW_HEIGHT);
      page.drawText(section.title, {
        x: MARGIN,
        y: cursorY - sectionTitleSize,
        size: sectionTitleSize,
        font: boldFont,
      });
      cursorY -= SECTION_TITLE_HEIGHT;
    }
    drawColumnHeaders();

    for (const row of section.rows) {
      ensureSpace(ROW_HEIGHT);
      drawColumnRow(row, cursorY - fontSize, font, fontSize);
      cursorY -= ROW_HEIGHT;
      totalRowsWritten += 1;
    }
    cursorY -= 8;
  }

  if (totalRowsWritten === 0) {
    page.drawText('Aucune donnée.', { x: MARGIN, y: cursorY - fontSize, size: fontSize, font });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
