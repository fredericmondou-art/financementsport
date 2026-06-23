/**
 * Page de confirmation post-paiement (Tâche 1.4.6, étendue Tâche 1.6.A2).
 *
 * Cible du `success_url` Stripe (`lib/checkout/create-checkout-session.ts`) :
 * `/commande/confirmation?session_id={CHECKOUT_SESSION_ID}`. Sans cette
 * page, un paiement réel aboutissait à une 404 -- gap découvert en testant
 * le parcours d'achat de bout en bout (voir docs/DECISIONS.md).
 *
 * Décision autonome d'origine (voir docs/DECISIONS.md, Tâche 1.4.6) : cette
 * page N'INTERROGE PAS Stripe ni Supabase pour afficher le DÉTAIL de la
 * commande (articles, taxes, crédit), pour deux raisons toujours valables :
 *   1. Sécurité (CLAUDE.md section 5) : `orders`/`order_credits` sont
 *      protégées par RLS « un client ne lit que ses propres données », mais
 *      un achat invité n'a pas de `user_id` -- lire la commande ici
 *      exigerait soit une nouvelle policy RLS basée sur l'identité invité,
 *      soit un contournement service_role sur une route PUBLIQUE.
 *   2. Latence webhook (CLAUDE.md section 4) : le crédit n'est écrit qu'au
 *      webhook `checkout.session.completed`, qui peut arriver une fraction
 *      de seconde APRÈS la redirection du client.
 * Le client reçoit toujours le détail complet par courriel
 * (`lib/email/send-order-confirmation.ts`, envoyé par le webhook).
 *
 * Exception NARROW ajoutée à la Tâche 1.6.A2 (voir docs/DECISIONS.md pour le
 * raisonnement complet) : pour proposer la création de compte « il ne reste
 * qu'un mot de passe », cette page lit désormais UN SEUL champ, en lecture
 * seule, depuis Stripe : `customer_details.email` de la session payée
 * (`session_id`, jeton porteur non-devinable -- déjà la seule preuve
 * d'achat que cette page utilise). Aucune écriture, aucun montant, aucune
 * donnée `orders`/`order_credits` -- la raison 1 (RLS) ne s'applique pas
 * (Stripe, pas Supabase) et la raison 2 (latence crédit) ne s'applique pas
 * non plus (l'email du payeur est connu de Stripe dès le paiement, pas
 * après le webhook). Si cette lecture échoue (session introuvable, déjà
 * expirée, etc.), la page se dégrade simplement : pas de proposition de
 * compte, juste le message de remerciement -- jamais une erreur visible.
 */
import { getCurrentUser } from '@/lib/auth/session';
import { getStripeClient } from '@/lib/payments/stripe-client';
import { logger } from '@/lib/logger/logger';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { createAccountFromOrderAction } from './actions';

export const metadata = {
  title: 'Merci pour votre achat',
};

interface ConfirmationCommandePageProps {
  searchParams: { session_id?: string; compteErreur?: string };
}

async function loadGuestEmail(sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) {
    return null;
  }
  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return null;
    }
    return session.customer_details?.email ?? null;
  } catch (error) {
    logger.warn('Lecture de session Stripe échouée sur la page de confirmation', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export default async function ConfirmationCommandePage({
  searchParams,
}: ConfirmationCommandePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  const guestEmail = user ? null : await loadGuestEmail(searchParams.session_id);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Merci pour votre achat !</h1>
      </div>

      <Card>
        <section className="stack stack--sm">
          <p>
            Votre paiement a été confirmé. Un courriel récapitulatif (articles, taxes et crédit attribué) vous
            sera envoyé sous peu à l&apos;adresse fournie lors du paiement.
          </p>
          <p>
            Le crédit de votre achat est attribué automatiquement au bénéficiaire choisi dans votre panier --
            aucune autre action n&apos;est requise de votre part.
          </p>
        </section>
      </Card>

      {guestEmail ? (
        <Card>
          <section className="stack stack--sm">
            <h2>Envie de suivre l&apos;impact de ton don ?</h2>
            <p>
              Crée un compte en un instant avec l&apos;adresse <strong>{guestEmail}</strong> -- il ne reste
              qu&apos;un mot de passe à choisir. Tu pourras suivre l&apos;impact de ton don, retrouver tes
              reçus et racheter en un clic la prochaine fois. Cette commande reste la tienne même si tu
              préfères ne pas créer de compte.
            </p>
            {searchParams.compteErreur ? <Alert variant="error">{searchParams.compteErreur}</Alert> : null}
            <form action={createAccountFromOrderAction} className="form">
              <input type="hidden" name="sessionId" value={searchParams.session_id} />
              <Field label="Mot de passe" hint="8 caractères minimum.">
                <input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
              <Button type="submit">Créer mon compte</Button>
            </form>
          </section>
        </Card>
      ) : null}

      <div>
        <Button href="/boutique">Continuer mes achats</Button>
      </div>
    </main>
  );
}
