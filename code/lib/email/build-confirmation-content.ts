/**
 * Construction PURE du contenu du courriel de confirmation de commande
 * (Tâche 1.5, cahier section 28). Séparée de l'envoi (lib/email/
 * send-order-confirmation.ts) pour rester testable en Vitest sans réseau
 * (CLAUDE.md section 6 + section 8), même découpage que
 * lib/credits/calculate.ts / lib/credits/persist.ts.
 */
import { formatCents } from '@/lib/format-cents';

export interface OrderConfirmationItemInput {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderConfirmationBeneficiaryCreditInput {
  label: string;
  amountCents: number;
}

export interface OrderConfirmationContentInput {
  orderNumber: string;
  items: OrderConfirmationItemInput[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  beneficiaryCredits: OrderConfirmationBeneficiaryCreditInput[];
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Échappe les caractères HTML dangereux dans les valeurs interpolées
 * (nom de produit, libellé de bénéficiaire) avant insertion dans le gabarit
 * HTML -- ces valeurs proviennent de données saisies par des admins/clients
 * (nom de produit, nom d'athlète/équipe/club) et ne doivent jamais être
 * insérées brutes dans du HTML (risque d'injection).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOrderConfirmationContent(input: OrderConfirmationContentInput): EmailContent {
  const subject = `Confirmation de votre commande ${input.orderNumber}`;

  const itemLines = input.items.map(
    (item) =>
      `- ${item.productName} x${item.quantity} : ${formatCents(item.lineTotalCents)}`,
  );

  const creditLines =
    input.beneficiaryCredits.length > 0
      ? input.beneficiaryCredits.map(
          (credit) => `- ${formatCents(credit.amountCents)} pour ${credit.label}`,
        )
      : ['Aucun bénéficiaire associé à cette commande.'];

  const text = [
    `Merci pour votre commande ${input.orderNumber} !`,
    '',
    'Détail de la commande :',
    ...itemLines,
    '',
    `Sous-total : ${formatCents(input.subtotalCents)}`,
    `TPS + TVQ : ${formatCents(input.taxCents)}`,
    `Livraison : ${formatCents(input.shippingCents)}`,
    `Total : ${formatCents(input.totalCents)}`,
    '',
    'Impact de votre achat :',
    ...creditLines,
    '',
    'Merci de votre soutien !',
  ].join('\n');

  const itemRowsHtml = input.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.productName)} x${item.quantity} : ${formatCents(item.lineTotalCents)}</li>`,
    )
    .join('');

  const creditRowsHtml =
    input.beneficiaryCredits.length > 0
      ? input.beneficiaryCredits
          .map((credit) => `<li>${formatCents(credit.amountCents)} pour ${escapeHtml(credit.label)}</li>`)
          .join('')
      : '<li>Aucun bénéficiaire associé à cette commande.</li>';

  const html = `
    <h1>Merci pour votre commande ${escapeHtml(input.orderNumber)} !</h1>
    <h2>Détail de la commande</h2>
    <ul>${itemRowsHtml}</ul>
    <p>Sous-total : ${formatCents(input.subtotalCents)}<br/>
    TPS + TVQ : ${formatCents(input.taxCents)}<br/>
    Livraison : ${formatCents(input.shippingCents)}<br/>
    <strong>Total : ${formatCents(input.totalCents)}</strong></p>
    <h2>Impact de votre achat</h2>
    <ul>${creditRowsHtml}</ul>
    <p>Merci de votre soutien !</p>
  `.trim();

  return { subject, text, html };
}
