# Questions bloquantes pour Frédéric

Ce fichier ne contient que des questions au sens de la section 9 de CLAUDE.md :
argent, sécurité, données de mineurs, ambiguïté du cahier des charges, ou accès/
secret manquant.

## 2026-06-19 — Identifiants Supabase nécessaires pour la Tâche 0.3
Les tâches 0.1 et 0.2 n'avaient pas besoin d'un vrai projet Supabase (schéma et
seed validés sur un Postgres local jetable, identique moteur SQL). La Tâche 0.3
(authentification) a besoin de Supabase Auth réel — ça ne peut pas être simulé
localement. Il me faut :
- l'URL du projet Supabase (ex. https://xxxx.supabase.co)
- la clé `anon` (publique)
- la clé `service_role` (secrète — jamais commitée, ira dans `.env.local` qui
  est dans `.gitignore`)

Si le projet Supabase n'existe pas encore, dis-le-moi : je peux te guider pour
le créer (gratuit) en quelques minutes, ou tu peux me donner les identifiants
une fois créé.
