# lib/payments

Intégration Stripe (Checkout, vérification de signature webhook,
idempotence par id d'évènement Stripe).

`stripe-client.ts` expose le client Stripe singleton (clé lue depuis
`STRIPE_SECRET_KEY`, jamais en dur). La création de session Checkout vit
dans `app/api/checkout/route.ts` et le traitement webhook (seul point
d'écriture de commande/crédit) dans `app/api/webhooks/stripe/route.ts` — la
signature est vérifiée sur le corps brut de la requête, et l'idempotence
repose sur `stripe_events.id` (voir migration `0006`). Ce dossier reste
réservé aux futurs helpers Stripe partagés (ex. remboursements, Phase 1.5+)
qui ne seraient pas spécifiques à une route.
