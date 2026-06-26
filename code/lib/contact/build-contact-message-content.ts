/**
 * Construction du contenu du courriel envoyé depuis le formulaire de contact
 * public (Tâche 1.4b.5). Fonction pure, testable sans réseau ni base de
 * données — même découpage que lib/email/build-confirmation-content.ts :
 * tout le texte est construit ici, lib/contact/send-contact-message.ts ne
 * fait que l'I/O (SendGrid + journal email_log).
 */

export interface ContactMessageContentInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactMessageContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildContactMessageContent(input: ContactMessageContentInput): ContactMessageContent {
  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();

  const mailSubject = `[Contact site] ${subject}`;

  const text = [
    `Nouveau message via le formulaire de contact du site.`,
    ``,
    `Nom : ${name}`,
    `Courriel : ${email}`,
    `Sujet : ${subject}`,
    ``,
    message,
  ].join('\n');

  const html = [
    `<p>Nouveau message via le formulaire de contact du site.</p>`,
    `<p><strong>Nom :</strong> ${escapeHtml(name)}<br>`,
    `<strong>Courriel :</strong> ${escapeHtml(email)}<br>`,
    `<strong>Sujet :</strong> ${escapeHtml(subject)}</p>`,
    `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  ].join('\n');

  return { subject: mailSubject, text, html };
}
