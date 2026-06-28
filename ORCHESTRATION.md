# ORCHESTRATION.md — Instructions pour Cowork

Ce fichier te dit (Cowork) comment piloter la construction de la plateforme. Tu
es le chef d'orchestre. Le code réel est écrit et testé via Claude Code dans le
sous-dossier `code/`. Toi, tu lis les plans, tu lances les tâches dans le bon
ordre, tu vérifies, et tu tiens le journal d'avancement.

## État actuel (2026-06-27)

Toutes les phases listées ci-dessous (0 et 1, 1.4, 1.6, 1.5) ainsi que la
refonte visuelle (V1 à V10) sont **terminées** — voir `docs/PROGRESS.md` pour
le détail. Les plans de tâches eux-mêmes sont archivés dans
`docs/archive/prompts/` (ils restent une référence historique utile, mais ne
décrivent plus du travail à faire). Le processus décrit ci-dessous reste la
méthode à appliquer pour tout nouveau lot de tâches.

## Fichiers de référence dans ce dossier

- `CLAUDE.md` — règles permanentes du projet (argent, sécurité, autonomie). Fais
  respecter ces règles à chaque étape. En cas de doute, c'est la source de vérité.
- `docs/README.md` — index complet de toute la documentation (vivante +
  archivée). À consulter si un chemin ci-dessous semble introuvable.
- `docs/schema-reference.sql` — le schéma de base de données à appliquer.
- `docs/archive/prompts/phase-0-et-1.md` — les 11 tâches à exécuter, dans
  l'ordre, avec leurs critères d'acceptation et leurs tests. (terminé)
- `docs/archive/prompts/phase-1-4.md` — Phase 1.4 : design UI/UX professionnel
  + mise en ligne sur Vercel. Faite APRÈS la Phase 1, AVANT la 1.6 et la 1.5.
  (terminé)
- `docs/archive/prompts/phase-1-6.md` — Phase 1.6 : UX des trois usagers
  (parent acheteur, responsable, athlète). Faite APRÈS la 1.4, AVANT la 1.5.
  (terminé)
- `docs/archive/prompts/phase-1-5.md` — Phase 1.5 : campagne pleinement
  opérationnelle. Faite EN DERNIER de ce groupe. (terminé)
- `docs/archive/prompts/07-prompts-refonte-visuelle.md` — Tâches V1 à V10 de la
  refonte visuelle. (terminé)
- `docs/archive/rapports/gabarit-rapport.md` — le gabarit de rapport utilisé
  pour les phases 0 à 1.4b. Convention superseded depuis la refonte visuelle
  (voir section suivante).
- `docs/cahier-des-charges.docx` — le cahier des charges complet (référence de
  fond).
- `code/` — où la plateforme est construite (Claude Code travaille ici).
- `docs/PROGRESS.md` — journal d'avancement (tu le tiens à jour).
- `docs/DECISIONS.md` — journal des petits choix faits en autonomie.
- `docs/QUESTIONS.md` — où tu écris les questions bloquantes pour moi.

## Comment tu travailles

1. Au début de chaque session, lis `docs/PROGRESS.md` pour savoir où on en est.
2. Prends la PROCHAINE tâche non terminée, dans l'ordre, en suivant la séquence
   des phases (toutes terminées à ce jour, conservées ici comme modèle pour la
   prochaine série de tâches) :
   a. `docs/archive/prompts/phase-0-et-1.md` (tâches 0.1 → 1.7) — fondations +
      flux vendable
   b. `docs/archive/prompts/phase-1-4.md` (1.4.1 → 1.4.6) — design + mise en
      ligne
   c. `docs/archive/prompts/phase-1-6.md` (blocs A, puis B, puis C) — UX des
      usagers
   d. `docs/archive/prompts/phase-1-5.md` (1.5.1 → 1.5.11) — campagne
      opérationnelle
   e. `docs/archive/prompts/07-prompts-refonte-visuelle.md` (V1 → V10) —
      refonte visuelle complète
   Ne saute jamais une tâche : l'ordre respecte les dépendances et les priorités
   (on rend les parcours d'achat et de création excellents AVANT d'ajouter les
   dashboards et rapports par-dessus).

   CHEVAUCHEMENT 1.6 ↔ 1.5 à connaître : certaines tâches de la 1.6 réutilisent des
   éléments fabriqués en 1.5 (ex: l'écran « prochaines actions » du responsable,
   tâche 1.6.B3, utilise les affiches de la tâche 1.5.2). Comme la 1.6 vient AVANT
   la 1.5, construis à ce moment-là une version MINIMALE et fonctionnelle de
   l'élément requis (ex: une affiche simple), et note-le dans `docs/DECISIONS.md`.
   La tâche 1.5 correspondante l'enrichira ensuite — NE la refais pas de zéro,
   étends l'existant. Objectif : ne pas faire le travail deux fois.
3. Confie la tâche à Claude Code dans `code/`, en lui donnant le prompt complet
   de la tâche (contexte, objectif, fichiers, règles, critères, tests).
4. Quand Claude Code dit avoir fini : lance les tests (`npm test`). Tant que les
   tests ne passent pas, la tâche n'est PAS terminée — fais corriger.
5. Quand les tests passent et que les critères d'acceptation de la tâche sont
   remplis : fais un commit, coche la tâche dans `docs/PROGRESS.md`.
6. **Documente la tâche.** Pour les phases 0 à 1.4b, ceci voulait dire produire
   un rapport complet suivant `docs/archive/rapports/gabarit-rapport.md` dans
   `docs/archive/rapports/RAPPORT-<numéro>.md`. **Depuis la refonte visuelle
   (V1 et suivantes), cette convention a été remplacée** par une entrée datée
   directement dans `docs/DECISIONS.md` (raisonnement et choix faits) et une
   mise à jour de `docs/PROGRESS.md` (état d'avancement) — plus léger, sans
   fichier RAPPORT séparé par tâche. Continue avec cette approche allégée pour
   les nouvelles tâches, sauf si on convient explicitement de revenir au
   format RAPPORT complet.
7. Si une question bloquante se pose en cours de tâche (voir critères
   ci-dessous), ARRÊTE-TOI et attends ma réponse. Sinon, passe à la tâche
   suivante.
8. Continue tâche après tâche, de façon autonome, sans me redemander à chaque
   étape — sauf pour les questions bloquantes.

## Quand t'arrêter et me demander (et SEULEMENT dans ces cas)

Suis la section 9 du `CLAUDE.md`. Tu t'arrêtes et tu écris UNE question claire
dans `docs/QUESTIONS.md` (et tu me la fais parvenir) uniquement si :
- (a) un choix engage l'argent, la sécurité, ou les données de mineurs ;
- (b) deux interprétations du cahier des charges sont également plausibles ET
  incompatibles entre elles ;
- (c) il manque un secret ou un accès que tu ne peux pas obtenir seul.

Dans tous les autres cas : prends la décision la plus raisonnable, code-la,
note-la dans `docs/DECISIONS.md`, et continue. Ne t'arrête jamais pour un choix
mineur.
