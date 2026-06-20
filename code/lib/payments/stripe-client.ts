/**
 * Client Stripe (Tâche 1.5). Clé secrète lue UNIQUEMENT depuis la variable
 * d'environnement `STRIPE_SECRET_KEY` (CLAUDE.md section 5 : aucun secret en
 * dur dans le code). `apiVersion` volontairement omis : on utilise la
 * version par défaut du compte Stripe plutôt que de figer une chaîne de
 * version dans le code (qui devrait être maintenue manuellement à chaque
 * mise à jour du SDK).
 */
import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (client) {
    return client;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY est manquante dans les variables d’environnement.');
  }
  client = new Stripe(secretKey);
  return client;
}
