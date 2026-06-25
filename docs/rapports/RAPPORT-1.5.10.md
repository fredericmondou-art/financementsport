# Rapport — Tâche 1.5.10 : Calcul des versements (paiement manuel)

**Date :** 2026-06-25
**Statut :** ✅ Terminé

## 1. En une phrase
À la clôture d'une campagne, la plateforme calcule maintenant automatiquement le montant dû à chaque bénéficiaire (athlète, équipe ou club) à partir de ses crédits actifs, et un admin (ou un comptable) fait avancer chaque versement à travers un cycle de validation strict — calculé → approuvé → payé — où le paiement effectif (réel, hors plateforme) ne peut jamais être marqué « payé » sans preuve explicite.

## 2. Ce que j'ai fait
- Écrit la migration `0019_payout_status_transitions.sql` : table `payout_status_log` (journal d'audit, INSERT-only), fonction `advance_payout_status` (`SECURITY DEFINER`, verrouille la ligne, revalide la transition/l'autorisation/la preuve/la raison côté serveur, écrit le nouveau statut + le journal en une transaction), trigger `payouts_guard_amount_lock` (verrouille `amount_cents`/`fee_held_cents` une fois le versement sorti de `calculated`/`in_validation`).
- Écrit `lib/payouts/calculate.ts` : calcul pur des montants dus (`computeActiveCreditsDueByBeneficiary`), plan de recalcul idempotent (`planPayoutRecalculation`), orchestration (`recalculatePayoutsForCampaign`), repo Supabase.
- Écrit `lib/payouts/workflow.ts` : graphe complet des 7 statuts (`VALID_PAYOUT_STATUS_TRANSITIONS`), validations (`assertValidPayoutStatusTransition`), orchestration (`advancePayoutStatus`), repo Supabase appelant le RPC.
- Créé les pages `app/(admin)/versements` (liste des campagnes clôturées/payées) et `app/(admin)/versements/[campaignId]` (calcul + cycle de validation + actions serveur).
- Écrit et fait passer 83 nouveaux tests unitaires (`payouts-calculate.test.ts` : 34, `payouts-workflow.test.ts` : 49) + 18 nouveaux tests d'intégration RLS (`payout-status-transitions-rls.test.ts`, Postgres embarqué).
- Relancé toute la suite de tests existante par lots (contrainte de sandbox) : suite unitaire complète (471 tests) et les 18 fichiers de tests d'intégration — aucune régression. `tsc --noEmit` et `eslint` propres sur tous les fichiers touchés.
- Documenté sept décisions autonomes dans `docs/DECISIONS.md` et mis à jour `docs/PROGRESS.md`.

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| Montant dû = somme des crédits actifs du bénéficiaire après clôture | ✅ | `computeActiveCreditsDueByBeneficiary` filtre `status === 'active'` ; testé sur jeux de données mixtes (actifs/pending/expirés) |
| `paid` atteignable seulement par action admin explicite, avec preuve | ✅ | `MissingPayoutProofError` (TypeScript) + refus serveur (`advance_payout_status`, migration 0019) si `proof_url` absent ; testé en unitaire ET en intégration (même pour `platform_admin`) |
| Le recalcul ne crée jamais de doublon de versement | ✅ | `planPayoutRecalculation` : union des clés bénéficiaire, un seul versement par (campagne, bénéficiaire) ; un versement déjà validé/payé/fermé est ignoré (`skip_locked`), jamais dupliqué |
| Le « crédits dus » du dashboard admin baisse quand un versement passe à `paid` | ✅ | `amount_cents` reste la somme brute (cohérent avec `summarizeCreditsDue`, Tâche 1.5.7, qui soustrait les versements `paid`) ; vérifié par calcul direct dans le scénario chiffré ci-dessous |
| Ajustement après validation toujours tracé (montant + raison) | ✅ | `MissingPayoutAdjustmentAmountError`/`MissingPayoutAdjustmentReasonError` ; chaque transition écrit une ligne `payout_status_log` (testé : la raison apparaît dans `note`) |
| Versements lisibles seulement par les rôles autorisés (admin/comptable/responsable concerné) | ✅ | RLS testée : `team_manager` lié voit le journal de ses bénéficiaires, un manager non lié ne voit rien, `accounting`/`platform_admin` voient tout |

## 4. Tests
- Commandes lancées : `npx vitest run tests/unit/payouts-calculate.test.ts tests/unit/payouts-workflow.test.ts`, `npx vitest run tests/integration/payout-status-transitions-rls.test.ts`, suite unitaire complète (`tests/unit`), suite d'intégration complète (18 fichiers, par lots de 5+5+5+3), `npx tsc --noEmit`, `npx eslint` sur les fichiers touchés.
- Résultat : 100 % verts. 83 nouveaux tests unitaires + 18 nouveaux tests d'intégration = 101 nouveaux tests ; suite unitaire complète (471 tests) et suite d'intégration complète, aucune régression ; `tsc`/`eslint` propres.
- Cas limites couverts : montant dû = 0 (aucun crédit actif), crédits `pending`/`expired`/`refunded` exclus, transition invalide (`calculated → paid` direct, refusée même pour `platform_admin`), preuve manquante ou vide, ajustement sans montant/sans raison/avec montant 0 (remboursement total, accepté), statut terminal `closed` (aucune transition sortante), verrou du montant sur une ligne déjà validée même en écriture SQL directe (trigger), recalcul après qu'un versement soit déjà `paid` (ignoré, pas de doublon), rôle non autorisé (`anon`, `team_manager`) bloqué par la RLS et par le RPC.

