/**
 * Page de confirmation post-paiement (Tâche 1.4.6).
 *
 * Cible du `success_url` Stripe (`lib/checkout/create-checkout-session.ts`) :
 * `/commande/confirmation?session_id={CHECKOUT_SESSION_ID}`. Sans cette
 * page, un paiement réel aboutissait à une 404 -- gap découvert en testant
 * le parcours d'achat de bout en bout (voir docs/DECISIONS.md).
 *
 * Décision autonome (voir docs/DECISIONS.md) : cette page N'INTERROGE PAS
 * Stripe ni Supabase pour afficher le détail de la commande, pour deux
 * raisons :
 *   1. Sécurité (CLAUDE.md section 5) : `orders`/`order_credits` sont
 *      protégées par RLS « un client ne lit que ses propres données », mais
 *      un achat invité n'a pas de `user_id` -- lire la commande ici
 *      exigerait soit une nouvelle policy RLS basée sur l'identité invité,
 *      soit un contournement service_role sur une route PUBLIQUE, ce qui
 *      dépasse le périmètre de cette tâche (mise en ligne) et engage la
 *      sécurité : à concevoir et faire valider séparément si un détail de
 *      commande affiché ici devient un besoin réel.
 *   2. Latence webhook (CLAUDE.md section 4) : le crédit n'est écrit qu'au
 *      webhook `checkout.session.completed`, qui peut arriver une fraction
 *      de seconde APRÈS la redirection du client -- afficher un détail lu
 *      en direct créerait une fenêtre où la page dirait à tort « introuvable ».
 *
 * Le client reçoit déjà le détail complet (articles, taxes, crédit par
 * bénéficiaire) par courriel de confirmation (`lib/email/
 * send-order-confirmation.ts`, envoyé par le webhook) -- cette page confirme
 * seulement que le paiement a réussi et oriente vers la suite.
 */
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Merci pour votre achat',
};

export default function ConfirmationCommandePage(): JSX.Element {
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

      <div>
        <Button href="/boutique">Continuer mes achats</Button>
      </div>
    </main>
  );
}
