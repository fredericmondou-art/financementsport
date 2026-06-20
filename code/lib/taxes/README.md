# lib/taxes

Calcul des taxes par province. Montants toujours en `integer` centimes,
jamais de `float`.

- `rates.ts` — lecture du taux applicable depuis la table `tax_rates`
  (jamais en dur dans la logique, CLAUDE.md §2), par province et date
  d'effet.
- `calculate-tax.ts` — `calculateTaxCents`, fonction pure qui applique un
  taux déjà résolu à un sous-total taxable (arrondi au centime le plus
  proche — voir le commentaire du fichier pour la distinction avec
  l'arrondi à la baisse utilisé pour les crédits).
