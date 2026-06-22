# Questions bloquantes pour Frédéric

Ce fichier ne contient que des questions au sens de la section 9 de CLAUDE.md :
argent, sécurité, données de mineurs, ambiguïté du cahier des charges, ou accès/
secret manquant.

## Résolu — 2026-06-22 : validation de la direction visuelle (Tâche 1.4.1)
Frédéric a approuvé `docs/DESIGN.md` et les 3 maquettes sans modification
(« Oui c'est parfait »). La Tâche 1.4.2 (système de design) démarre.

## Résolu — 2026-06-19 : identifiants Supabase
Frédéric a fourni l'URL du projet, la clé publishable et la clé secrète.
Stockées dans code/.env.local (jamais commité, voir .gitignore). Le projet
utilise le nouveau système de clés Supabase (publishable/secret) plutôt que les
anciennes anon/service_role — fonctionnellement équivalentes, mappées sur les
mêmes variables d'environnement (voir DECISIONS.md).
