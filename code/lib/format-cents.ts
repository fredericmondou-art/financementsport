/**
 * Formate un montant en centimes (integer) vers une chaîne lisible en
 * dollars/euros, ex: 150000 -> "1 500,00 $".
 *
 * Fonction pure, testable, illustrant la convention "tout montant est un
 * integer en centimes" — jamais de float pour l'argent.
 */
export function formatCents(amountCents: number, locale = 'fr-CA', currency = 'CAD'): string {
  if (!Number.isInteger(amountCents)) {
    throw new Error('amountCents doit être un nombre entier (centimes).');
  }

  const amount = amountCents / 100;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
