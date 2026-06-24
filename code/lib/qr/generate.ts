/**
 * Tâche 1.5.1 — génération de l'IMAGE d'un code QR (PNG pour usage écran,
 * PDF format lettre pour impression) à partir d'une URL cible déjà résolue.
 *
 * Volontairement séparé de `lib/qr/resolve-target.ts` (qui décide OÙ pointe
 * le QR) : ces fonctions ne savent rien des `qr_codes`/campagnes, elles
 * transforment juste une chaîne URL en image — réutilisable pour n'importe
 * quelle cible (athlète/équipe/club/campagne/produit) et par
 * `lib/posters/generate.ts` (Tâche 1.5.2, qui intègre ce même QR dans une
 * affiche).
 *
 * `qrcode` (génération PNG, pure JS) + `pdf-lib` (assemblage PDF, pure JS,
 * aucune dépendance native) — choisis pour fonctionner sans modification
 * dans l'environnement serverless Vercel (CLAUDE.md section 3), contrairement
 * à des alternatives basées sur `canvas`/Puppeteer.
 */
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Taille du PNG généré (carré, pixels) — assez grand pour rester scannable
 * une fois imprimé sur une affiche format lettre (Tâche 1.5.2). */
const PNG_SIZE_PX = 600;

/** Génère le PNG scannable du code QR pointant vers `url`. */
export async function generateQrPngBuffer(url: string): Promise<Buffer> {
  if (!url) {
    throw new Error('generateQrPngBuffer: une URL non vide est requise.');
  }
  return QRCode.toBuffer(url, {
    type: 'png',
    width: PNG_SIZE_PX,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

/** Format lettre US, en points PDF (72 pt/po) — 8.5 x 11 po. */
const LETTER_WIDTH_PT = 612;
const LETTER_HEIGHT_PT = 792;

export interface QrPdfOptions {
  /** Titre affiché au-dessus du code QR (ex. nom de l'athlète/équipe/club). */
  title?: string;
  /** URL affichée en texte sous le code QR, pour un accès manuel si le scan
   * échoue. */
  url: string;
}

/**
 * Génère un PDF une page, format lettre, avec le QR centré, prêt à imprimer
 * et afficher (vestiaire, panneau d'équipe, etc.).
 */
export async function generateQrPdfBuffer(options: QrPdfOptions): Promise<Buffer> {
  const pngBuffer = await generateQrPngBuffer(options.url);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([LETTER_WIDTH_PT, LETTER_HEIGHT_PT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pngImage = await pdfDoc.embedPng(pngBuffer);

  const qrDisplaySize = 320;
  const qrX = (LETTER_WIDTH_PT - qrDisplaySize) / 2;
  let cursorY = LETTER_HEIGHT_PT - 140;

  if (options.title) {
    const titleSize = 24;
    const titleWidth = boldFont.widthOfTextAtSize(options.title, titleSize);
    page.drawText(options.title, {
      x: (LETTER_WIDTH_PT - titleWidth) / 2,
      y: cursorY,
      size: titleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    cursorY -= 50;
  }

  page.drawImage(pngImage, {
    x: qrX,
    y: cursorY - qrDisplaySize,
    width: qrDisplaySize,
    height: qrDisplaySize,
  });
  cursorY -= qrDisplaySize + 30;

  const instructionText = 'Scannez ce code pour encourager et contribuer.';
  const instructionSize = 14;
  const instructionWidth = font.widthOfTextAtSize(instructionText, instructionSize);
  page.drawText(instructionText, {
    x: (LETTER_WIDTH_PT - instructionWidth) / 2,
    y: cursorY,
    size: instructionSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= 24;

  const urlSize = 11;
  const urlWidth = font.widthOfTextAtSize(options.url, urlSize);
  page.drawText(options.url, {
    x: (LETTER_WIDTH_PT - urlWidth) / 2,
    y: cursorY,
    size: urlSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
