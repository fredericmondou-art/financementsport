# gabarit-rapport.md — Rapport obligatoire après chaque tâche

Après CHAQUE tâche terminée (0.1, 0.2, 1.1, etc.), avant de passer à la suivante,
tu produis un rapport en suivant EXACTEMENT le gabarit ci-dessous. Tu l'écris
dans `docs/rapports/RAPPORT-<numéro>.md` (ex: `docs/rapports/RAPPORT-0.1.md`) ET
tu me le présentes dans la conversation.

Règles du rapport :
- En français, clair, sans jargon inutile. J'explique = quelqu'un de non
  technique doit comprendre.
- Honnête sur ce qui ne marche pas. Un rapport qui cache un problème est pire
  qu'un problème. Si quelque chose est incomplet ou douteux, dis-le dans la
  section « Limites et risques ».
- Tu ne déclares pas une tâche « terminée » si les tests ne passent pas. Dans ce
  cas, le rapport sort quand même, mais avec le statut « bloqué » ou « partiel ».

---

## GABARIT (copie cette structure à chaque fois)

# Rapport — Tâche <numéro> : <titre de la tâche>

**Date :** <date>
**Statut :** ✅ Terminé / ⚠️ Partiel / ⛔ Bloqué

## 1. En une phrase
Ce que cette tâche accomplit, expliqué simplement.

## 2. Ce que j'ai fait
Liste courte des actions concrètes (3 à 6 points max). Pas le détail du code,
les grandes étapes.

## 3. Critères d'acceptation
Reprends CHAQUE critère d'acceptation de la tâche (depuis
`docs/prompts/phase-0-et-1.md`) et indique pour chacun :
- ✅ rempli / ❌ non rempli
- la preuve (quel test, quelle vérification, quel résultat observé)

| Critère | État | Preuve |
|---|---|---|
| ... | ✅ | test X passe / vérifié manuellement |

## 4. Tests
- Commande lancée : `npm test` (ou autre)
- Résultat : X tests passés, Y échoués
- Couverture des cas limites pertinents (surtout argent : montant 0, arrondi,
  campagne inactive, remboursement) : oui / non / sans objet
- Colle la sortie résumée des tests (pas tout le log, juste le récapitulatif).

## 5. Décisions prises en autonomie
Tout choix que j'ai fait seul sur un point flou, et pourquoi. Renvoie aussi vers
`docs/DECISIONS.md`. S'il n'y en a pas : « aucune ».

## 6. Respect des règles non négociables
Confirme explicitement (ou signale un écart) :
- Argent en centimes, arithmétique entière : ✅ / écart
- Crédit écrit uniquement sur paiement confirmé (si applicable) : ✅ / s.o.
- RLS / confidentialité mineurs respectées (si applicable) : ✅ / s.o.
- Aucun secret en dur dans le code : ✅
- Pas de régression (tests des tâches précédentes toujours verts) : ✅ / écart

## 7. Limites et risques
Ce qui n'est pas couvert, ce qui reste fragile, ce qui mériterait une revue
humaine. Sois franc. S'il n'y a rien de notable : « rien à signaler ».

## 8. Ce qu'il me faut de toi (s'il y a lieu)
Question bloquante, secret/accès manquant, décision qui t'appartient. Si rien :
« rien, je passe à la tâche suivante ». Si quelque chose : je m'arrête ici et
j'attends ta réponse.

## 9. Prochaine tâche
Numéro et titre de la tâche suivante prévue.

---

## Note pour les tâches sensibles (1.3, 1.5, 0.4)

Pour le moteur de crédit (1.3), le paiement (1.5) et la sécurité RLS (0.4),
ajoute en plus, dans la section 7, un petit scénario chiffré que je peux vérifier
moi-même. Exemple pour 1.5 : « Achat test de 120 $ réparti 50/50 entre Thomas et
Emma → 2 lignes de crédit créées : 9 $ + 9 $, toutes deux après confirmation du
paiement, aucune avant. Tu peux le vérifier dans la table order_credits. »
