/**
 * Envoi du courriel de confirmation de commande (Tâche 1.5, cahier section
 * 28). Orchestration I/O uniquement -- le contenu est construit par la
 * fonction pure buildOrderConfirmationContent (lib/email/
 * build-confirmation-content.ts), testable sans réseau.
 *
 * Décision (voir docs/DECISIONS.md) : un échec d'envoi de courriel NE DOIT
 * JAMAIS faire échouer le traitement du webhook Stripe qui l'appelle -- la
 * commande et les crédits sont déjà écrits en base à ce stade (paiement déjà
 * encaissé). On capture donc toute exception ici, on journalise (logger +
 * email_log avec status 'failed'), et on renvoie simplement { sent: false }
 * plutôt que de propager l'erreur.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger/logger';
import { getSendgridClient } from './sendgrid-client';
import { createSupabaseEmailLogRepo, type EmailLogRepo } from './email-log';
import {
  buildOrderConfirmationContent,
  type OrderConfirmationContentInput,
} from './build-confirmation-content';

export interface SendOrderConfirmationInput extends OrderConfirmationContentInput {
  recipientEmail: string;
  orderId: string;
}

export interface SendOrderConfirmationResult {
  sent: boolean;
}

const TEMPLATE_NAME = 'order_confirmation';

export async function sendOrderConfirmationEmail(
  supabase: SupabaseClient,
  input: SendOrderConfirmationInput,
  repo: EmailLogRepo = createSupabaseEmailLogRepo(supabase),
): Promise<SendOrderConfirmationResult> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) {
    logger.error('SENDGRID_FROM_EMAIL est manquante — courriel de confirmation non envoyé.', {
      orderId: input.orderId,
    });
    await repo.logEmail({
      recipient: input.recipientEmail,
      template: TEMPLATE_NAME,
      related_type: 'order',
      related_id: input.orderId,
      status: 'failed',
    });
    return { sent: false };
  }

  const { subject, text, html } = buildOrderConfirmationContent(input);

  try {
    const sgMail = getSendgridClient();
    const [response] = await sgMail.send({
      to: input.recipientEmail,
      from: fromEmail,
      subject,
      text,
      html,
    });

    await repo.logEmail({
      recipient: input.recipientEmail,
      template: TEMPLATE_NAME,
      related_type: 'order',
      related_id: input.orderId,
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_id:
        typeof response?.headers?.['x-message-id'] === 'string' ? response.headers['x-message-id'] : null,
    });

    return { sent: true };
  } catch (error) {
    logger.error('Échec de l’envoi du courriel de confirmation de commande (non bloquant)', {
      orderId: input.orderId,
      error: error instanceof Error ? error.message : String(error),
    });

    await repo.logEmail({
      recipient: input.recipientEmail,
      template: TEMPLATE_NAME,
      related_type: 'order',
      related_id: input.orderId,
      status: 'failed',
    });

    return { sent: false };
  }
}
