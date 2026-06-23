/**
 * Rattachement des commandes invité à un compte, par courriel (Tâche 1.6.A2,
 * docs/prompts/phase-1-6.md : « À l'inscription, rattacher automatiquement la
 * commande invité au compte (via l'e-mail) pour que l'historique soit
 * complet »).
 *
 * Même séparation logique/I/O que `lib/cart/attach-guest-cart.ts` (modèle de
 * référence pour cette tâche) : une fonction pure orchestrant un repo
 * injecté, testable sans base de données réelle.
 *
 * Décision autonome importante (voir docs/DECISIONS.md, Tâche 1.6.A2) :
 * cette fonction ne fait QUE réassigner `orders.user_id` -- jamais de
 * recalcul de crédit, de taxe ou de montant (CLAUDE.md section 4 : un crédit
 * déjà attribué ne doit jamais être recalculé après coup par une action non
 * liée à l'argent). Ce n'est PAS une "modification d'un crédit" au sens de
 * CLAUDE.md section 4 (`credit_audit_log`) : `order_credits.amount_cents`
 * n'est jamais touché, seule la propriété de la commande change.
 *
 * Aucune policy RLS n'autorise un `UPDATE` sur `orders` pour un utilisateur
 * normal (seul `platform_admin`, voir migration 0003) -- cette fonction doit
 * donc être appelée avec un repo construit sur le client `service_role`
 * (`lib/db/client.ts`), jamais le client anon, et UNIQUEMENT depuis un
 * contexte serveur de confiance où le courriel a déjà été vérifié par
 * Stripe (jamais un courriel saisi librement par l'appelant -- voir
 * `app/(shop)/commande/confirmation/actions.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AttachGuestOrdersRepo {
  /** Réassigne à `userId` toutes les commandes `guest_email = guestEmail`
   * encore sans compte (`user_id IS NULL`). Retourne le nombre de commandes
   * rattachées (0 si aucune -- cas courant, pas une erreur : un premier
   * achat invité n'a souvent qu'une seule commande, ou aucune si le
   * courriel n'a jamais servi à un achat invité). */
  attachOrdersByGuestEmail(guestEmail: string, userId: string): Promise<number>;
}

export function createSupabaseAttachGuestOrdersRepo(supabase: SupabaseClient): AttachGuestOrdersRepo {
  return {
    async attachOrdersByGuestEmail(guestEmail, userId) {
      const { data, error } = await supabase
        .from('orders')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('guest_email', guestEmail)
        .is('user_id', null)
        .select('id');
      if (error) {
        throw error;
      }
      return data?.length ?? 0;
    },
  };
}

/**
 * Point d'entrée appelé après une création de compte. `guestEmail` est
 * `null` quand il n'y a rien à rattacher (ex. compte créé hors du parcours
 * post-achat) -- retourne alors `0` sans appeler le repo, jamais une erreur :
 * le rattachement est un bonus, jamais un blocage de l'inscription
 * (docs/prompts/phase-1-6.md, critère « Refuser l'inscription n'affecte pas
 * la commande » -- par symétrie, l'absence de courriel à rattacher
 * n'affecte jamais la création de compte non plus).
 */
export async function attachGuestOrdersToUser(
  guestEmail: string | null,
  userId: string,
  repo: AttachGuestOrdersRepo,
): Promise<number> {
  if (!guestEmail) {
    return 0;
  }
  return repo.attachOrdersByGuestEmail(guestEmail, userId);
}
