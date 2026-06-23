# ORCHESTRATION.md — Instructions pour Cowork

Ce fichier te dit (Cowork) comment piloter la construction de la plateforme. Tu
es le chef d'orchestre. Le code réel est écrit et testé via Claude Code dans le
sous-dossier `code/`. Toi, tu lis les plans, tu lances les tâches dans le bon
ordre, tu vérifies, et tu tiens le journal d'avancement.

## Fichiers de référence dans ce dossier

- `CLAUDE.md` — règles permanentes du projet (argent, sécurité, autonomie). Fais
  respecter ces règles à chaque étape. En cas de doute, c'est la source de vérité.
- `01-schema-base-de-donnees.sql` — le schéma de base de données à appliquer.
- `03-prompts-phase-0-et-1.md` — les 11 tâches à exécuter, dans l'ordre, avec
  leurs critères d'acceptation et leurs tests.
- `02-prompts-phase-1-4.md` — Phase 1.4 : design UI/UX professionnel + mise en
  ligne sur Vercel. À faire APRÈS la Phase 1, AVANT la 1.6 et la 1.5.
- `docs/prompts/phase-1-6.md` — Phase 1.6 : UX des trois usagers (parent
  acheteur, responsable, athlète). À faire APRÈS la 1.4, AVANT la 1.5.
- `04-prompts-phase-1-5.md` — Phase 1.5 : campagne pleinement opérationnelle.
  À faire EN DERNIER de ce groupe.
- `RAPPORTS.md` — le gabarit du rapport que tu produis après chaque tâche.
- `ecommerce.docx` — le cahier des charges complet (référence de fond).
- `code/` — où la plateforme est construite (Claude Code travaille ici).
- `PROGRESS.md` — journal d'avancement (tu le tiens à jour).
- `DECISIONS.md` — journal des petits choix faits en autonomie.
- `QUESTIONS.md` — où tu écris les questions bloquantes pour moi.

## Comment tu travailles

1. Au début de chaque session, lis `PROGRESS.md` pour savoir où on en est.
2. Prends la PROCHAINE tâche non terminée, dans l'ordre, en suivant la séquence
   des phases :
   a. `03-prompts-phase-0-et-1.md` (tâches 0.1 → 1.7) — fondations + flux vendable
   b. `02-prompts-phase-1-4.md` (1.4.1 → 1.4.6) — design + mise en ligne
   c. `docs/prompts/phase-1-6.md` (blocs A, puis B, puis C) — UX des usagers
   d. `04-prompts-phase-1-5.md` (1.5.1 → 1.5.11) — campagne opérationnelle
   Ne saute jamais une tâche : l'ordre respecte les dépendances et les priorités
   (on rend les parcours d'achat et de création excellents AVANT d'ajouter les
   dashboards et rapports par-dessus).

   CHEVAUCHEMENT 1.6 ↔ 1.5 à connaître : certaines tâches de la 1.6 réutilisent des
   éléments fabriqués en 1.5 (ex: l'écran « prochaines actions » du responsable,
   tâche 1.6.B3, utilise les affiches de la tâche 1.5.2). Comme la 1.6 vient AVANT
   la 1.5, construis à ce moment-là une version MINIMALE et fonctionnelle de
   l'élément requis (ex: une affiche simple), et note-le dans `DECISIONS.md`. La
   tâche 1.5 correspondante l'enrichira ensuite — NE la refais pas de zéro, étends
   l'existant. Objectif : ne pas faire le travail deux fois.
3. Confie la tâche à Claude Code dans `code/`, en lui donnant le prompt complet
   de la tâche (contexte, objectif, fichiers, règles, critères, tests).
4. Quand Claude Code dit avoir fini : lance les tests (`npm test`). Tant que les
   tests ne passent pas, la tâche n'est PAS terminée — fais corriger.
5. Quand les tests passent et que les critères d'acceptation de la tâche sont
   remplis : fais un commit, coche la tâche dans `PROGRESS.md`.
6. **Produis le rapport de la tâche** en suivant le gabarit de `RAPPORTS.md` :
   écris-le dans `rapports/RAPPORT-<numéro>.md` ET présente-le-moi dans la
   conversation. Ce rapport est OBLIGATOIRE après chaque tâche, sans exception.
7. Si la section 8 du rapport (« Ce qu'il me faut de toi ») contient une demande
   bloquante, ARRÊTE-TOI et attends ma réponse. Sinon, passe à la tâche suivante.
8. Continue tâche après tâche, de façon autonome, sans me redemander à chaque
   étape — sauf pour les rapports, que tu produis toujours.

## Quand t'arrêter et me demander (et SEULEMENT dans ces cas)

Suis la section 9 du `CLAUDE.md`. Tu t'arrêtes et tu écris UNE question claire
dans `QUESTIONS.md` (et tu me la fais parvenir) uniquement si :
- (a) un choix engage l'argent, la sécurité, ou les données de mineurs ;
- (b) deux interprétations du cahier des charges sont également plausible