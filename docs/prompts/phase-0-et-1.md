# Prompts d'exécution — Phase 0 + Phase 1

Chaque prompt ci-dessous est conçu pour être copié-collé dans Claude Code, **un à
la fois, dans l'ordre**. L'ordre respecte les dépendances : ne saute jamais une
tâche. Après chaque tâche, Claude Code doit lancer les tests, committer, et
mettre à jour `docs/PROGRESS.md`.

Avant de commencer : place `CLAUDE.md` à la racine du projet et
`docs/schema-reference.sql` dans `supabase/migrations/` (ou
`docs/`). Donne aussi le cahier des charges (`docs/cahier-des-charges.docx`) à Claude Code
comme référence.

---

## TÂCHE 0.1 — Initialisation du projet

**Contexte.** Projet vierge. On démarre la plateforme décrite dans le cahier des
charges et le CLAUDE.md. Stack imposée : Next.js (App Router) + TypeScript +
Supabase + Stripe + SendGrid, déploiement Vercel.

**Objectif.** Mettre en place un projet Next.js fonctionnel, typé strict, avec la
structure de dossiers reflétant l'architecture du cahier des charges (section
64), les outils de test installés, et un pipeline de lint/format/test.

**Fichiers concernés.**
- `package.json`, `tsconfig.json` (strict), `next.config.js`
- `.env.example` (lister TOUTES les variables : Supabase, Stripe, SendGrid)
- `.eslintrc`, `.prettierrc`
- Arborescence : `app/`, `lib/` (logique métier), `components/`,
  `lib/db/` (client Supabase), `lib/credits/`, `lib/taxes/`, `tests/`
- `vitest.config.ts`, `playwright.config.ts`
- `docs/PROGRESS.md`, `docs/DECISIONS.md` (créer vides avec un en-tête)

**Règles.**
- TypeScript `strict: true`. Pas de `any` non justifié.
- Aucun secret en dur ; tout en `.env`, et `.env.example` documenté.
- Respecter l'arborescence de la section 64 du cahier (site public, e-commerce,
  financement, portails, opérations, automatisations).

**Critères d'acceptation.**
- `npm run dev` démarre sans erreur, page d'accueil placeholder s'affiche.
- `npm run lint` et `npm test` passent (même si peu de tests).
- `.env.example` liste toutes les variables nécessaires avec un commentaire.

**Tests attendus.**
- Un test unitaire trivial qui passe (preuve que Vitest fonctionne).
- Un test Playwright qui charge la page d'accueil et vérifie un texte.

---

## TÂCHE 0.2 — Migration du schéma de base de données

**Contexte.** Le schéma complet de la V1 est fourni dans
`docs/schema-reference.sql`. Il encode les décisions d'architecture (crédits
en centimes, bénéficiaire polymorphe, règles configurables, masquage mineurs).

**Objectif.** Appliquer le schéma à Supabase via une migration, générer les types
TypeScript, et créer un jeu de données de test (seed).

**Fichiers concernés.**
- `supabase/migrations/0001_initial_schema.sql` (le schéma fourni)
- `supabase/seed.sql` (données de démo, voir règles)
- `lib/db/types.ts` (types générés depuis Supabase)
- `lib/db/client.ts` (client Supabase typé)

**Règles.**
- Ne modifie pas la logique du schéma fourni ; si tu y vois un problème réel,
  arrête-toi et signale-le plutôt que de le changer en silence.
- Seed : 1 club (Corsaires), 1 équipe (U11 Hockey), 3 athlètes dont 1 avec
  `hide_last_name=true`, 4 packs (Maison 35$/5$, Famille 60$/9$, Saison
  120$/18$, Sport Propre 45$/6$), les taux de taxe QC, 1 campagne d'équipe
  active avec objectif 5000$.
- Montants du seed en centimes.

**Critères d'acceptation.**
- La migration s'applique sans erreur sur une base Supabase fraîche.
- Les types TS sont générés et importables.
- Le seed crée les données décrites ; une requête sur `v_campaign_progress`
  renvoie 0 amassé au départ.

**Tests attendus.**
- Test qui se connecte à la base de test, applique migration + seed, et vérifie
  le nombre de packs et l'existence de la campagne active.

---

## TÂCHE 0.3 — Authentification et rôles

**Contexte.** Le cahier (section 2, 46) définit plusieurs rôles : client, parent,
athlète, responsable d'équipe, admin club, admin plateforme, support, logistique,
comptabilité. La table `profiles` et `memberships` portent ces rôles.

