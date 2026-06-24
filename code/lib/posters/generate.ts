/**
 * Génération d'affiches imprimables/partageables (Tâche 1.5.2).
 *
 * Même séparation que partout ailleurs dans le projet (CLAUDE.md section 6) :
 * - `buildPosterContent` : logique PURE, testable sans aucune dépendance --
 *   assemble le contenu textuel de l'affiche et applique le SEUL masquage qui
 *   reste à faire ICI (`hide_amounts`). `hide_photo`, `hide_last_name`,
 *   `hide_city` sont déjà appliqués en amont par les vues publiques
 *   `v_public_*` (voir `lib/public/preview.ts`) -- cette fonction ne consomme
 *   qu'une identité déjà sûre, jamais une table brute (CLAUDE.md section 5).
 * - `generatePosterPdfBuffer` : rendu visuel (`pdf-lib`). Pas une fonction
 *   pure au sens strict (manipulation de buffers, embarque une image), mais
 *   sans aucune dépendance réseau/DB -- couverte par des tests qui vérifient
 *   "ne plante pas et produit un PDF valide dans les 3 formats", pas par des
 *   assertions de rendu pixel par pixel (hors de portée raisonnable, même
 *   limitation que `lib/qr/generate.ts` à la Tâche 1.5.1).
 *
 * Seules librairies disponibles dans ce projet : `qrcode` + `pdf-lib`
 * (CLAUDE.md section 3, choisies à la Tâche 1.5.1 pour la compatibilité
 * serverless Vercel). Aucune librairie de composition d'image bitmap
 * (`canvas`, `sharp`, `satori`, `@vercel/og`) n'est présente. Décision
 * autonome (voir docs/DECISIONS.md, Tâche 1.5.2) : les 3 formats demandés
 * par le cahier (lettre / carré 1:1 / story 9:16) sont donc TOUS produits en
 * PDF, avec des dimensions de page différentes -- `pdf-lib` accepte
 * n'importe quelle taille de page, pas seulement le format lettre. Un export
 * PNG/JPEG natif (utile pour publier directement en story Instagram, par
 * ex.) nécessiterait une librairie de rasterisation supplémentaire ; hors
 * scope de cette tâche, signalé comme limite dans le rapport.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { generateQrPngBuffer } from '@/lib/qr/generate';
import { formatCents } from '@/lib/format-cents';

export type PosterFormat = 'lettre' | 'carre' | 'story';

export const POSTER_FORMATS: readonly PosterFormat[] = ['lettre', 'carre', 'story'];

/** Dimensions de page en points PDF (72 pt/po). `lettre` reprend exactement
 * le format de `lib/qr/generate.ts#generateQrPdfBuffer` (8.5 x 11 po). */
const PAGE_SIZES_PT: Record<PosterFormat, { width: number; height: number }> = {
  lettre: { width: 612, height: 792 },
  carre: { width: 600, height: 600 },
  story: { width: 540, height: 960 },
};

export type PosterBeneficiaryKind = 'athlete' | 'team' | 'club';

export interface PosterBeneficiaryInput {
  kind: PosterBeneficiaryKind;
  /** Nom déjà masqué (ex. « Prénom I. » si `hide_last_name`) -- provient de
   * `loadBeneficiaryPreviewIdentity`, jamais d'une colonne brute. */
  name: string;
  /** `null` si aucune photo OU si `hide_photo` -- déjà masqué en amont par
   * `v_public_athlete`/`v_public_team`/`v_public_club`. */
  imageUrl: string | null;
  bodyText: string | null;
  /** Pertinent seulement pour `kind === 'athlete'` (seule table porteuse de
   * ce champ -- voir `lib/public/campaign-progress.ts`). Ignoré pour
   * team/club, qui n'ont pas de notion de montant masquable. */
  hideAmounts?: boolean;
}

export interface PosterCampaignInput {
  name: string;
  goalCents: number | null;
  /** ISO 8601, `null` si la campagne n'a pas d'échéance. */
  endsAt: string | null;
}

export interface PosterPackInput {
  name: string;
  priceCents: number;
  /** Crédit généré par l'achat d'UNE unité de ce pack, déjà calculé pour LE
   * contexte de cette campagne (voir `lib/credits/calculate.ts`) -- pas
   * recalculé ici, cette fonction ne fait qu'afficher un montant fourni. */
  creditCents: number;
}

