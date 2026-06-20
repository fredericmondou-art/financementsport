# lib/orders

Création de commande et répartition multi-bénéficiaires (transaction
atomique commande + crédit).

`create-order.ts` appelle la fonction Postgres atomique
`create_paid_order` (voir
`supabase/migrations/0006_stripe_events_and_order_credit_function.sql`) :
décrément de stock, lignes de commande, `order_credits` et
`credit_audit_log` dans une seule transaction. N'écrit jamais directement
dans les tables — toujours via cette fonction, appelée uniquement depuis
`app/api/webhooks/stripe` après confirmation de paiement.