**Objectif.** Implémenter inscription/connexion via Supabase Auth, la création
automatique d'un `profile` à l'inscription, et un système de permissions par rôle
réutilisable côté serveur.

**Fichiers concernés.**
- `app/(auth)/login`, `app/(auth)/signup`
- `lib/auth/session.ts` (récupérer l'utilisateur + son rôle côté serveur)
- `lib/auth/permissions.ts` (fonctions `can(user, action, resource)`)
- Trigger SQL : créer un `profiles` à chaque nouvel `auth.users`

**Règles.**
- Achat possible SANS compte (section 2.1) : l'auth ne doit jamais bloquer le
  parcours d'achat invité.
- Permissions vérifiées CÔTÉ SERVEUR, jamais seulement dans l'UI.
- Un team_manager n'a accès qu'aux équipes liées via `memberships`.

**Critères d'acceptation.**
- Inscription crée un `auth.users` ET un `profiles` lié.
- Connexion/déconnexion fonctionnent.
- `permissions.ts` couvre au moins : client lit ses commandes ; team_manager lit
  les campagnes de son équipe ; platform_admin écrit les produits.

**Tests attendus.**
- Unitaires sur `permissions.ts` (matrice rôle × action, cas autorisé/refusé).
- e2e : inscription → connexion → accès à une page protégée.

---

## TÂCHE 0.4 — Politiques RLS

**Contexte.** Le CLAUDE.md impose RLS sur toutes les tables. Les pages publiques
doivent respecter les `hide_*` des athlètes.

**Objectif.** Écrire et appliquer les policies Row Level Security pour toutes les
tables, plus des vues publiques sûres pour les athlètes/équipes/clubs.

**Fichiers concernés.**
- `supabase/migrations/0002_rls_policies.sql`
- Vues : `v_public_athlete`, `v_public_team`, `v_public_club` (n'exposent que les
  champs autorisés selon les `hide_*`)

**Règles.**
- Activer RLS sur CHAQUE table.
- `anon` ne lit QUE les vues publiques, jamais les tables brutes.
- Une donnée marquée masquée (`hide_amounts`, `hide_photo`, etc.) ne doit JAMAIS
  apparaître dans une vue publique.
- Un utilisateur authentifié ne lit que ses propres `orders`, `carts`,
  `addresses` ; un team_manager les données de ses équipes.

**Critères d'acceptation.**
- Tentative de lecture directe d'une table par `anon` → refusée.
- La vue publique d'un athlète avec `hide_last_name=true` ne renvoie pas le nom
  complet.

**Tests attendus.**
- Tests d'intégration qui se connectent en `anon` et en utilisateur, et vérifient
  les accès autorisés/refusés sur 4-5 tables sensibles.

---

## TÂCHE 1.1 — Gestion des entités club / équipe / athlète

**Contexte.** Sections 2.4–2.6, 5–7. Avant toute campagne, il faut pouvoir créer
clubs, équipes, athlètes, avec leurs slugs (`/club/corsaires`, `/thomas-u11`).

**Objectif.** CRUD serveur pour clubs, équipes, athlètes, avec génération de slug
unique, gestion du lien parent-athlète et des contrôles de confidentialité.

**Fichiers concernés.**
- `lib/entities/clubs.ts`, `teams.ts`, `athletes.ts`
- `app/api/clubs`, `app/api/teams`, `app/api/athletes`
- `lib/slug.ts` (génération de slug unique)

**Règles.**
- Slug unique, dérivé du nom, suffixé en cas de collision.
- Créer/éditer un athlète mineur exige le `guardian_id` ; publier exige
  `parental_consent_at`.
- Les champs `hide_*` sont modifiables par le parent/tuteur uniquement.
- Validation zod sur toutes les entrées.

**Critères d'acceptation.**
- On peut créer un club → une équipe rattachée → un athlète rattaché.
- Deux athlètes "Thomas U11" produisent deux slugs distincts.
- Un athlète mineur sans consentement n'est pas publiable.

**Tests attendus.**
- Unitaires : génération de slug (collisions), validation zod.
- Intégration : création de la chaîne club→équipe→athlète.

---

## TÂCHE 1.2 — Catalogue : produits et packs

**Contexte.** Sections 8, 9, 10. Packs prédéfinis avec prix et crédit fixes ;
produits à la carte (utiles surtout au réachat).

**Objectif.** CRUD admin des produits/packs/catégories, et endpoints de lecture
publique du catalogue avec tri et filtres.

**Fichiers concernés.**
- `lib/catalog/products.ts`
- `app/api/products`, `app/(shop)/boutique`
- `components/product-card.tsx`

**Règles.**
- Seul `platform_admin` écrit (vérifié serveur + RLS).
- Affichage public : prix, crédit indicatif, stock, délai.
- Tri par prix / popularité / crédit généré.

**Critères d'acceptation.**
- Le catalogue affiche les 4 packs du seed avec prix et crédit.
- Un non-admin ne peut pas créer de produit (refus serveur).

**Tests attendus.**
- Unitaires : tri et filtres.
- Intégration : refus d'écriture pour un client.

---

## TÂCHE 1.3 — Moteur de crédit (CŒUR — soin maximal)

**Contexte.** Sections 14, 15. C'est le cœur de la plateforme. La hiérarchie de
résolution des règles est documentée dans le schéma (`credit_rules`).

**Objectif.** Une fonction PURE et testée qui, pour une commande donnée (lignes +
répartition entre bénéficiaires + campagne), calcule le crédit par bénéficiaire,
en appliquant la bonne règle et les bonus de seuil.

**Fichiers concernés.**
- `lib/credits/calculate.ts` (fonction pure, aucune I/O)
- `lib/credits/resolve-rule.ts` (résolution de la hiérarchie de règles)
- `tests/credits/*.test.ts`

**Règles.**
- Fonction PURE : entrées → sortie, aucune écriture DB ici (l'écriture est en
  1.5). Facilite les tests.
- Hiérarchie de résolution exactement comme dans le schéma : crédit fixe produit
  > règle (campagne+produit) > règle (campagne) > règle (produit) > règle globale.
- Bonus de seuil : si sous-total ≥ `min_basket_cents`, ajouter
  `bonus_percent_bps`.
- Répartition : appliquer `share_bps` par bénéficiaire ; la somme des crédits
  répartis ne dépasse jamais le crédit total ; attribuer le ou les centimes
  d'arrondi au premier bénéficiaire (déterministe).
- Tout en centimes, arithmétique entière.

**Critères d'acceptation.**
- Pack Saison 120$ en campagne active à 15 % → 18 $ de crédit (cohérent avec
  l'exemple du cahier).
- Répartition 50/50 d'un crédit de 18 $ → 9 $ + 9 $.
- Répartition 50/50 d'un crédit impair (ex. 9,01 $) → 4,51 $ + 4,50 $ (arrondi au
  premier).
- Hors campagne (boutique permanente) → taux permanent (5 %).

**Tests attendus.**
- Une suite couvrant CHAQUE branche de la hiérarchie, le bonus de seuil, les
  arrondis de répartition, le cas crédit 0, le cas campagne inactive.

---

## TÂCHE 1.4 — Panier et répartition entre bénéficiaires

**Contexte.** Sections 12, 13. Le panier doit afficher le crédit généré et
permettre de répartir entre plusieurs bénéficiaires (total 100 %).

**Objectif.** Panier persistant (invité ou connecté), ajout/retrait d'articles,
sélection et répartition des bénéficiaires, affichage en direct du crédit estimé
via le moteur de la tâche 1.3.

**Fichiers concernés.**
- `lib/cart/*.ts`
- `app/(shop)/panier`
- `components/beneficiary-split.tsx`

**Règles.**
- Panier invité rattachable à un compte après connexion.
- La répartition doit totaliser 100 % (`SUM(share_bps)=10000`) avant checkout ;
  bloquer sinon.
- Le crédit affiché utilise `lib/credits/calculate.ts` (jamais un calcul
  dupliqué dans l'UI).
- Message obligatoire du cahier : « Votre achat générera X $ pour [bénéficiaire]. »

**Critères d'acceptation.**
- Ajouter un pack, choisir un athlète, voir le crédit estimé correct.
- Répartir entre deux enfants ; refus si le total ≠ 100 %.

**Tests attendus.**
- Unitaires : validation de la somme des parts.
- e2e : ajout au panier → répartition → message de crédit correct affiché.

---

## TÂCHE 1.5 — Paiement Stripe, création de commande et écriture des crédits (ATOMIQUE)

**Contexte.** Sections 20, 22 + automatisations 2 et 4. Le moment le plus
sensible : l'argent et le crédit.

**Objectif.** Checkout Stripe ; sur webhook `payment_intent.succeeded`, créer la
commande, ses lignes, calculer et écrire les `order_credits` par bénéficiaire,
le tout dans UNE transaction atomique et idempotente, puis envoyer le courriel de
confirmation.

**Fichiers concernés.**
- `app/api/checkout` (création de session Stripe)
- `app/api/webhooks/stripe` (traitement idempotent)
- `lib/orders/create-order.ts` (transaction atomique)
- `lib/credits/persist.ts` (écrit les crédits via le moteur 1.3)

**Règles.**
- Crédit créé UNIQUEMENT sur webhook confirmé, jamais avant.
- Idempotence : un évènement Stripe rejoué ne crée pas de second crédit (clé =
  id d'évènement Stripe).
- Transaction atomique : commande + lignes + crédits ensemble, rollback si échec.
- Une commande = un seul point de livraison.
- Statut commande `paid`, crédits en `active` (ou `pending` si campagne pas encore
  active), `paid_at` renseigné.
- Écrire `credit_audit_log` à la création des crédits.
- Le `credit_total_cents` de la commande = somme des `order_credits`.

**Critères d'acceptation.**
- Un paiement test Stripe crée 1 commande + les bonnes lignes de crédit.
- Rejouer le même webhook ne duplique rien.
- Une répartition 2 enfants crée exactement 2 `order_credits` cohérents avec 1.3.
- `v_campaign_progress` reflète le montant après paiement.

**Tests attendus.**
- Intégration : simulation de webhook → vérif commande + crédits + idempotence.
- e2e : parcours complet page publique → checkout test → crédit attribué.

---

## TÂCHE 1.6 — Pages publiques (athlète, équipe, club) et page d'accueil

**Contexte.** Sections 3, 5, 6, 7. Point d'entrée des acheteurs (souvent via QR).

**Objectif.** Pages publiques respectant les `hide_*`, avec objectif, montant
amassé, barre de progression, jours restants, bouton « Encourager », packs
recommandés et crédit par achat ; page d'accueil avec le message principal.

**Fichiers concernés.**
- `app/[athleteSlug]`, `app/team/[slug]`, `app/club/[slug]`
- `app/page.tsx` (accueil)
- Utilise les vues publiques `v_public_*` de la tâche 0.4

**Règles.**
- Respecter strictement les masquages (jamais de donnée masquée).
- Le montant amassé vient de `v_beneficiary_credit_totals` / `v_campaign_progress`.
- Mobile-first (section 50) : achat possible en < 3 minutes.
- Message d'accueil : « Achetez vos essentiels. Financez le sport des jeunes. »

**Critères d'acceptation.**
- La page d'un athlète à objectif 500 $ affiche progression et bouton Encourager.
- Un athlète avec `hide_photo=true` n'affiche pas de photo.
- « Encourager » mène au catalogue avec le bénéficiaire pré-sélectionné.

**Tests attendus.**
- e2e : visiter une page publique, cliquer Encourager, arriver au panier avec le
  bon bénéficiaire ; vérifier le respect d'un masquage.

---

## TÂCHE 1.7 — Création de campagne (assistant)

**Contexte.** Sections 16, 17, 53. Un responsable doit créer une campagne en
moins de 15 minutes.

**Objectif.** Assistant de création : type, nom, objectif, dates, bénéficiaire,
participants (athlètes), packs inclus, règle de crédit, génération du slug et de
la page publique, passage en statut `active`.

**Fichiers concernés.**
- `lib/campaigns/*.ts`
- `app/(portal)/campagnes/nouvelle`
- Réutilise QR codes (table `qr_codes`) — génération d'image en tâche 1.5bis si
  séparée, sinon ici.

**Règles.**
- Seuls team_manager / club_admin (selon scope `memberships`) créent.
- Validation : dates cohérentes, au moins un pack, au moins un bénéficiaire.
- À l'activation : générer le slug public et un QR code par campagne (et par
  athlète participant).

**Critères d'acceptation.**
- Un team_manager crée une campagne d'équipe active avec 3 athlètes et 4 packs.
- La page publique de la campagne est accessible après activation.

**Tests attendus.**
- Intégration : création complète → campagne `active` → page accessible.
- Unitaire : refus si dates incohérentes / aucun pack.

---

## Après la Phase 1

Une fois 1.1 à 1.7 verts et déployés sur Vercel, tu as le **flux vendable
complet**. Les tâches suivantes (QR codes téléchargeables, dashboard équipe,
dashboard admin, export commandes, rapport de campagne, livraison groupée,
clôture, calcul des versements) constituent la Phase 1.5 et feront l'objet d'un
second lot de prompts.