export interface PosterContent {
  beneficiaryName: string;
  beneficiaryKind: PosterBeneficiaryKind;
  photoUrl: string | null;
  bodyText: string | null;
  campaignName: string;
  /** `null` si aucun objectif défini OU si l'objectif est masqué -- voir
   * `buildPosterContent`. */
  goalCents: number | null;
  endsAt: string | null;
  packs: PosterPackInput[];
  /** URL (déjà résolue par l'appelant) que le QR de l'affiche doit encoder --
   * idéalement l'URL TRAÇABLE `/api/qr/[code]` d'un code déjà créé à
   * l'activation de la campagne (Tâche 1.5.1), pour que les scans depuis une
   * affiche imprimée soient comptés comme n'importe quel autre QR. */
  qrTargetUrl: string;
}

/**
 * Assemble le contenu de l'affiche à partir de données déjà chargées.
 *
 * Applique le masquage `hide_amounts`, avec la MÊME portée que
 * `applyAmountsMask` (`lib/public/campaign-progress.ts`) : seul l'OBJECTIF de
 * la campagne (un montant personnel de financement, lié à CET athlète
 * précis) est masqué. Le prix des packs reste affiché tel quel -- c'est le
 * prix public du catalogue (le même que sur `/boutique`), pas un montant
 * personnel de l'athlète ; `hide_amounts` n'a jamais eu cette portée ailleurs
 * dans le projet (voir `tests/unit/public-campaign-progress.test.ts`). Cette
 * décision est documentée dans docs/DECISIONS.md (Tâche 1.5.2).
 */
export function buildPosterContent(
  beneficiary: PosterBeneficiaryInput,
  campaign: PosterCampaignInput,
  packs: PosterPackInput[],
  qrTargetUrl: string,
): PosterContent {
  const maskGoal = beneficiary.kind === 'athlete' && beneficiary.hideAmounts === true;
  return {
    beneficiaryName: beneficiary.name,
    beneficiaryKind: beneficiary.kind,
    photoUrl: beneficiary.imageUrl,
    bodyText: beneficiary.bodyText,
    campaignName: campaign.name,
    goalCents: maskGoal ? null : campaign.goalCents,
    endsAt: campaign.endsAt,
    packs,
    qrTargetUrl,
  };
}

function formatEndDateLabel(endsAt: string | null): string | null {
  if (!endsAt) {
    return null;
  }
  return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }).format(new Date(endsAt));
}

/** Découpe `text` en lignes qui tiennent dans `maxWidth` pour `font`/`fontSize`
 * donnés -- `pdf-lib` ne fait aucun retour à la ligne automatique. */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPG_MAGIC = [0xff, 0xd8, 0xff];

function matchesMagic(bytes: Buffer, magic: number[]): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  return magic.every((byte, index) => bytes[index] === byte);
}

/** Détecte PNG/JPEG par signature d'octets -- l'URL de la photo n'a pas
 * forcément une extension fiable (`lib/entities/athletes.ts#photoUrl` est une
 * simple URL libre, pas un téléversement validé par type MIME). */
function detectImageKind(bytes: Buffer): 'png' | 'jpg' | null {
  if (matchesMagic(bytes, PNG_MAGIC)) return 'png';
  if (matchesMagic(bytes, JPG_MAGIC)) return 'jpg';
  return null;
}

/**
 * Génère le PDF d'une affiche, dans le format demandé.
 *
 * `photoImageBytes` est fourni par l'APPELANT (déjà téléchargé depuis
 * `content.photoUrl`, ou `null`/`undefined` si absent ou si la photo est
 * masquée) -- volontairement séparé de `content.photoUrl` pour garder cette
 * fonction sans accès réseau direct (cohérent avec le reste de `lib/`,
 * CLAUDE.md section 6 : l'I/O reste à la charge de l'appelant). Une image
 * illisible/corrompue ne fait jamais échouer la génération -- l'affiche
 * reste utile sans photo plutôt que de bloquer tout le téléchargement.
 */
