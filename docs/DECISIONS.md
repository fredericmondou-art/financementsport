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

## 2026-06-19 — Correction du modèle de permission club/équipe : pas d'auto-service (Tâche 1.1)
**Contexte.** En écrivant `lib/auth/permissions.ts` et
`lib/entities/clubs.ts`/`teams.ts`, j'avais d'abord supposé un modèle
auto-service : n'importe quel utilisateur authentifié peut créer un club ou
une équipe indépendante, et en devient automatiquement `club_admin`/
`team_manager` via un membership auto-inséré.

**Découverte.** En relisant les policies RLS déjà déployées (migration 0003)
avant d'écrire les routes API, j'ai constaté que ce modèle contredit le schéma
de sécurité déjà en production :
- `clubs_insert_admin` : `WITH CHECK (is_platform_admin())` — création de club
  réservée à platform_admin, sans exception.
- `teams_insert` : `WITH CHECK (is_platform_admin() OR manages_club(club_id))`
  — et `manages_club(NULL)` vaut toujours faux. Une équipe indépendante
  (`club_id IS NULL`) ne peut donc être créée que par platform_admin, jamais
  par auto-service.
- `memberships_write_admin` : `FOR ALL USING (is_platform_admin())` — TOUTE
  écriture sur `memberships` (y compris l'auto-attribution d'un rôle au
  créateur) est réservée à platform_admin. Le mécanisme d'auto-membership que
  j'avais codé aurait donc échoué pour tout non-admin, même si la création du
  club/équipe avait été permise.

