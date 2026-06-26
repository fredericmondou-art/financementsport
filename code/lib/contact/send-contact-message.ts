/**
 * Envoi du message du formulaire de contact public (Tâche 1.4b.5). Même
 * politique que lib/email/send-order-confirmation.ts : un échec d'envoi ne
 * doit jamais faire planter la requête (on journalise et on renvoie
 * { sent: false }), et la clé `SENDGRID_FROM_EMAIL` sert aussi d'expéditeur
 * ici. Le destinataire est `CONTACT_EMAIL` (variable d'environnement —
 * aucune adresse en dur dans le code, voir .env.example) : tant qu'elle
 * n'est pas configurée, le message est journalisé comme `failed` plutôt que
 * silencieusement perdu.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger/logger';
import { getSendgridClient } from '@/lib/email/sendgrid-client';
import { createSupabaseEmailLogRepo, type EmailLogRepo } from '@/lib/email/email-log';
import { buildContactMessageContent, type ContactMessageContentInput } from './build-contact-message-content';

export interface SendContactMessageResult {
  sent: boolean;
}

const TEMPLATE_NAME = 'contact_form';

export async function sendContactMessage(
  supabase: SupabaseClient,
  input: ContactMessageContentInput,
  repo: EmailLogRepo = createSupabaseEmailLogRepo(supabase),
): Promise<SendContactMessageResult> {
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const contactEmail = process.env.CONTACT_EMAIL;

  if (!fromEmail || !contactEmail) {
    logger.error(
      'SENDGRID_FROM_EMAIL ou CONTACT_EMAIL est manquante — message de contact non envoyé.',
      { hasFromEmail: Boolean(fromEmail), hasContactEmail: Boolean(contactEmail) },
    );
    await repo.logEmail({
      recipient: contactEmail ?? 'inconnu',
      template: TEMPLATE_NAME,
      related_type: 'contact_message',
      status: 'failed',
    });
    return { sent: false };
  }

  const { subject, text, html } = buildContactMessageContent(input);

  try {
    const sgMail = getSendgridClient();
    await sgMail.send({
      to: contactEmail,
      from: fromEmail,
      replyTo: input.email.trim(),
      subject,
      text,
      html,
    });

    await repo.logEmail({
      recipient: contactEmail,
      template: TEMPLATE_NAME,
      related_type: 'contact_message',
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return { sent: true };
  } catch (error) {
    logger.error('Échec de l’envoi du message de contact', {
      error: error instanceof Error ? error.message : String(error),
    });

    await repo.logEmail({
      recipient: contactEmail,
      template: TEMPLATE_NAME,
      related_type: 'contact_message',
      status: 'failed',
    });

    return { sent: false };
  }
}
