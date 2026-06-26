'use server';

/**
 * Action du formulaire de contact public (Tâche 1.4b.5). Visiteur anonyme :
 * pas de session requise. Validation zod côté serveur (CLAUDE.md section 6),
 * puis envoi + journal via lib/contact/send-contact-message.ts.
 *
 * Décision (voir docs/DECISIONS.md) : on utilise le client service_role pour
 * écrire dans `email_log`, car cette table n'a aucune policy d'écriture pour
 * `anon`/`authenticated` (réservée au service_role, voir migration 0003) --
 * même contournement que les autres écritures internes déclenchées par un
 * visiteur non authentifié (ex. webhooks Stripe). Aucune lecture de données
 * utilisateur n'est faite ici, uniquement l'écriture d'un message entrant.
 */
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createSupabaseServiceClient } from '@/lib/db/supabase-client';
import { sendContactMessage } from '@/lib/contact/send-contact-message';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis.').max(200),
  email: z.string().trim().email("L'adresse courriel n'est pas valide."),
  subject: z.string().trim().min(1, 'Le sujet est requis.').max(200),
  message: z.string().trim().min(1, 'Le message est requis.').max(5000),
});

export async function sendContactFormAction(formData: FormData): Promise<void> {
  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    subject: formData.get('subject'),
    message: formData.get('message'),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Formulaire invalide.';
    redirect(`/contact?erreur=${encodeURIComponent(message)}`);
  }

  const supabase = createSupabaseServiceClient();
  const { sent } = await sendContactMessage(supabase, parsed.data);

  if (!sent) {
    redirect(
      `/contact?erreur=${encodeURIComponent(
        "Le message n'a pas pu être envoyé pour le moment. Réessaie plus tard ou écris-nous directement.",
      )}`,
    );
  }

  redirect('/contact?envoye=1');
}
