# Journal des décisions autonomes

Ce fichier consigne les choix mineurs pris sans validation, conformément à la
section 9 de CLAUDE.md. Format : date — contexte — décision — raison.

## 2026-06-19 — Environnement de développement
Le dossier de travail sélectionné par l'utilisateur (mount Windows) présente un
problème de synchronisation cache/fichiers lorsqu'on y exécute `git init` ou des
opérations rapides de création/renommage de fichiers (corruption observée de
`.git/config`, incohérences de lecture). Décision : construire et initialiser
le dépôt git dans le bac à sable Linux, puis le copier en bloc (`cp -r`) dans le
dossier du projet, où les opérations git normales (add/commit/status) restent
stables. Les builds Next.js, `npm install` et l'exécution des tests se feront
également dans le bac à sable, avec synchronisation du code source (hors
`node_modules`, `.next`) vers le dossier du projet après chaque tâche validée.

## 2026-06-19 — Test e2e Playwright non exécuté en sandbox
Le téléchargement des navigateurs Playwright (`playwright install`) est bloqué
par la politique réseau du bac à sable (403 sur cdn.playwright.dev, sudo
indisponible). Le test e2e de la Tâche 0.1 (`tests/e2e/home.spec.ts`) est écrit
et la configuration Playwright est valide (`npx playwright test --list` le
reconnaît), mais n'a pas pu être exécuté réellement ici. Décision : continuer
sans bloquer sur ce point — ce test devra être exécuté en CI (GitHub Actions a
l'accès réseau nécessaire) ou en local avant la mise en prod. Pas un problème
de sécurité, d'argent ou de données de mineurs : ne remonte pas dans
QUESTIONS.md.

## 2026-06-19 — Nouveau système de clés API Supabase
Supabase a remplacé les clés JWT `anon`/`service_role` par des clés
`sb_publishable_...` / `sb_secret_...` (fonctionnellement équivalentes, mêmes
usages : publishable = navigateur + RLS, secret = serveur, contourne RLS).
Frédéric a fourni des clés du nouveau format. Décision : les mapper directement
sur les variables d'environnement existantes (`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) sans renommer — `@supabase/supabase-js` les
accepte de façon interchangeable dans `createClient()`. Pas d'impact sur le
code applicatif.