export async function generatePosterPdfBuffer(
  content: PosterContent,
  format: PosterFormat,
  photoImageBytes?: Buffer | null,
): Promise<Buffer> {
  const { width, height } = PAGE_SIZES_PT[format];
  const margin = Math.round(width * 0.06);
  const contentWidth = width - margin * 2;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let cursorY = height - margin;

  const kicker = 'Campagne de financement sportif';
  const kickerSize = Math.max(9, Math.round(width * 0.022));
  page.drawText(kicker, {
    x: margin,
    y: cursorY - kickerSize,
    size: kickerSize,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  cursorY -= kickerSize + 14;

  const titleSize = Math.max(16, Math.round(width * 0.07));
  for (const line of wrapText(content.beneficiaryName, boldFont, titleSize, contentWidth)) {
    page.drawText(line, { x: margin, y: cursorY - titleSize, size: titleSize, font: boldFont, color: rgb(0, 0, 0) });
    cursorY -= titleSize + 6;
  }
  cursorY -= 4;

  const subtitleSize = Math.max(11, Math.round(width * 0.035));
  for (const line of wrapText(content.campaignName, font, subtitleSize, contentWidth)) {
    page.drawText(line, { x: margin, y: cursorY - subtitleSize, size: subtitleSize, font, color: rgb(0.2, 0.2, 0.2) });
    cursorY -= subtitleSize + 6;
  }
  cursorY -= 12;

  if (photoImageBytes) {
    const kind = detectImageKind(photoImageBytes);
    try {
      const image =
        kind === 'png'
          ? await pdfDoc.embedPng(photoImageBytes)
          : kind === 'jpg'
            ? await pdfDoc.embedJpg(photoImageBytes)
            : null;
      if (image) {
        const maxPhotoSize = Math.round(contentWidth * 0.55);
        const dims = image.scaleToFit(maxPhotoSize, maxPhotoSize);
        const imgX = (width - dims.width) / 2;
        page.drawImage(image, { x: imgX, y: cursorY - dims.height, width: dims.width, height: dims.height });
        cursorY -= dims.height + 18;
      }
    } catch {
      // Image illisible/corrompue -- on continue sans photo (voir
      // commentaire d'en-tête de fonction et docs/DECISIONS.md).
    }
  }

  if (content.bodyText) {
    const bodySize = Math.max(8, Math.round(width * 0.028));
    const lines = wrapText(content.bodyText, font, bodySize, contentWidth).slice(0, 6);
    for (const line of lines) {
      page.drawText(line, { x: margin, y: cursorY - bodySize, size: bodySize, font, color: rgb(0.15, 0.15, 0.15) });
      cursorY -= bodySize + 6;
    }
    cursorY -= 6;
  }

  const infoSize = Math.max(9, Math.round(width * 0.03));
  if (content.goalCents !== null) {
    page.drawText(`Objectif : ${formatCents(content.goalCents)}`, {
      x: margin,
      y: cursorY - infoSize,
      size: infoSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    cursorY -= infoSize + 8;
  }
  const endDateLabel = formatEndDateLabel(content.endsAt);
  if (endDateLabel) {
    page.drawText(`Jusqu'au ${endDateLabel}`, {
      x: margin,
      y: cursorY - infoSize,
      size: infoSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    cursorY -= infoSize + 14;
  }

  if (content.packs.length > 0) {
    const packTitleSize = Math.max(10, Math.round(width * 0.032));
    page.drawText('Nos forfaits', {
      x: margin,
      y: cursorY - packTitleSize,
      size: packTitleSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    cursorY -= packTitleSize + 10;

    const packSize = Math.max(8, Math.round(width * 0.026));
    for (const pack of content.packs.slice(0, 5)) {
      const line = `${pack.name} -- ${formatCents(pack.priceCents)} (crédit généré : ${formatCents(pack.creditCents)})`;
      for (const wrapped of wrapText(line, font, packSize, contentWidth)) {
        page.drawText(wrapped, { x: margin, y: cursorY - packSize, size: packSize, font, color: rgb(0.1, 0.1, 0.1) });
        cursorY -= packSize + 5;
      }
    }
  }

  // QR + instructions, ancrés en bas de page (indépendamment de la quantité
  // de contenu ci-dessus) pour rester toujours visibles et scannables.
  const qrSize = Math.round(Math.min(width, height) * 0.3);
  const qrX = (width - qrSize) / 2;
  const qrY = margin + 36;
  const qrPng = await generateQrPngBuffer(content.qrTargetUrl);
  const qrImage = await pdfDoc.embedPng(qrPng);
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  const instructionText = 'Scannez pour encourager et contribuer.';
  const instructionSize = Math.max(9, Math.round(width * 0.026));
  const instructionWidth = font.widthOfTextAtSize(instructionText, instructionSize);
  page.drawText(instructionText, {
    x: (width - instructionWidth) / 2,
    y: qrY - instructionSize - 8,
    size: instructionSize,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