## 5. Décisions prises en autonomie
Sept décisions, détaillées dans `docs/DECISIONS.md` (entrée « 2026-06-25 — Tâche 1.5.10 ») :
1. Graphe complet à 7 statuts conçu en autonomie (le cahier ne décrit que `calculated → approved → paid`).
2. `amount_cents` reste la somme brute ; `fee_held_cents` est une retenue séparée, jamais soustraite à la source.
3. Défense en profondeur à deux niveaux : RPC `SECURITY DEFINER` pour les transitions + trigger pour verrouiller le montant.
4. Calcul des montants dus via des appels Supabase ordinaires (RLS simple), pas un RPC.
5. Calcul réservé aux campagnes `closed`/`paid`, jamais `active`.
6. Recalcul idempotent par union des clés bénéficiaire (crédits actifs ∪ versements existants).
7. Confirmé empiriquement : `accounting` peut écrire directement sur `payouts` et appeler le RPC, malgré un accès lecture seule dans l'interface admin — asymétrie intentionnelle, pas un bug.
8. Routage : `app/(admin)/versements` comme page liste (le cahier ne nomme qu'une route, sans sous-route ; aucune liste de campagnes par statut n'existait déjà).

## 6. Respect des règles non négociables
- Argent en centimes, arithmétique entière : ✅ (`amount_cents`/`fee_held_cents`, aucun `float`)
- Calcul de crédit / création de commande toujours atomiques : ✅ (inchangé — cette tâche ne touche jamais `order_credits` en écriture)
- Le crédit ne se déclenche que sur paiement confirmé : ✅ (inchangé, cette tâche lit `order_credits` existants)
- RLS activée, aucune table exposée sans policy : ✅ (`payouts`, `payout_status_log` couvertes)
- Toute modification post-hoc d'un versement validé tracée : ✅ (`payout_status_log`, INSERT-only, écrit par la fonction gardée à chaque transition)
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (suites unitaire et d'intégration complètes relancées, aucun échec)

## 7. Limites et risques

**Scénario chiffré (obligatoire pour les tâches sensibles — vérifiable directement dans `payouts`/`payout_status_log`/`order_credits`) :**

Campagne « Tournoi Été des Aigles », clôturée le 2026-06-20. Deux bénéficiaires ont des crédits :
- Thomas (athlète) : deux crédits `active` de 4 500 ¢ et 3 200 ¢ (= 7 700 ¢ / 77,00 $), plus un crédit `pending` de 1 000 ¢ qui n'est PAS encore compté.
- Les Aigles (équipe) : un crédit `active` de 12 000 ¢ (120,00 $).

1. L'admin lance le calcul (`recalculatePayoutsForCampaign`). Deux versements sont créés en statut `calculated` : Thomas à 7 700 ¢, Les Aigles à 12 000 ¢. Aucun versement existant → 2 `insert`, 0 `update`, 0 `skip_locked`.
2. À ce stade, le dashboard admin affiche 19 700 ¢ (7 700 + 12 000) de « crédits dus » (somme brute des versements non encore `paid`).
3. L'admin approuve Thomas (`calculated → approved`). Il tente de le marquer `paid` SANS fournir de preuve : refusé (`Une preuve de paiement (URL) est obligatoire...`), aucune ligne modifiée. Il refait l'appel avec `proofUrl = "https://exemple.test/recu-thomas.pdf"` : accepté, `paid_at` rempli, une ligne `payout_status_log` écrite (`from_status = approved`, `to_status = paid`). Montant net versé = 7 700 ¢ − 0 ¢ (`fee_held_cents`) = 7 700 ¢.
4. Le dashboard admin affiche maintenant 12 000 ¢ de crédits dus (19 700 − 7 700).
5. Pour Les Aigles, l'admin retient des frais de virement bancaire de 500 ¢ : transition `approved → adjusted` avec `newAmountCents = 12000` (montant brut inchangé) et `newFeeHeldCents = 500`, note obligatoire « Frais de virement bancaire retenus ». Puis `adjusted → paid` avec preuve. Montant net versé = 12 000 − 500 = 11 500 ¢.
6. Le dashboard admin affiche maintenant 0 ¢ de crédits dus (12 000 − 12 000, le montant BRUT étant soustrait, conformément à `summarizeCreditsDue`).
7. Si on relance `recalculatePayoutsForCampaign` après ces deux paiements (ex. un remboursement partiel ultérieur change les crédits actifs de Thomas), le plan retourne 2 actions `skip_locked` — aucun montant déjà validé n'est modifié silencieusement. Toute correction passerait par une nouvelle transition `adjusted`, avec raison obligatoire et trace d'audit.

Au-delà de ce scénario : aucun nouveau test e2e Playwright (même limitation réseau du bac à sable que les tâches précédentes) — couvert par les tests unitaires + intégration RLS contre un vrai Postgres embarqué. La page `app/(admin)/versements` n'affiche que les campagnes `closed`/`paid` ; une campagne encore `active` n'a aucun versement calculable, conformément au cahier. Rien d'autre à signaler.

## 8. Ce qu'il me faut de toi
Rien, je passe à la tâche suivante.

## 9. Prochaine tâche
1.5.11 — Export des commandes (admin).
