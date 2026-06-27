# Questions bloquantes pour Frédéric

Ce fichier ne contient que des questions au sens de la section 9 de CLAUDE.md :
argent, sécurité, données de mineurs, ambiguïté du cahier des charges, ou accès/
secret manquant.

## Ouvert — 2026-06-26 : nouvelle direction visuelle (refonte, Tâche V1)
Frédéric a fourni deux nouveaux documents (`docs/DESIGN.md` v2 + `docs/prompts/
07-prompts-refonte-visuelle.md`) qui **remplacent** la direction visuelle v1
(validée 2026-06-22, archivée dans `docs/DESIGN-v1-archive.md`). Conflit
signalé et confirmé par Frédéric : on remplace. Aperçu produit à
`/styleguide-refonte` (palette, 2 paires de polices réelles, composants,
maquette de héros). Deux choix encore ouverts avant d'appliquer au reste du
site (règle explicite de la Tâche V1) :
1. **Registre tu/vous** — la direction v1 avait fixé le vouvoiement par
   défaut ; cette nouvelle proposition illustre ses exemples au tutoiement.
   Lequel retenir, partout sur le site ?
2. **Police des titres** — Bricolage Grotesque ou Fraunces (chargées et
   comparées sur `/styleguide-refonte`), ou Clash Display (demanderait un
   auto-hébergement séparé, non disponible via Google Fonts) ?

Constat technique additionnel (pas un choix à faire, juste signalé) : 5
combinaisons texte blanc / fond de la palette proposée échouent le contraste
WCAG AA pour du texte normal (primary-500 2.86:1, primary-600 3.81:1,
secondary-500/success 3.37:1, warning 2.30:1, danger 4.27:1 — détail calculé
dans `docs/DECISIONS.md`). Recommandation appliquée dans l'aperçu : boutons
pleins en `primary-700` (5.60:1, AA) plutôt que `primary-600` ; `warning` en
fond clair + texte foncé comme l'était l'ambre de la v1. À valider avec le
reste si cette correction convient.

## Résolu — 2026-06-22 : validation de la direction visuelle (Tâche 1.4.1)
Frédéric a approuvé `docs/DESIGN.md` et les 3 maquettes sans modification
(« Oui c'est parfait »). La Tâche 1.4.2 (système de design) démarre.

## Résolu — 2026-06-19 : identifiants Supabase
Frédéric a fourni l'URL du projet, la clé publishable et la clé secrète.
Stockées dans code/.env.local (jamais commité, voir .gitignore). Le projet
utilise le nouveau système de clés Supabase (publishable/secret) plutôt que les
anciennes anon/service_role — fonctionnellement équivalentes, mappées sur les
mêmes variables d'environnement (voir DECISIONS.md).
