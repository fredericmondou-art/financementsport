/**
 * Accès à `email_log` (Tâche 1.5, cahier section 28 : « journal des envois
 * pour idempotence »). Statuts possibles : 'queued' | 'sent' | 'failed'
 * (contrainte du schéma, voir migration 0001). Ce module ne fait que
 * persister une ligne -- jamais de logique d'envoi ici (voir
 * lib/email/send-order-confirmation.ts).
 *
 * Une erreur d'écriture du journal lui-même n'est PAS renvoyée à
 * l'appelant : le courriel a déjà été envoyé (ou son échec déjà décidé) à ce
 * stade, et faire échouer tout le flux de confirmation de commande pour une
 * simple ligne de journal manquante serait disproportionné. On se contente
 * de logger l'erreur via le logger structuré du projet.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger/logger';

export interface EmailLogInsertPayload {
  recipient: string;
  template: string;
  related_type?: string | null;
  related_id?: string | null;
  status: 'queued' | 'sent' | 'failed';
  sent_at?: string | null;
  provider_id?: string | null;
}

export interface EmailLogRepo {
  logEmail(entry: EmailLogInsertPayload): Promise<void>;
}

export function createSupabaseEmailLogRepo(supabase: SupabaseClient): EmailLogRepo {
  return {
    async logEmail(entry) {
      const { error } = await supabase.from('email_log').insert(entry);
      if (error) {
        logger.error('Échec de l’écriture du journal email_log (non bloquant)', {
          recipient: entry.recipient,
          template: entry.template,
          error: error.message,
        });
      }
    },
  };
}
