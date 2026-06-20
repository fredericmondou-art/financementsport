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

## 2026-06-19 — Tâche 1.3

**Une commande a UNE seule campagne de contexte, partagée par tous ses
bénéficiaires (pas de campagne distincte par ligne `cart_beneficiaries`).**
Le schéma permet `cart_beneficiaries.campaign_id` par bénéficiaire, mais
l'énoncé de la Tâche 1.3 parle explicitement d'une fonction « pour une
commande donnée (lignes + répartition entre bénéficiaires + campagne) » —
au singulier. Le moteur (`calculateOrderCredits`) prend donc `campaignId`/
`isCampaignActive` comme paramètres uniques au niveau de la commande,
cohérent avec `orders.primary_campaign_id`. Si un futur besoin réel exige des
campagnes différentes par bénéficiaire dans une même commande, il faudra
re-découper l'appel par bénéficiaire (plusieurs appels à la fonction), pas
changer sa signature — décision à revisiter explicitement si ce cas se
présente, pas à anticiper maintenant (section 10 du cahier).

**Les produits à crédit fixe (`fixed_credit_cents`) ne reçoivent jamais le
bonus de seuil (`bonus_percent_bps`).** Le bonus est un pourcentage appliqué
au taux d'une règle `credit_rules` ; un crédit fixe par unité n'a pas de
« taux » sur lequel l'appliquer. Testé explicitement
(`tests/credits/calculate.test.ts`, « le crédit fixe d'un produit ignore le
bonus de seuil »).

**Fichiers de test placés à `tests/credits/*.test.ts` (pas
`tests/unit/credits-*.test.ts`).** Le cahier des charges (section TÂCHE 1.3
de `03-prompts-phase-0-et-1.md`) nomme explicitement ce chemin, à la
différence des Tâches 1.1/1.2 qui utilisaient la convention
`tests/unit`/`tests/integration`. `vitest.config.ts` a été étendu pour inclure
`tests/credits/**/*.test.ts`.

**Répartition de l'arrondi : toujours au premier bénéficiaire du tableau
(jamais au plus gros montant, ni proportionnel).** Choix déterministe simple,
explicitement vérifié par les critères d'acceptation du cahier (« 9,01$ → 4,51$
+ 4,50$ »). `splitCreditAmongBeneficiaries()` ne valide pas que
`SUM(shareBps) = 10000` — cette validation appartient à la couche panier
(Tâche 1.4), qui doit bloquer le checkout avant l'appel au moteur de crédit.

**Bug de troncature silencieuse confirmé sur `Edit` (pas `Write`) — réaffirmé.**
`vitest.config.ts` (fichier existant, suivi par git) a été tronqué en plein
milieu d'une chaîne après un appel `Edit` ; `git status` ne signalait même pas
de modification. Les fichiers neufs créés via `Write` (`lib/credits/*.ts`,
`tests/credits/*.test.ts`) n'ont montré aucun symptôme. Procédure retenue :
après tout `Edit` sur un fichier déjà suivi par git dans le dossier monté,
vérifier le contenu réel sur disque (`cat`/`git diff`) avant de continuer ; en
cas de troncature, réécrire le fichier en entier via heredoc bash.

## 2026-06-20 — Tâche 1.4 : panier et répartition entre bénéficiaires

**Contrôle d'accès au panier volontairement HORS du système `can()`.** Un
panier connecté est comparé à `user.id`, un panier invité à un
`session_token` exact (cookie httpOnly `panier_session`) — jamais l'un pour
l'autre, jamais de croisement (`assertCartOwnership`, seul point de contrôle
d'accès de `lib/cart/*.ts`). `platform_admin` n'a AUCUN droit spécial sur le
panier d'un tiers : contrairement aux clubs/équipes/produits, un panier n'est
jamais une ressource qu'un admin gère pour le compte d'un client — il n'existe
même pas de cas d'usage où un admin aurait besoin de lire/modifier le panier
en cours d'un visiteur avant son paiement.

