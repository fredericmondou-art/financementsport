# Questions bloquantes pour Frédéric

Ce fichier ne contient que des questions au sens de la section 9 de CLAUDE.md :
argent, sécurité, données de mineurs, ambiguïté du cahier des charges, ou accès/
secret manquant.

## En attente — 2026-06-22 : validation de la direction visuelle (Tâche 1.4.1)

La Tâche 1.4.1 du fichier `02-prompts-phase-1-4.md` impose explicitement un
arrêt avant application : « Proposer, NE PAS imposer (...) ARRÊTER et demander
validation humaine (...) Ne pas appliquer au site tant que l'humain n'a pas
approuvé. » Je m'arrête donc ici, avant la Tâche 1.4.2.

**À valider :**
- `docs/DESIGN.md` — palette (avec contrastes WCAG calculés), typographie
  (Outfit/Inter), espacement, rayons, ombres, ton éditorial.
- `docs/maquettes/accueil.html`, `athlete.html`, `panier.html` — à ouvrir
  directement dans un navigateur pour prévisualiser (fichiers autonomes, hors
  de l'application Next.js, aucun impact sur le site actuel).

**Trois façons de répondre :**
1. « Approuvé » → je passe à la Tâche 1.4.2 (système de design) sans autre
   question.
2. Des ajustements précis (couleur, ton, mise en page) → je les applique puis
   représente les maquettes avant de continuer.
3. Une direction différente → décrivez-la et je recommence la proposition.

Tant que cette question reste ouverte, les Tâches 1.4.2 à 1.4.6 restent en
pause (voir la liste de tâches).

## Résolu — 2026-06-19 : identifiants Supabase
Frédéric a fourni l'URL du projet, la clé publishable et la clé secrète.
Stockées dans code/.env.local (jamais commité, voir .gitignore). Le projet
utilise le nouveau système de clés Supabase (publishable/secret) plutôt que les
anciennes anon/service_role — fonctionnellement équivalentes, mappées sur les
mêmes variables d'environnement (voir DECISIONS.md).
