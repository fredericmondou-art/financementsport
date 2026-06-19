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
- `ecommerce.docx` — le cahier des charges complet (référence de fond).
- `code/` — où la plateforme est construite (Claude Code travaille ici).
- `PROGRESS.md` — journal d'avancement (tu le tiens à jour).
- `DECISIONS.md` — journal des petits choix faits en autonomie.
- `QUESTIONS.md` — où tu écris les questions bloquantes pour moi.

## Comment tu travailles

1. Au début de chaque session, lis `PROGRESS.md` pour savoir où on en est.
2. Prends la PROCHAINE tâche non terminée de `03-prompts-phase-0-et-1.md`, dans
   l'ordre. Ne saute jamais une tâche : l'ordre respecte les dépendances.
3. Confie la tâche à Claude Code dans `code/`, en lui donnant le prompt complet
   de la tâche (contexte, objectif, fichiers, règles, critères, tests).
4. Quand Claude Code dit avoir fini : lance les tests (`npm test`). Tant que les
   tests ne passent pas, la tâche n'est PAS terminée — fais corriger.
5. Quand les tests passent et que les critères d'acceptation de la tâche sont
   remplis : fais un commit, coche la tâche dans `PROGRESS.md`, passe à la suivante.
6. Continue tâche après tâche, de façon autonome, sans me redemander à chaque
   étape.

## Quand t'arrêter et me demander (et SEULEMENT dans ces cas)

Suis la section 9 du `CLAUDE.md`. Tu t'arrêtes et tu écris UNE question claire
dans `QUESTIONS.md` (et tu me la fais parvenir) uniquement si :
- (a) un choix engage l'argent, la sécurité, ou les données de mineurs ;
- (b) deux interprétations du cahier des charges sont également plausibles et
  incompatibles ;
- (c) il te manque un secret ou un accès que tu ne peux pas obtenir seul (clé
  Stripe, clé SendGrid, identifiants Supabase, etc.).

Pour tout choix mineur : prends la décision la plus raisonnable, code-la, et
note-la dans `DECISIONS.md`. Ne me dérange pas pour ça.

## Règles que tu ne contournes jamais

- Aucune tâche touchant l'argent n'est « faite » sans tests qui couvrent les cas
  limites (montant 0, arrondi de répartition, campagne inactive, remboursement).
- Le crédit n'est écrit que sur paiement Stripe confirmé par webhook, jamais avant.
- RLS activée sur toutes les tables ; aucune donnée de mineur masquée n'est
  jamais exposée publiquement.
- Aucun secret (clé Stripe/SendGrid/Supabase) écrit en dur dans le code ou
  commité. Si une tâche en a besoin, demande-le-moi via `QUESTIONS.md`.

## Format de PROGRESS.md (à créer si absent)

```
# Avancement

## Terminé
- [x] 0.1 Initialisation du projet (tests verts, commit abc123)

## En cours
- [ ] 0.2 Migration du schéma — étape : génération des types

## À venir
- [ ] 0.3 Authentification et rôles
- [ ] ... (reste des tâches)
```

## Première session

Si rien n'est encore fait : commence par vérifier que Claude Code est disponible
dans `code/`, puis lance la TÂCHE 0.1. Avant de lancer la 0.2, tu auras
probablement besoin des identifiants Supabase — demande-les-moi dans
`QUESTIONS.md` à ce moment-là, pas avant.

Ne lance jamais plusieurs tâches en parallèle : une à la fois, dans l'ordre,
chacune verte avant la suivante.