**Fusion du panier invité au moment de la connexion : articles additionnés,
répartition jamais fusionnée.** Si l'utilisateur qui se connecte a déjà un
panier ouvert sur un autre appareil, les quantités des produits identiques
s'additionnent (comportement panier standard) et le panier invité passe à
`status = 'abandoned'`. La répartition entre bénéficiaires (`cart_
beneficiaries`) n'est PAS fusionnée : celle déjà présente sur le panier de
l'utilisateur est conservée telle quelle, l'utilisateur devra reconfirmer.
Fusionner deux répartitions en points de base provenant de paniers distincts
n'a pas de résultat « correct » évident à inventer (CLAUDE.md section 9 :
prudence dès qu'un choix touche l'argent) — mieux vaut redemander
confirmation que deviner une règle de fusion arbitraire.
`attachGuestCartToUser` ne prend que le jeton de session invité (pas de
`cartId` en paramètre) : elle retrouve elle-même le panier `open`
correspondant, ce qui permet de l'appeler automatiquement depuis
`loginAction` sans plomberie supplémentaire côté formulaire de connexion. Un
invité sans panier `open` (cas le plus fréquent) retourne simplement `null`,
pas une erreur.

**Seul `hide_last_name` est respecté dans l'affichage du panier — pas les
autres `hide_*`.** Le panier (et son message de message de crédit « Votre
achat générera X$ pour [bénéficiaire] ») est visible par un invité non
authentifié, donc une « surface publique » au sens strict de CLAUDE.md
section 5 pour ce qui concerne le nom affiché — `lib/cart/beneficiary-
labels.ts` applique donc l'abréviation `Prénom N.` quand `hide_last_name` est
vrai. `hide_amounts`/`hide_photo`/`hide_city`/`show_team_only` ne sont PAS
appliqués ici : ces champs régissent l'affichage du PROFIL PUBLIC de
l'athlète (Tâche 1.6 — photo, ville, montants levés affichés sur sa page),
pas la confirmation d'achat du client qui choisit lui-même ce bénéficiaire.
Mélanger les deux aurait masqué au client des informations sur SON propre
geste de don, ce qui n'est pas le but de ces champs.

**Saisie de la répartition en points de base (0-10000), pas en
pourcentages.** `components/beneficiary-split.tsx` prend `shareBps`
directement plutôt que de faire convertir un pourcentage par l'utilisateur
puis re-convertir en points de base côté serveur (aller-retour flottant
inutile, même si `share_bps` n'est pas un montant d'argent — cohérent avec la
discipline anti-`float` de CLAUDE.md section 4). Limite connue : pas de
sélecteur de recherche pour choisir un bénéficiaire (l'UUID est saisi
directement) — à améliorer à la Tâche 1.6 avec des liens « Soutenir cet
athlète » pré-remplis depuis les pages publiques.

**Bug de troncature silencieuse confirmé de nouveau, sur trois fichiers
distincts (`app/(auth)/login/actions.ts`, `app/(shop)/panier/actions.ts`,
`app/(shop)/panier/page.tsx`, puis `tests/unit/cart-estimate-credit.test.ts`
lors de la rédaction des tests).** Chaque fois : `tsc`/`eslint` signalent une
erreur de syntaxe en fin de fichier après un appel `Edit`, le fichier sur
disque est tronqué en plein milieu d'une chaîne/instruction, mais l'outil
`Read` continue d'afficher le contenu correct complet (preuve de la
divergence de cache entre bash et les outils fichiers sur ce dossier monté).
Correction systématique : réécriture intégrale du fichier via heredoc bash
(`cat > fichier << 'EOF' ... EOF`), `sleep 2`, puis vérification par
`wc -l`/`tail`/`cat -A` avant de refaire confiance au fichier. Procédure
documentée dans la mémoire persistante du projet — à appliquer pour tout
fichier de ce dossier monté qui sera ensuite suivi par git ou compilé.

