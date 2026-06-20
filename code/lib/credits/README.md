# lib/credits

Moteur de calcul et d'attribution des crédits aux bénéficiaires
(athlète / équipe / club — bénéficiaire polymorphe).

- `resolve-rule.ts` — hiérarchie pure à 5 niveaux des `credit_rules`
  (crédit fixe produit → règle campagne+produit → règle campagne → règle
  produit → règle globale permanente/abonnement). Voir
  `tests/unit/credits-resolve-rule.test.ts`.
- `calculate.ts` — `calculateOrderCredits` (crédit par ligne + bonus de
  seuil) et `splitCreditAmongBeneficiaries` (répartition en `share_bps`,
  arrondi à la baisse, résidu au premier bénéficiaire). Voir
  `tests/unit/credits-calculate.test.ts`.
- `persist.ts` — écriture des `order_credits`/`credit_audit_log` après
  paiement confirmé (appelé depuis `app/api/webhooks/stripe`). Voir
  `tests/unit/credits-persist.test.ts`.
