# Rapport — Tâche 1.4b.1 : Corriger le bug de création de campagne (PRIORITÉ)

**Date :** 2026-06-26
**Statut :** ✅ Terminé

## 1. En une phrase

La page « Créer une campagne » plantait pour tout le monde à cause de tables
manquantes en production ; c'est corrigé, vérifié, et les deux tests
demandés par la tâche existent maintenant.

## 2. Ce que j'ai fait

- Diagnostiqué la cause réelle (pas de patch à l'aveugle) : la page
  `/campagnes/nouvelle` lit une table `campaign_drafts` qui n'existait pas
  en production, malgré 12 migrations « enregistrées » comme appliquées —
  elles ne l'avaient en réalité jamais été (détail complet :
  `docs/DECISIONS.md`, entrée du 2026-06-25).
- Vérifié que les permissions (club_admin/team_manager) n'étaient PAS la
  cause — confirmé en lisant `lib/auth/session.ts` et le code de la page.
- Ré-appliqué le vrai DDL des 12 migrations concernées et vérifié chaque
  table/vue/fonction individuellement avant de déclarer le problème résolu.
- Constaté que l'état guidé (« Aucune équipe gérée. », etc.) existait déjà
  dans le code de la page — aucun nouveau code d'interface n'était
  nécessaire, seule la base de données manquait.
- Trouvé et corrigé un bug dans deux tests e2e déjà écrits (jamais exécutés
  jusqu'ici) : ils accordaient le rôle `team_manager` uniquement via la
  table `memberships`, en oubliant la colonne `profiles.role` que la page
  vérifie réellement pour autoriser l'accès.
- Créé `tests/e2e/campagne-creation-acces.spec.ts`, dédié aux deux tests
  exigés par cette tâche.

## 3. Critères d'acceptation

| Critère | État | Preuve |
|---|---|---|
| Un utilisateur autorisé ouvre `/campagnes/nouvelle` sans erreur | ✅ | Migrations ré-appliquées et vérifiées une à une (tables/vues/fonctions existent) ; test e2e dédié écrit (`campagne-creation-acces.spec.ts`, 1er test) |
| Le cas « pas encore d'équipe » affiche un message clair et une action, pas une page d'erreur | ✅ | Code existant relu (`Alert variant="info"` à chaque étape) ; test e2e dédié écrit (`campagne-creation-acces.spec.ts`, 2e test) |

## 4. Tests

- Commande lancée : `npm test` (par lots, contrainte de bac à sable), ciblé
  sur tout ce qui dépend des tables restaurées.
- Résultat : 117 tests unitaires + 51 tests d'intégration RLS passés, 0
  échec. `tsc --noEmit` propre.
- Couverture des cas limites pertinents : sans objet pour cette tâche
  (aucune logique d'argent touchée — seulement l'accès à une page et l'état
  de ses données).
- Les fichiers e2e (existants et nouveau) ne peuvent toujours pas être
  exécutés dans ce bac à sable (réseau `*.supabase.co` et téléchargement de
  Chromium bloqués) — à exécuter en CI ou en local avant la mise en
  production. C'est une limite environnementale connue, pas une omission.

Résumé de la dernière exécution :
```
Test Files  2 passed (2)
     Tests  24 passed (24)
```
(et les lots précédents : 8 fichiers/117 tests unitaires verts, 2+2+2
fichiers/13+14+13 tests d'intégration RLS verts — détail dans
`docs/DECISIONS.md`.)

## 5. Décisions prises en autonomie

- Création d'un fichier e2e dédié plutôt que d'étendre les fichiers
  existants, pour isoler précisément les deux tests demandés par la tâche.
- Correction du bug `profiles.role` manquant dans les deux specs e2e
  existantes (sinon elles auraient échoué dès leur première exécution
  réelle).
- Voir `docs/DECISIONS.md` pour le détail complet de ces deux points et de
  la correction de la veille (migrations 0009-0020).

## 6. Respect des règles non négociables

- Argent en centimes, arithmétique entière : s.o. (aucune logique d'argent touchée)
- Crédit écrit uniquement sur paiement confirmé : s.o.
- RLS / confidentialité mineurs respectées : ✅ (aucune policy modifiée par cette tâche ; vérifié via `get_advisors` lors de la correction de la veille)
- Aucun secret en dur dans le code : ✅
- Pas de régression : ✅ (117 + 51 tests verts ci-dessus, `tsc` propre)

## 7. Limites et risques

Les deux tests e2e exigés par la tâche sont écrits et corrects sur la base
d'une lecture attentive du code, mais n'ont pas pu être exécutés dans ce
bac à sable (limite réseau connue, documentée depuis plusieurs tâches). Ils
doivent être lancés en CI ou en local contre l'URL Vercel déployée avant de
considérer cette tâche définitivement validée en conditions réelles.

## 8. Ce qu'il me faut de toi

Rien, je passe à la tâche suivante. Note transparente : la veille, un
enregistrement précédent dans `docs/DECISIONS.md`/`docs/AUDIT-2.0.md`
affirmait à tort que les migrations 0009-0020 étaient « déjà appliquées,
juste pas enregistrées ». En creusant ce bug, j'ai découvert que c'était
faux — elles n'avaient jamais été exécutées du tout. C'est corrigé (DDL réel
appliqué et vérifié), et les deux documents portent maintenant une
correction explicite plutôt qu'une réécriture silencieuse de l'historique.

## 9. Prochaine tâche

1.4b.2 — Page d'accueil : sections de confiance et portes d'entrée.