**Bug cosmétique trouvé et corrigé en écrivant les tests : double point final
dans `formatCreditMessage` quand le libellé se termine déjà par un point.**
`lib/cart/beneficiary-labels.ts` abrège un nom de famille masqué en
`Prénom N.` (avec point) ; `formatCreditMessage` ajoutait son propre point
final sans vérifier, produisant « ... pour Thomas T.. » (deux points). Corrigé
en retirant un point final déjà présent sur le libellé avant d'en ajouter un.
Changement cosmétique, sans risque (texte d'affichage uniquement, aucun
calcul d'argent touché) — corrigé directement plutôt que noté pour plus tard,
conformément à CLAUDE.md section 9 (seuls les choix ambigus touchant
argent/sécurité/mineurs doivent être posés en question).

## 2026-06-20 — Tâche 1.6 : pages publiques (athlète, équipe, club) et page d'accueil

**Vues publiques `v_public_campaign` / `v_public_campaign_products` (migration
0007) : même pattern que les vues publiques existantes (entrée du
2026-06-19), donc deux nouvelles advisories `SECURITY DEFINER` ERROR-level
acceptées sans changement.** `get_advisors` confirme que ces deux vues
produisent exactement le même type d'avertissement que `v_public_athlete`/
`v_public_team`/`v_public_club` : Postgres signale qu'une vue accessible à
`anon`/`authenticated` s'exécute avec les droits de son créateur plutôt que
de l'appelant. C'est le mécanisme recherché ici (la vue filtre déjà
`status = 'active'` et ne projette que des colonnes non sensibles ; aucune
table sous-jacente n'est exposée directement à `anon`). Point non bloquant,
déjà accepté pour les vues précédentes — extension du même choix, pas une
nouvelle décision.

**Sélection de la campagne pertinente quand plusieurs campagnes `active`
ciblent le même bénéficiaire direct : la plus récemment démarrée
(`starts_at` décroissant), départagée par `id` en cas d'égalité exacte
(`lib/public/campaign-progress.ts`, `pickMostRelevantCampaign`).** Le schéma
n'empêche pas plusieurs campagnes simultanément actives pour un même
`(beneficiary_type, beneficiary_id)`, et rien dans le cahier des charges
n'indique de notion de priorité éditoriale entre elles. Une page publique
n'affiche qu'un seul objectif à la fois (une seule barre de progression) :
choix autonome raisonnable, à revisiter explicitement si ce cas se présente
en pratique avec un besoin de priorité différent.

**`athletes.show_team_only = true` : la page individuelle de l'athlète
retourne 404 (`notFound()`), pas une redirection vers la page d'équipe.**
`lib/public/profile.ts` charge et expose ce champ sans décider quoi en
faire (`loadPublicAthleteProfile` retourne quand même le profil) ; c'est
`app/[athleteSlug]/page.tsx` qui appelle `notFound()` après coup. Choix :
un slug d'athlète qui ne doit pas avoir de page individuelle n'existe
simplement pas publiquement, plutôt que de rediriger silencieusement vers
l'équipe (qui pourrait laisser croire que l'URL athlète est une route
canonique valide). Cohérent avec la sémantique `hide_*` déjà établie
(masquer = absent, pas redirigé).

**`athletes.hide_amounts = true` masque les montants à la couche de
chargement (`applyAmountsMask`), pas seulement à l'affichage.** Un montant
masqué ne doit jamais atteindre le JSX, même par erreur de rendu futur
(CLAUDE.md section 5). `hide_amounts` reste pour l'instant le seul champ de
masquage de montant porté par `athletes` (pas de pendant sur `teams`/
`clubs` dans le schéma fourni) — pas un oubli, juste l'état actuel du
schéma : `lib/public/campaign-progress.ts` n'applique ce masquage que côté
profil athlète.

**Pré-sélection du bénéficiaire depuis le lien "Encourager" : n'écrase
JAMAIS une répartition déjà choisie.** Le lien "Encourager" d'une page
publique ajoute `?beneficiaryType=&beneficiaryId=` à l'URL boutique, reporté
en champs cachés sur chaque formulaire "Ajouter au panier"
(`app/(shop)/boutique/page.tsx`). `addItemAction`
(`app/(shop)/panier/actions.ts`) n'attache ce bénéficiaire à 100 % que si
`listCartBeneficiaries` retourne une liste vide pour ce panier — une
répartition multi-bénéficiaires déjà choisie délibérément (Tâche 1.4,
"répartir entre deux enfants") n'est jamais remplacée silencieusement par un
clic "Encourager" ultérieur sur un autre profil.

**Contenu textuel de la page d'accueil (`app/page.tsx`) : laissé à ma
discrétion, hors du texte mandaté par le cahier des charges.** Le cahier
des charges spécifie la fonction (remplacer le placeholder "en
construction" par une vraie page d'accueil, lien vers la boutique) sans
fournir de copie exacte. Contenu rédigé : slogan, court paragraphe
explicatif, lien "Voir la boutique", et une section "Comment ça fonctionne"
en 4 étapes reprenant le cœur fonctionnel décrit à la section 1 du présent
fichier. À ajuster librement si une copie marketing officielle est fournie
plus tard.

**`campaign_participants` (athlètes multiples sur une campagne d'équipe)
explicitement hors-scope de cette tâche.** Les pages publiques de cette
tâche affichent la progression d'une campagne pour SON bénéficiaire direct
uniquement (`beneficiary_type`/`beneficiary_id` sur `campaigns`), pas
l'agrégation par athlète participant à une campagne d'équipe/club. Cette
agrégation (si nécessaire) appartient à une tâche ultérieure documentée
séparément — non traitée ici pour ne pas élargir le scope au-delà de la
section 64 du cahier des charges pour la Tâche 1.6.

**Découverte (et réparation) : le bug de cache du mount documenté depuis la
Tâche 1.5 (voir entrées précédentes et la mémoire persistante associée)
corrompt aussi la vue de `git` lui-même, pas seulement `tsc`/les copies de
build.** En vérifiant `git status` avant de committer cette tâche,
`app/page.tsx` n'apparaissait PAS comme modifié alors qu'il avait été
réécrit avec le nouveau contenu de la page d'accueil. Diagnostic : `cat`
en bash montrait un contenu tronqué (ni l'ancien placeholder, ni le nouveau
contenu complet), `git show HEAD:...` montrait bien l'ancien placeholder,
mais `git diff` ne signalait aucune différence — preuve que la détection de
modification de `git` (qui lit le fichier via la même couche bash que
`cat`) voit elle aussi un état figé/corrompu, distinct à la fois du commit
et du contenu réel. Un balayage systématique (`wc -l`/`tail -c` comparé au
contenu vérifié par l'outil Read) sur les 16 fichiers touchés par cette
tâche a trouvé 6 fichiers ainsi corrompus en vue bash
(`app/page.tsx`, `tests/e2e/home.spec.ts`, `lib/db/types.ts`,
`app/(shop)/boutique/page.tsx`, `app/(shop)/panier/actions.ts`,
`lib/public/campaign-progress.ts`), et — fait nouveau et plus inquiétant —
2 fichiers d'une tâche précédente (Tâche 1.4/1.5,
`lib/cart/cart.ts`/`tests/integration/cart.test.ts`) montrant le même
symptôme alors qu'ils n'avaient pas été touchés cette session : leur
contenu réel (vérifié par Read) incluait `markCartConverted`
(Tâche 1.5) que `git` ne voyait jamais comme un changement non commité —
un ajout réel et déjà fait s'était donc rendu invisible à `git` depuis sa
création, jusqu'à ce balayage. Réparation : réécriture directe de ces 8
fichiers sur le mount via heredoc bash (`cat > <chemin> << 'EOF'`), en
utilisant le contenu vérifié par l'outil Read comme seule source de vérité
— *pas* via `/tmp/code-build` comme le préconisait le contournement
précédent, puisque c'est la vue du mount elle-même (et donc ce que `git`
committera) qu'il fallait corriger. Après réécriture, `git status`/
`git diff` détectent correctement tous les changements réels. Le
contournement précédent ("ne jamais écrire directement dans le mount via
bash") reste valable pour éviter d'INTRODUIRE de la corruption, mais ne
suffit plus pour la RÉPARER une fois qu'elle a déjà figé la vue de `git` —
dans ce cas précis, écrire directement sur le mount via heredoc est la
seule façon de resynchroniser ce que `git` committera avec la réalité.
Vérification post-réparation : `tsc --noEmit`, `npm run lint` et
`npx vitest run` (lancés depuis un `/tmp/code-build` reconstruit par
`rsync` + `npm install` frais, le `node_modules` du mount étant compilé
pour Windows et inutilisable tel quel dans ce bac à sable Linux) passent
tous les trois sans erreur, 263/263 tests verts.

## Tâche 1.7 — Création de campagne (assistant)

**Règle de crédit propre à une campagne : self-service plafonné (décision de
Frédéric, choix engageant l'argent — CLAUDE.md section 9b).** `credit_rules_
admin_write` (migration 0005) réservait TOUTE écriture sur `credit_rules` à
`platform_admin`, mais le cahier (sections 17/53) demande que l'assistant
laisse le responsable (team_manager/club_admin) définir la règle de crédit de
SA campagne. Deux options soumises : (a) aucune règle propre à l'assistant, le
crédit suit uniquement les règles produit/globale déjà en vigueur ; (b)
self-service plafonné (taux/bonus max 50 %, montant fixe max 100 $), portée
strictement « campagne » (jamais globale/produit). Frédéric a tranché pour
(b). Implémenté en deux couches redondantes (migration
`0008_campaign_creation_assistant.sql`) : policies RLS
`credit_rules_campaign_manager_insert`/`_update` (plafonds en dur dans le
`WITH CHECK`, scope `private.manages_campaign(campaign_id)`) ET les mêmes
plafonds dans `lib/campaigns/create-campaign.ts`
(`SELF_SERVICE_PERCENT_BPS_CAP`/`SELF_SERVICE_FLAT_CENTS_CAP`/
`SELF_SERVICE_BONUS_BPS_CAP`, via `.refine()` zod) pour un message d'erreur
clair avant même d'atteindre la DB. `platform_admin` garde un accès total non
plafonné via `credit_rules_admin_write` (policy distincte, inchangée). Niveau
de risque jugé acceptable parce que les versements restent MANUELS en V1
(CLAUDE.md section 2) : un admin valide et paie à la main avant que l'argent
ne sorte réellement, donc un taux excessif reste rattrapable avant paiement.

**Bug RLS pré-existant corrigé au passage (depuis la Tâche 1.3/0.4) :
`credit_rules` n'avait AUCUNE policy SELECT pour un client/invité normal.**
`lib/cart/credit-context.ts` interroge `credit_rules` avec le client de
session de l'utilisateur courant (pas `service_role`) pour estimer le crédit
au panier ; sous RLS, cette requête renvoyait donc toujours un tableau vide
pour un client/invité, et l'estimation de crédit affichée au panier était
silencieusement nulle pour toute règle non liée à `fixed_credit_cents` d'un
produit — un trou direct dans le cœur fonctionnel de la plateforme (CLAUDE.md
section 1 : « calculer le crédit automatiquement »). Corrigé par la nouvelle
policy `credit_rules_read_active` (`USING (is_active = true)`) : les
pourcentages de crédit ne sont pas une donnée personnelle/sensible (ils sont
de toute façon affichés publiquement comme argument de vente) ; les règles
inactives restent réservées à `platform_admin`/`accounting` via
`credit_rules_staff_read`. Même classe de correction que le bug seed.sql/
trigger de la Tâche 0.4 et la régression 0004→0005.

**Statut de campagne : toujours `active` directement à la création, aucune
étape brouillon/approbation.** Le cahier (Tâche 1.7) demande d'« activer » la
campagne et de rendre sa page publique accessible immédiatement après
création ; aucune mention d'un statut intermédiaire `draft`/`pending_approval`
pour ce flux self-service. Choix : `createCampaign` crée systématiquement la
campagne avec `status = 'active'` (le `campaign_status` admin-only `draft`
existant reste disponible pour un usage futur côté back-office, hors scope
ici).

**Atomicité (CLAUDE.md section 4) via une fonction SQL `SECURITY INVOKER`,
PAS `SECURITY DEFINER` comme `create_paid_order` (migration 0006).**
`create_campaign_with_details` insère campagne + participants + packs + règle
de crédit optionnelle + QR codes en une seule transaction plpgsql, mais
contrairement au webhook Stripe (appelant `create_paid_order` via
`service_role`), l'appelant ici est l'utilisateur authentifié lui-même
(team_manager/club_admin via son propre jeton de session) : chaque `INSERT` à
l'intérieur de la fonction doit donc rester soumis à RLS avec son propre
`auth.uid()` — aucun bypass de sécurité, la fonction n'est qu'une primitive
d'écriture mécanique. Si une étape viole une policy RLS (ex. plafond de la
règle de crédit dépassé, ou bénéficiaire hors du périmètre géré), toute la
transaction échoue et rien n'est créé — vérifié explicitement par
`tests/integration/create-campaign.test.ts` (la campagne elle-même n'existe
pas après un rejet RLS sur `credit_rules`).

**Résolution du `target_id` auto-référentiel du QR « campagne » : `NULL` côté
TypeScript, résolu en SQL via `COALESCE`.** Au moment où `lib/campaigns/
create-campaign.ts` construit la liste des QR codes à créer, l'id de la
campagne n'existe pas encore (elle est créée dans la même transaction, par la
même fonction SQL). Le QR « campagne » est donc envoyé avec `target_id: null`
et résolu dans `create_campaign_with_details` via
`COALESCE((qr->>'target_id')::uuid, CASE WHEN qr->>'target_type' = 'campaign'
THEN v_campaign.id END)` — les QR « athlète » arrivent toujours avec un
`target_id` déjà connu et passent par la même expression sans effet.

**Génération de l'image QR scannable, téléchargement et route de résolution
`/q/<code>` : différés à la Phase 1.5, pas dans le scope de la Tâche 1.7.**
Le cahier (section « Après la Phase 1 ») liste explicitement « QR codes
téléchargeables » comme fonctionnalité de la Phase 1.5. Interprétation : seule
la COUCHE DE DONNÉES (lignes `qr_codes` : `code`/`target_type`/`target_id`,
un par campagne + un par athlète participant) relève de la Tâche 1.7 ; la
génération de l'image, son téléchargement et la redirection/incrément de
`scan_count` viendront avec le reste du flux « téléchargeable » en Phase 1.5.
Aucun changement de schéma/RLS requis pour cette partie différée
(`qr_codes_scoped`, migration 0005, couvre déjà `target_type IN ('campaign',
'athlete')` via `private.manages_qr_target`).

**`lib/auth/permissions.ts` : aucune modification nécessaire.** Le cas
`campaign` (`create`/`read`/`update`, gated par `hasMembershipScope`) existait
déjà depuis une tâche antérieure et couvre exactement le besoin de l'assistant
(team_manager/club_admin scopés par `memberships`) — vérifié par lecture
complète du fichier avant de commencer le code de la Tâche 1.7, aucune
nouvelle policy de permission applicative à ajouter.

**Validation du périmètre des athlètes participants : refusée si l'athlète
n'appartient pas à l'équipe/club rattaché à la campagne, jamais une
vérification de propriété de campagne déjà créée.** `assertAthleteInScope`
(privée, `lib/campaigns/create-campaign.ts`) compare le `teamId`/`clubId` de
chaque athlète candidat à celui de la campagne en cours de création (avant
toute écriture) — un athlète d'une autre équipe ne peut jamais être ajouté
comme participant, même par un manager qui gérerait par ailleurs cette autre
équipe (cohérence du périmètre déclaré côté formulaire, pas seulement
permission globale).

**Chemin de route : `app/(portails)/campagnes/nouvelle`, pas
`app/(portal)/campagnes/nouvelle` comme la formulation littérale du prompt
03-prompts le suggérait.** Choix d'alignement avec la convention déjà en
place dans ce dépôt pour les groupes de routes en français
(`app/(shop)`/`app/(auth)` suivent l'anglais, mais aucun groupe `(portal)`
n'existe ; un nouveau groupe francisé `(portails)` reste cohérent avec le
reste de l'arborescence orientée français de l'interface — CLAUDE.md section
2). Aucune incompatibilité fonctionnelle, purement une question de nommage de
dossier (non observable par l'utilisateur final).

**Bug de cache mount/git (suite, voir entrées Tâche 1.5/1.6 et la mémoire
persistante associée) : deux nouvelles manifestations rencontrées et
réparées pendant cette tâche.** (1) `supabase/migrations/
0008_campaign_creation_assistant.sql`, pourtant déjà écrit en entier par
l'outil Write, apparaissait tronqué en vue bash (245 lignes au lieu de 256,
coupé en plein milieu d'un `REVOKE ALL ON FUNCTION (...)`) — assez pour
provoquer une vraie erreur SQL (« syntax error at end of input ») lors de
l'exécution du test d'intégration dans `/tmp/code-build`, PAS seulement un
symptôme cosmétique. (2) Après une édition (`Edit` tool) retirant une
constante de test inutilisée (`SEED_CLUB_ID`) dans
`tests/integration/create-campaign.test.ts`, le fichier sur le mount
contenait des octets nuls (`\0`) en fin de fichier, provoquant une erreur de
parsing TypeScript/ESLint (« Invalid character »). Dans les deux cas, le
contenu vu par l'outil Read restait correct et complet ; réparation par
réécriture directe du fichier sur le mount via heredoc bash
(`cat > <chemin> << 'EOF'`), comme déjà établi pour la Tâche 1.6 — PAS via
`/tmp/code-build` (qui ne fait que recopier la corruption du mount). Après
réécriture, `tsc --noEmit`/`npm run lint`/`npx vitest run` (281/281) sont
repassés propres. Confirme que ce contournement doit rester actif pour toute
tâche future touchant ce dépôt, pas seulement pour les fichiers déjà
committés.
