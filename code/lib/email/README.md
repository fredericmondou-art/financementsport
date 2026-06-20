# lib/email

Envoi de courriels transactionnels via SendGrid (confirmations, reçus,
relances de campagne).

- `sendgrid-client.ts` — client SendGrid singleton (clé lue depuis
  `SENDGRID_API_KEY`).
- `build-confirmation-content.ts` — construction pure (sujet + corps) du
  courriel de confirmation de commande, testable sans réseau.
- `send-order-confirmation.ts` — envoi effectif, appelé après écriture des
  crédits dans le webhook Stripe ; échec non bloquant (voir `email-log.ts`).
- `email-log.ts` — journalisation des tentatives d'envoi (succès/échec),
  par design non bloquante pour le flux de paiement.
