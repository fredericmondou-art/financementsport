/**
 * Client SendGrid (Tâche 1.5). Clé API lue UNIQUEMENT depuis la variable
 * d'environnement `SENDGRID_API_KEY` (CLAUDE.md section 5 : aucun secret en
 * dur dans le code). Même style de singleton paresseux que
 * lib/payments/stripe-client.ts.
 */
import sgMail from '@sendgrid/mail';

let configured = false;

export function getSendgridClient(): typeof sgMail {
  if (configured) {
    return sgMail;
  }
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY est manquante dans les variables d’environnement.');
  }
  sgMail.setApiKey(apiKey);
  configured = true;
  return sgMail;
}
