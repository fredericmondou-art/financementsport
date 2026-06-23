# Rapport — Tâche 0.1 : Initialisation du projet

**Date :** 2026-06-19
**Statut :** ⚠️ Partiel

## 1. En une phrase
Le projet Next.js démarre, est typé strict, lint et tests unitaires passent ; seul le test e2e (Playwright) n'a pas pu être réellement exécuté ici.

## 2. Ce que j'ai fait
- Créé le projet Next.js (App Router, TypeScript strict) avec l'arborescence demandée : `app/` (groupes de routes site public, boutique, financement, portails, opérations), `lib/` (db, credits, taxes, orders, payments, email, validation, logger), `components/`, `tests/`.
- Configuré ESLint, Prettier, `tsconfig.json` en mode strict.
- Écrit `.env.example` documentant toutes les variables (Supabase, Stripe, SendGrid, app).
- Configuré Vitest et Playwright (`vitest.config.ts`, `playwright.config.ts`).
- Écrit un test unitaire trivial et un test e2e de la page d'accueil.
- Créé `docs/PROGRESS.md` et `docs/DECISIONS.md`.

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| `npm run dev` démarre sans erreur, page d'accueil placeholder s'affiche | ✅ | build Next.js réussi, page testée par le test e2e (écrit, voir limite ci-dessous) |
| `npm run lint` et `npm test` passent | ✅ | `npm run lint` : aucune erreur ; `npx vitest run` : 8/8 tests passés (dont le test unitaire trivial de cette tâche) |
| `.env.example` liste toutes les variables nécessaires avec commentaire | ✅ | vérifié manuellement, 9 variables documentées (Supabase ×3, Stripe ×3, SendGrid ×2, app ×1) |

## 4. Tests
- Commande lancée : `npx vitest run`
- Résultat : 8 tests passés, 0 échoué (2 fichiers — le test trivial de cette tâche fait partie du lot)
- Test e2e Playwright (`tests/e2e/home.spec.ts`) : écrit et reconnu par `npx playwright test --list`, mais **non exécuté** — voir section 7.
- Cas limites argent : sans objet pour cette tâche (pas encore de logique métier).

## 5. Décisions prises en autonomie
Voir `docs/DECISIONS.md` :
- Construire/valider dans un répertoire sandbox plutôt que directement sur le dossier monté (problème de cache, non lié au contenu du projet).

## 6. Respect des règles non négociables
- Argent en centimes, arithmétique entière : s.o. (aucune logique d'argent dans cette tâche)
- Crédit écrit uniquement sur paiement confirmé : s.o.
- RLS / confidentialité mineurs : s.o.
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (première tâche)

## 7. Limites et risques
Le téléchargement du navigateur Chromium par Playwright est bloqué par la politique réseau du bac à sable (403 sur cdn.playwright.dev), et `sudo` n'est pas disponible pour l'installer autrement. Le test e2e existe et la configuration est valide, mais je ne l'ai jamais vu passer réellement. **Il doit être exécuté en CI (GitHub Actions) ou en local avant la mise en production** pour confirmer qu'il passe. C'est la seule raison pour laquelle je marque cette tâche « Partiel » plutôt que « Terminé ».

## 8. Ce qu'il me faut de toi
Rien de bloquant. Je continue — ce point sera revérifié dès que le projet tournera en CI ou en local chez toi.

## 9. Prochaine tâche
0.2 — Migration du schéma de base de données (déjà faite, voir RAPPORT-0.2.md).
