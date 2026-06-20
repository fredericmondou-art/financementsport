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

## 2026-06-19 — Bug découvert : interaction seed.sql / trigger 0002 (Tâche 0.4)
En validant la Tâche 0.4 sur Postgres embarqué (migrations 0001→0002→0003 puis
seed, dans l'ordre réel de déploiement), `seed.sql` échouait : son
`INSERT INTO auth.users (id)` (sans email) déclenche désormais le trigger
`on_auth_user_created` (Tâche 0.3) qui crée immédiatement un `profiles` avec
`email = NULL` — violation de la contrainte NOT NULL — avant même que l'INSERT
explicite suivant dans `profiles` ne s'exécute. Et même corrigé, ce dernier
INSERT (sans `ON CONFLICT`) aurait ensuite échoué en doublon sur `id`, puisque
le trigger aurait déjà créé la ligne. Décision : (1) fournir un `email` réel
dans l'INSERT `auth.users` du seed, et (2) ajouter
`ON CONFLICT (id) DO UPDATE SET ...` à l'INSERT `profiles` du seed, pour que
celui-ci reste la source de vérité finale (rôle, consentements) et reste
idempotent, que le trigger existe ou non. Corrigé dans
`supabase/seed.sql`. Ce bug n'était pas visible aux tâches 0.2/0.3 car leurs
tests n'appliquaient jamais la migration 0002 avant le seed dans le même
parcours — c'est la Tâche 0.4 qui, en testant le déploiement complet, l'a
révélé. Pas un problème de sécurité/argent, mais aurait cassé un futur
re-seed du vrai projet Supabase une fois le trigger collé.

## 2026-06-19 — Politiques RLS : vues publiques plutôt qu'accès direct anon (Tâche 0.4)
Toutes les 24 tables ont RLS activé sans aucune policy `anon` directe sur les
tables sensibles (athletes, profiles, orders, order_credits, campaigns, etc.) :
le visiteur anonyme n'a accès qu'aux vues `v_public_athlete`, `v_public_team`,
`v_public_club` (qui respectent les `hide_*`) et aux vues d'agrégat déjà
existantes (`v_campaign_progress`, `v_beneficiary_credit_totals`), créées par
un rôle `BYPASSRLS` et accordées en `SELECT` à `anon`/`authenticated` — le
mécanisme standard Supabase pour exposer une lecture publique filtrée
sans jamais accorder de SELECT direct sur les tables de base. Lacune
identifiée et **reportée à la tâche 1.6** : la table `campaigns` elle-même
n'est pas publique (seul le staff scope la voit) — la page publique de
progression de campagne devra s'appuyer uniquement sur les vues
`v_campaign_progress`/`v_beneficiary_credit_totals` + les vues d'athlète/
équipe/club, ou alors une nouvelle vue `v_public_campaign` sera nécessaire.
À trancher à la tâche 1.6, pas avant.

## 2026-06-19 — Politiques RLS : club public seulement si `approved_at IS NOT NULL`
Les policies `anon`/`authenticated` sur les vues publiques de club/équipe ne
remontent que les clubs dont `approved_at IS NOT NULL` (donc approuvés par un
admin). Un club en attente d'approbation ne doit pas être visible
publiquement avant validation par le back-office — cohérent avec le
processus d'approbation déjà prévu dans le schéma (`clubs.approved_at`).

## 2026-06-19 — Régression de sécurité découverte et corrigée : migration 0004 cassait RLS pour `anon` (Tâche 0.4, durcissement)
**Contexte.** L'advisor de sécurité Supabase a signalé que les 10 fonctions
d'aide RLS (`current_user_role`, `is_platform_admin`, `manages_*`, `owns_*`,
toutes `SECURITY DEFINER`) ainsi que `handle_new_auth_user` étaient
exécutables directement par `anon`/`authenticated` via l'API REST
(`/rest/v1/rpc/...`). Migration 0004 a corrigé ce lint en révoquant `EXECUTE`
sur ces fonctions pour `anon`/`authenticated` et a été appliquée au vrai
projet Supabase.

