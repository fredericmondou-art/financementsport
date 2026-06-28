# Questions bloquantes pour Frédéric

Ce fichier ne contient que des questions au sens de la section 9 de CLAUDE.md :
argent, sécurité, données de mineurs, ambiguïté du cahier des charges, ou accès/
secret manquant.

## Résolu — 2026-06-27 : nouvelle direction visuelle (refonte, Tâche V1)
Frédéric a fourni deux nouveaux documents (`docs/DESIGN.md` v2 + `docs/archive/
prompts/07-prompts-refonte-visuelle.md`) qui **remplacent** la direction
visuelle v1 (validée 2026-06-22, archivée dans
`docs/archive/design/DESIGN-v1-archive.md`). Conflit
signalé et confirmé par Frédéric : on remplace. Aperçu produit à
`/styleguide-refonte` (palette, 2 paires de polices réelles, composants,
maquette de héros). Réponses de Frédéric aux 2 choix ouverts (via
`AskUserQuestion`, 2026-06-27) :
1. **Registre** → **Tutoiement** partout sur le site.
2. **Police des titres** → **Bricolage Grotesque** (corps en Inter, Option A
   de l'aperçu).

`docs/DESIGN.md` mis à jour pour refléter ces choix comme définitifs (plus de
mention « à confirmer »). Correction WCAG AA (5 combinaisons texte blanc / fond
échouaient l'AA, calcul détaillé dans `docs/DECISIONS.md`) intégrée à la
section 2 de `docs/DESIGN.md` : texte blanc uniquement sur `primary-700`,
`secondary-700` ou `info` ; `warning` toujours en fond clair + texte foncé.
La Tâche V2 (système de design : tokens + composants) peut démarrer.

## Résolu — 2026-06-22 : validation de la direction visuelle (Tâche 1.4.1)
Frédéric a approuvé `docs/DESIGN.md` et les 3 maquettes sans modification
(« Oui c'est parfait »). La Tâche 1.4.2 (système de design) démarre.

## Résolu — 2026-06-19 : identifiants Supabase
Frédéric a fourni l'URL du projet, la clé publishable et la clé secrète.
Stockées dans code/.env.local (jamais commité, voir .gitignore). Le projet
utilise le nouveau système de clés Supabase (publishable/secret) plutôt que les
anciennes anon/service_role — fonctionnellement équivalentes, mappées sur les
mêmes variables d'environnement (voir DECISIONS.md).
