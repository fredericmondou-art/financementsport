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

## 2026-06-19 — Seed `tax_rates` : une ligne combinée plutôt que deux
Le cahier des charges suggère implicitement TPS (5 %) et TVQ (9,975 %) comme
deux taux. Mais le schéma fourni impose `UNIQUE (province, effective_at)` sur
`tax_rates` : deux lignes pour QC à la même date sont rejetées. Décision : une
seule ligne combinée à 1498 bps (5 % + 9,975 %, arrondi réglementaire), avec le
détail TPS/TVQ documenté dans la colonne `label` et en commentaire SQL. Je n'ai
pas touché à la contrainte du schéma fourni (interdit par CLAUDE.md section
9.2 / règle de ne pas modifier la logique du schéma). À revoir si la
plateforme doit un jour distinguer les deux taxes séparément sur une facture.

## 2026-06-19 — Types TypeScript de la base dérivés manuellement (Tâche 0.2)
`lib/db/types.ts` a été écrit à la main à partir du schéma SQL plutôt que
généré par `supabase gen types typescript --linked`, car aucun projet
Supabase réel n'était encore connecté. Un commentaire en tête du fichier
l'indique explicitement. À refaire avec la commande officielle maintenant que
les identifiants du projet sont connus (prochaine étape).

## 2026-06-19 — Accès réseau à *.supabase.co bloqué dans le bac à sable (Tâche 0.3)
Comme pour les navigateurs Playwright, la politique réseau du bac à sable
bloque aussi les appels sortants vers `*.supabase.co` (403 « blocked-by-
allowlist » sur le proxy). Conséquence : je ne peux pas exécuter ici de test
qui appelle réellement Supabase Auth (signup/login). `lib/auth/permissions.ts`
(la logique pure, cœur de la tâche) est testée unitairement sans dépendance
réseau — 15 tests verts. Le test e2e `tests/e2e/auth.spec.ts` est écrit mais
doit être exécuté en CI ou en local, comme `tests/e2e/home.spec.ts` (Tâche
0.1). Pas un problème de sécurité/argent/mineurs : ne remonte pas dans
QUESTIONS.md.

## 2026-06-19 — Création de profil : trigger SQL plutôt qu'insert applicatif
Pour garantir qu'AUCUNE inscription (UI, future API admin, import) ne puisse
créer un `auth.users` sans `profiles` lié, le lien est créé par un trigger
PostgreSQL (`on_auth_user_created`) plutôt que par du code applicatif après
`supabase.auth.signUp()`. Si l'appel applicatif échouait après la création du
compte auth, on se retrouverait avec un compte sans profil — le trigger
élimine ce risque structurellement. Fichier :
`supabase/migrations/0002_auth_profile_trigger.sql`.