**Bug découvert.** En réécrivant `tests/integration/rls-policies.test.ts`
pour couvrir ce nouveau comportement, j'ai découvert que Postgres exige le
privilège `EXECUTE` pour TOUT appel d'une fonction — y compris depuis
l'INTÉRIEUR d'une expression de policy RLS lors de l'évaluation d'une requête
SELECT/UPDATE/DELETE ordinaire. `SECURITY DEFINER` ne change que le contexte
d'exécution du CORPS de la fonction (quelles données elle peut voir), jamais
qui a le droit de l'appeler. Conséquence : la migration 0004, déjà déployée
en production, cassait silencieusement RLS lui-même pour `anon` sur TOUTE
table dont une policy référence l'une de ces fonctions (`campaigns`, `clubs`,
`teams`, `athletes`, `orders`, `order_credits`, ...) — au lieu de filtrer à
zéro ligne comme attendu, Postgres renvoyait une erreur SQL `permission
denied for function ...`. Confirmé en direct sur le projet de production
avant correction : `SET ROLE anon; SELECT * FROM campaigns;` →
`ERROR 42501: permission denied for function is_platform_admin`. Impact réel
limité : les pages publiques utilisent des vues dédiées qui ne référencent
pas ces fonctions (non affectées), mais tout appel REST direct d'un visiteur
anonyme sur les tables brutes recevait une erreur 500 au lieu d'un tableau
vide.

**Correction.** Migration `0005_move_rls_helpers_to_private_schema.sql` :
déplace les 10 fonctions d'aide vers un schéma `private` (motif standard
Supabase/PostgREST), avec `EXECUTE` accordé largement à
`anon`/`authenticated`/`service_role` (nécessaire pour que RLS continue de
fonctionner sur toutes les tables), et les 27 policies de la migration 0003
recréées pour référencer `private.*` au lieu de `public.*` (comportement
logique strictement identique). La protection contre l'appel RPC direct ne
vient plus d'un `REVOKE` SQL (qui casse RLS) mais du fait que PostgREST
n'expose par défaut que le schéma `public` (et `graphql_public`) — `private`
n'apparaît jamais dans `/rest/v1/rpc/...`. `handle_new_auth_user` reste dans
`public` (fonction de trigger uniquement, jamais appelée via RLS ni en
RPC direct, donc non concernée par ce bug). Migration appliquée directement
au projet Supabase de production via le connecteur MCP (autorisation déjà
accordée par Frédéric pour ce type de correctif de sécurité), puis vérifiée
en direct (`SET ROLE anon` sur `campaigns`/`orders`/`profiles` → 0 ligne,
sans erreur). Tests d'intégration mis à jour en conséquence (52/52 verts),
`tsc --noEmit` et `npm run lint` propres.

**Note méthodologique.** `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE
EXECUTE ON FUNCTIONS FROM PUBLIC` ne suffit PAS à retirer le grant implicite
que Postgres accorde à `PUBLIC` à la création d'une fonction — vérifié
empiriquement sur Postgres embarqué. Seul un `REVOKE EXECUTE ON FUNCTION
<nom> FROM PUBLIC` explicite, après la création, fonctionne. Pas pertinent
pour la migration 0005 (elle ne repose pas sur ce mécanisme), mais à garder
en tête pour tout futur durcissement de privilèges sur fonction.

**Point non bloquant relevé en aparté** : l'advisor signale aussi (niveau
ERROR) que les vues publiques `v_public_athlete`, `v_public_team`,
`v_public_club`, `v_campaign_progress`, `v_beneficiary_credit_totals` sont
`SECURITY DEFINER`. C'est intentionnel et conforme à la section 5 de
CLAUDE.md (« les pages publiques passent par des vues qui respectent les
hide_* ») : ces vues contournent délibérément le RLS restrictif des tables
de base pour exposer une lecture publique filtrée à `anon`, qui n'a par
ailleurs aucune policy `SELECT` directe sur `athletes`/`teams`/`clubs`.
Basculer ces vues en `security_invoker = true` casserait l'accès public
(RLS des tables de base refuserait `anon`). Décision : laisser tel quel,
accepté comme la troisième finding « connue » avec `extension_in_public` et
`auth_leaked_password_protection` — aucune action requise avant la mise en
production, mais à mentionner explicitement lors d'une revue de sécurité
professionnelle (CLAUDE.md section 2, mineurs).