**Correction.** `lib/auth/permissions.ts` (cases `club`/`team` de `can()`) et
`lib/entities/clubs.ts`/`teams.ts` (suppression de la logique
d'auto-insertion de membership dans `createClub`/`createTeam`) ont été
réécrits pour refléter EXACTEMENT les policies RLS : club → platform_admin
uniquement ; équipe avec `clubId` → platform_admin ou club_admin de ce club ;
équipe sans `clubId` → platform_admin uniquement. La suppression de club/équipe
est encore plus restrictive que la lecture/mise à jour (club : platform_admin
seul ; équipe : platform_admin ou club_admin, jamais team_manager — reflète
`clubs_delete_admin` et `teams_delete`). L'attribution d'un rôle
`club_admin`/`team_manager` à un utilisateur devient une opération
strictement admin, hors du périmètre de fichiers de la Tâche 1.1 (aucun
endpoint `memberships` n'y est listé) — modèle d'intégration piloté par
l'admin, cohérent avec la philosophie « versements manuels en V1 » de
CLAUDE.md section 9.2.

**Par contraste**, le modèle pour `athlete` était déjà correct dès la
première version : `athletes_insert` autorise `guardian_id = auth.uid()` (le
parent inscrit lui-même son athlète) OU `manages_team(team_id)` (un gérant
d'équipe inscrit les athlètes de son équipe), sans cascade club_admin à
l'insertion (différence notable avec `manages_athlete`, utilisé pour
lecture/mise à jour/suppression, qui ajoute la cascade club_admin via le club
de l'équipe). `lib/auth/permissions.ts` distingue maintenant explicitement
ces deux portées (création vs. lecture/mise à jour/suppression) pour
l'athlète, alors qu'avant les deux utilisaient la même portée trop large
(incluant club_admin) y compris à la création.

**Pourquoi documenté ici plutôt que dans QUESTIONS.md** : le schéma RLS déjà
déployé en production est la source de vérité (CLAUDE.md section 2, « ne pas
rediscuter les décisions d'architecture déjà prises ») — il n'y avait pas
d'ambiguïté à deux interprétations plausibles, seulement une divergence entre
mon hypothèse initiale et un fait déjà tranché ailleurs dans le projet.
Aucune table ni colonne modifiée, uniquement la logique applicative alignée
sur l'existant.

## 2026-06-19 — Bug de test découvert à l'exécution : identifiants de fixtures non-UUID (Tâche 1.1)
En exécutant `tests/integration/entities.test.ts`, `athleteInputSchema.parse`
et `teamInputSchema.parse` rejetaient systématiquement les données de test
avec `ZodError: Invalid uuid` sur `clubId`/`teamId`/`guardianId`. Cause : les
repos en mémoire du test généraient des identifiants lisibles (`club-1`,
`team-1`, `guardian-1`, ...) au lieu de vrais UUID, alors que les schémas zod
(`teamInputSchema.clubId`, `athleteInputSchema.teamId`/`guardianId`/`userId`)
exigent `.uuid()` — alignés sur les colonnes Postgres réelles, toujours des
UUID générés par Supabase. Ce n'est pas un bug de logique métier : le schéma
de validation est correct et ne doit pas être assoupli (un vrai `clubId`
malformé doit être rejeté en production). Correction : tous les identifiants
générés par les repos en mémoire (`createFakeClubRepo`/`createFakeTeamRepo`/
`createFakeAthleteRepo`) et les fixtures (`guardian`, `otherGuardian`,
`teamManager`, identifiants ad hoc) utilisent maintenant `randomUUID()` (module
`node:crypto`). Aucun changement à `lib/entities/*` ni aux schémas zod —
uniquement aux données de test.

## 2026-06-19 — Tâche 1.2 : catalogue produits/packs (3 choix mineurs, aucun ne touche argent/sécurité/mineurs de façon ambiguë)
**Aucune modification de `lib/auth/permissions.ts`.** Le `case 'product'` de
`can()` (écrit à la Tâche 0.3, jamais modifié depuis) court-circuite déjà
`platform_admin` à `true` en tête de fonction et refuse explicitement toute
action (create/read/update/delete) à tout autre rôle — exactement la policy
RLS `products_admin_all` (migration 0003). La lecture publique du catalogue
(`listPublicProducts` dans `lib/catalog/products.ts`) ne passe pas du tout par
`can()` : elle interroge uniquement `is_active = true`, comme
`products_public_read`. Confirmé par lecture du code existant avant d'écrire
quoi que ce soit — la tâche « étendre permissions.ts pour product » du plan
initial s'est révélée un no-op, documenté ici plutôt que silencieusement
ignoré.

**Catégories (`product_categories`) : champ conservé, pas d'endpoint CRUD en
V1.** Le seed ne contient aucune catégorie et les critères d'acceptation de la
Tâche 1.2 (lister, filtrer, trier les 4 packs) ne l'exigent pas. `categoryId`
reste un champ optionnel nullable sur `productInputSchema`/`listProductsQuerySchema`
(la FK existe déjà dans le schéma), pour ne pas bloquer une Tâche future qui
ajouterait la gestion des catégories sans migration supplémentaire.

**Tri « popularité » sans données de vente (Tâche 1.5 pas encore livrée).**
`ProductRepo.getUnitsSoldByProductId()` interroge `order_items`/`orders` (statut
`paid`) et retourne une `Map` vide tant qu'aucune commande payée n'existe — pas
un bug, le comportement correct en attendant les vraies ventes. La logique de
tri elle-même (`sortProducts`) est une fonction pure testée unitairement,
indépendante de la disponibilité des données.

**Tri « crédit généré » utilise `fixed_credit_cents ?? 0`.** Seul le crédit
fixe (renseigné pour les 4 packs du seed) est connu avant le moteur de crédit
de la Tâche 1.3 ; un produit à crédit variable (futures règles `credit_rules`)
est traité comme 0$ pour ce tri précis seulement — à revisiter explicitement à
la Tâche 1.3 quand le crédit indicatif variable sera calculable.

**Produit inactif : `NotFoundError`, jamais `PermissionError`, pour un
visiteur ou un client.** `getProduct()` (route `GET /api/products/:id`) ne
révèle pas qu'un produit retiré du catalogue existe à qui n'a pas le droit de
le voir — même traitement qu'un id inexistant, pour ne pas faire fuiter
d'information sur le catalogue interne.
