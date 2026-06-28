# Rapport — Tâche 0.2 : Migration du schéma de base de données

**Date :** 2026-06-19
**Statut :** ⚠️ Partiel

## 1. En une phrase
Le schéma complet et les données de démo sont prêts et validés sur un moteur PostgreSQL identique à celui de Supabase, mais **pas encore appliqués au vrai projet Supabase** (les identifiants viennent juste d'être reçus).

## 2. Ce que j'ai fait
- Copié `01-schema-base-de-donnees.sql` à l'identique dans `supabase/migrations/0001_initial_schema.sql` (aucune modification de la logique, vérifié par `diff`).
- Écrit `supabase/seed.sql` : club Corsaires, équipe U11 Hockey, 3 athlètes (dont 1 avec `hide_last_name=true`), 4 packs (Maison 35$/5$, Famille 60$/9$, Saison 120$/18$, Sport Propre 45$/6$), taux de taxe QC, 1 campagne d'équipe active objectif 5000$ — tous les montants en centimes.
- Écrit `lib/db/client.ts` (client Supabase typé) et `lib/db/types.ts` (types dérivés manuellement du schéma — voir limite ci-dessous).
- Écrit un test d'intégration qui applique migration + seed sur un PostgreSQL jetable (`embedded-postgres`, aucun droit root requis) et vérifie le résultat.
- Validé qu'aucune donnée masquée n'apparaît dans les comptages de base.

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| La migration s'applique sans erreur sur une base Supabase fraîche | ⚠️ | Validée sur PostgreSQL embarqué (même moteur SQL que Supabase) sans aucune erreur. **Pas encore testée sur le vrai projet Supabase** — les identifiants viennent d'être reçus, c'est la prochaine étape. |
| Les types TS sont générés et importables | ⚠️ | Types écrits à la main et importables (compilent en strict), mais pas générés par `supabase gen types typescript --linked` faute de projet connecté à ce moment — à refaire maintenant (voir DECISIONS.md). |
| Le seed crée les données décrites ; `v_campaign_progress` renvoie 0 amassé au départ | ✅ | Test d'intégration : 4 packs, 1 campagne active, 3 athlètes (1 masqué), `v_campaign_progress.raised_cents = 0` et `goal_cents = 500000` |

## 4. Tests
- Commande lancée : `npx vitest run`
- Résultat : 8 tests passés, 0 échoué (test d'intégration de cette tâche : 5/5 ; test unitaire de la tâche 0.1 : 3/3 — aucune régression)
- Couverture des cas limites argent : sans objet ici (le moteur de crédit arrive en 1.3) ; le seed lui-même est en centimes (vérifié : `goal_cents = 500000` pour 5000$).

## 5. Décisions prises en autonomie
Voir `docs/DECISIONS.md`, deux décisions propres à cette tâche :
- Taux de taxe QC stocké en une seule ligne combinée (1498 bps) plutôt qu'en deux (TPS+TVQ séparées), à cause de la contrainte `UNIQUE (province, effective_at)` du schéma fourni — je n'ai pas touché à cette contrainte.
- Types TypeScript écrits à la main en attendant un projet Supabase réel connecté.

## 6. Respect des règles non négociables
- Argent en centimes, arithmétique entière : ✅ (`goal_cents`, `fixed_credit_cents` etc., tout en `integer`)
- Crédit écrit uniquement sur paiement confirmé : s.o. (pas encore de paiement à cette tâche)
- RLS / confidentialité mineurs : s.o. (RLS arrive en 0.4) — mais le seed respecte déjà `hide_last_name`
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (le test de la tâche 0.1 passe toujours)

## 7. Limites et risques
Deux points à corriger maintenant que j'ai les identifiants Supabase réels (reçus aujourd'hui) :
1. Appliquer réellement la migration + le seed au projet Supabase « E-commerce_test ».
2. Régénérer `lib/db/types.ts` avec `supabase gen types typescript --linked` plutôt que les types écrits à la main.
Aucun des deux n'est un problème de sécurité, d'argent ou de données de mineurs — c'est pourquoi ce n'était pas dans QUESTIONS.md. Je m'en occupe dans la foulée de la tâche 0.3.

## 8. Ce qu'il me faut de toi
Rien de bloquant pour l'instant. Une seule question de sécurité arrive séparément : comment appliquer la migration à ta vraie base (toi via l'éditeur SQL Supabase, ou moi via le mot de passe direct de la base) — je te la pose juste après ce rapport.

## 9. Prochaine tâche
0.3 — Authentification et rôles.
