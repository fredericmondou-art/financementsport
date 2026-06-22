# Avancement

## Terminé
- [x] 0.0 Mise en place du dépôt git et de la structure docs/
- [x] 0.1 Initialisation du projet Next.js (commit c826770) — voir
      rapports/RAPPORT-0.1.md (statut partiel : e2e Playwright écrit, non
      exécuté en sandbox).
- [x] 0.2 Migration du schéma + seed + clients DB (commit 39aecf4, puis
      appliqué pour de vrai au projet Supabase le 2026-06-19) — voir
      rapports/RAPPORT-0.2.md.
- [x] 0.3 Authentification et rôles — voir rapports/RAPPORT-0.3.md (statut
      partiel : logique de permissions testée unitairement (15/15 verts),
      trigger SQL écrit mais pas encore collé dans Supabase par Frédéric,
      e2e écrit mais non exécutable en sandbox).
- [x] 0.4 Politiques RLS — voir rapports/RAPPORT-0.4.md. 24 tables RLS + 3 vues
      publiques, appliquées au vrai projet Supabase via le connecteur MCP.
      Bug seed.sql/trigger 0002 découvert et corrigé au passage (voir
      docs/DECISIONS.md).
- [x] Durcissement post-0.4 : migration 0004 (révocation EXECUTE sur les
      fonctions d'aide RLS, suite à l'advisor sécurité) puis 0005 (déplacement
      de ces fonctions vers le schéma `private`, pour corriger une régression
      où 0004 cassait RLS lui-même pour `anon` — voir docs/DECISIONS.md pour
      le détail complet). Les deux migrations sont appliquées en production.
      52/52 tests d'intégration verts, `tsc`/`lint` propres.
- [x] 1.1 Gestion des entités club / équipe / athlète — `lib/slug.ts` (slug
      unique avec suffixe de collision), `lib/auth/permissions.ts` étendu
      (club/équipe/athlète, aligné exactement sur les policies RLS 0003, avec
      la nuance création vs. lecture/mise à jour/suppression pour l'athlète),
      `lib/entities/clubs.ts`/`teams.ts`/`athletes.ts` (CRUD + validation zod
      + règle mineur/guardian_id/consentement), routes
      `app/api/{clubs,teams,athletes}`. Modèle de création admin-driven (pas
      d'auto-service) — voir docs/DECISIONS.md. 104/104 tests verts
      (unitaires + intégration via repos en mémoire, réseau Supabase bloqué
      en sandbox), `tsc --noEmit` et `npm run lint` propres.

- [x] 1.2 Catalogue : produits et packs — `lib/catalog/products.ts` (CRUD
      admin + lecture publique `listPublicProducts`, tri pur testable
      price_asc/price_desc/credit_desc/popularity), routes
      `app/api/products` (GET public, POST admin) et
      `app/api/products/[productId]` (GET public si actif sinon admin, PATCH
      admin), page `app/(shop)/boutique` + `components/product-card.tsx`.
      Aucun changement à `lib/auth/permissions.ts` (déjà correct, voir
      docs/DECISIONS.md). 124/124 tests verts, `tsc --noEmit` et `npm run
      lint` propres.

- [x] 1.3 Moteur de crédit — `lib/credits/resolve-rule.ts` (hiérarchie pure à
      5 niveaux : crédit fixe produit → règle campagne+produit → règle
      campagne → règle produit → règle globale permanente/abonnement,
      `is_active`/campagne inactive respectés, égalité de priorité départagée
      de façon déterministe par l'ordre du tableau), `lib/credits/calculate.ts`
      (`calculateOrderCredits` : crédit par ligne avec bonus de seuil sur le
      sous-total du panier entier + `flat_cents`, `splitCreditAmongBeneficiaries`
      avec arrondi à la baisse et résidu attribué au premier bénéficiaire).
      Tous les critères d'acceptation du cahier vérifiés mot pour mot (Pack
      Saison 120$/15%→18$, répartition 50/50 paire et impaire, taux permanent
      hors campagne). Une commande = une seule campagne de contexte partagée
      par tous les bénéficiaires (pas de campagne par bénéficiaire) — voir
      docs/DECISIONS.md. 125/125 tests verts (101 unitaires + 25 du moteur de
      crédit, dont 1 partagé avec un test existant), `tsc --noEmit` et
      `npm run lint` propres.

- [x] 1.4 Panier et répartition entre bénéficiaires — `lib/cart/cart.ts`
      (récupération/création, `assertCartOwnership` SANS `can()` : panier
      connecté comparé à `user_id`, panier invité à `session_token`, jamais
      l'inverse — `platform_admin` n'a aucun droit spécial sur un panier
      tiers), `lib/cart/items.ts` (ajout/retrait/maj quantité, prix et statut
      actif toujours chargés depuis `lib/catalog/products.ts`, jamais fournis
      par le client, stock validé avant ajout), `lib/cart/beneficiaries.ts`
      (`assertSplitTotals10000`, remplacement complet de la répartition),
      `lib/cart/identity.ts` (cookie `panier_session` httpOnly pour
      l'invité), `lib/cart/attach-guest-cart.ts` (rattachement automatique à
      la connexion, fusion par addition des quantités si l'utilisateur a
      déjà un panier ouvert, répartition jamais fusionnée), `lib/cart/
      estimate-credit.ts` (assemble `lib/credits/calculate.ts`, aucun calcul
      dupliqué). Routes `app/api/cart/*` (surface REST, utile pour Stripe/
      mobile à venir) ET page `app/(shop)/panier` + Server Actions +
      `components/beneficiary-split.tsx` (même style que `app/(auth)/login`,
      aucun composant client dans tout le projet). Rattachement câblé
      automatiquement dans `loginAction`. Décisions autonomes (voir
      docs/DECISIONS.md) : contrôle d'accès panier hors système de rôles,
      sémantique de fusion du panier invité, seul `hide_last_name` respecté
      dans le contexte panier (pas les autres `hide_*`, qui régissent les
      pages publiques de la Tâche 1.6), saisie de la répartition en points de
      base plutôt qu'en pourcentages. 189/189 tests verts (40 nouveaux :
      répartition/validation, crédit estimé, intégration panier via repos en
      mémoire), `tsc --noEmit` et `npm run lint` propres.

- [x] 1.5 Paiement Stripe, création de commande et écriture des crédits —
      `app/api/checkout/route.ts` (session Stripe Checkout, validation/blocage
      stock à la création), `app/api/webhooks/stripe/route.ts` (CŒUR : seul
      point d'écriture de commande/crédit, signature vérifiée sur le corps
      brut, re-validation en direct, jamais bloquant post-paiement),
      `lib/orders/create-order.ts` (appel `supabase.rpc('create_paid_order')`),
      `supabase/migrations/0006_stripe_events_and_order_credit_function.sql`
      (fonction plpgsql atomique : idempotence par `stripe_events.id`,
      décrément de stock `FOR UPDATE` avec plancher à 0, `order_items` +
      `order_credits` + `credit_audit_log`), `lib/credits/persist.ts`
      (agrégation `applied_rule_id`/notes par bénéficiaire),
      `lib/email/build-confirmation-content.ts` +
      `lib/email/send-order-confirmation.ts` (SendGrid, échec non bloquant).
      Décisions autonomes nombreuses (atomicité par RPC unique, divergence du
      traitement du stock épuisé checkout vs. webhook, métadonnées Stripe
      minimalistes, province de taxation par défaut QC, etc.) — voir
      docs/DECISIONS.md. 229/229 tests verts (dont un nouveau test
      d'intégration ciblant directement la fonction SQL `create_paid_order` :
      idempotence, répartition à deux bénéficiaires, stock insuffisant au
      paiement confirmé), `tsc --noEmit` et `npm run lint` propres.

- [x] 1.6 Pages publiques (athlète, équipe, club) et page d'accueil —
      `lib/public/profile.ts` (chargement profil + campagne la plus
      pertinente + progression + packs recommandés, un seul repo par type de
      bénéficiaire), `lib/public/campaign-progress.ts`
      (`pickMostRelevantCampaign` : campagne la plus récemment démarrée,
      `computeCampaignProgress`, `applyAmountsMask` pour `hide_amounts`,
      `computeDaysRemaining`), `lib/public/recommended-products.ts`
      (curation par campagne si définie, sinon catalogue actif complet,
      trié `credit_desc`), pages `app/[athleteSlug]/page.tsx` (404 si
      `show_team_only`), `app/team/[slug]/page.tsx`, `app/club/[slug]/
      page.tsx`, nouvelle page d'accueil `app/page.tsx` (remplace le
      placeholder "en construction" de la Tâche 0.1), migration
      `0007_public_campaign_views.sql` (`v_public_campaign`/
      `v_public_campaign_products`, advisories `SECURITY DEFINER` attendues
      — même pattern que les vues publiques existantes), lien "Encourager"
      relié à `app/(shop)/panier/actions.ts` (`addItemAction` pré-attache le
      bénéficiaire à 100 % uniquement si le panier n'a encore aucune
      répartition). Décisions autonomes (voir docs/DECISIONS.md) :
      tie-break de sélection de campagne, 404 plutôt que redirection pour
      `show_team_only`, `campaign_participants` hors scope, contenu
      éditorial de la page d'accueil. Un bug de cache mount/git découvert et
      réparé au passage (voir docs/DECISIONS.md) a aussi révélé et restauré
      un ajout (Tâche 1.5, `markCartConverted`) resté invisible à git depuis
      sa création. 263/263 tests verts, `tsc --noEmit` et `npm run lint`
      propres.

- [x] 1.7 Création de campagne (assistant) — `supabase/migrations/
      0008_campaign_creation_assistant.sql` (fonction atomique
      `create_campaign_with_details` SECURITY INVOKER : campagne + participants
      + packs + règle de crédit optionnelle + QR codes en une seule
      transaction ; policies `credit_rules_campaign_manager_insert`/`_update`
      self-service plafonné 50 %/100 $ ; correction au passage du bug RLS
      `credit_rules` sans policy SELECT client/invité), `lib/campaigns/
      create-campaign.ts` (validation zod + plafonds + périmètre athlètes/
      bénéficiaire), `lib/campaigns/manager-scope.ts`, `lib/campaigns/
      qr-codes.ts`, route `app/api/campaigns`, assistant
      `app/(portails)/campagnes/nouvelle`. Statut toujours `active` à la
      création (pas de brouillon), génération de l'image QR différée à la
      Phase 1.5 (seule la couche de données est dans le scope). Décisions
      autonomes et confirmées par Frédéric (plafonds self-service) — voir
      docs/DECISIONS.md. Une troisième manifestation du bug de cache mount/git
      rencontrée et réparée (octets nuls en fin de fichier après une édition)
      — voir docs/DECISIONS.md. 281/281 tests verts (13 nouveaux unitaires +
      5 nouveaux d'intégration contre une vraie transaction Postgres),
      `tsc --noEmit` et `npm run lint` propres.

- [x] Audit complet du code (Tâches 0.0–1.7) et refactorisation
      structurelle — voir docs/AUDIT-1.0.md pour le rapport complet et
      docs/DECISIONS.md pour le détail de chaque correction. Aucun
      changement à la logique métier déjà testée. Résumé : suppression de
      `supabase/a-coller-manuellement/` (superseded par les migrations) et
      de `lib/validation/` (jamais peuplé, code mort) ; mise à jour de 5
      README de stub devenus faux ; factorisation de `getEnv()` dans
      `lib/env.ts` ; nettoyage de 4 `.gitkeep` redondants ; déplacement des
      pages publiques dans `app/(public)/` (sans impact sur les URLs) ;
      harmonisation de l'emplacement des tests `credits` vers
      `tests/unit/`. Deux nouvelles manifestations du bug de cache
      mount/git rencontrées et réparées au passage (cette fois sur
      `.git/index` lui-même) — voir docs/DECISIONS.md. 281/281 tests
      verts, `tsc --noEmit` et `npm run lint` propres après chaque
      changement.

- [x] Phase 1.4 — Tâche 1.4.1 : Direction visuelle — `docs/DESIGN.md`
      + 3 maquettes statiques `docs/maquettes/*.html`. Approuvée par
      Frédéric (réponse « Oui c'est parfait » à `docs/QUESTIONS.md`).

- [x] Phase 1.4 — Tâche 1.4.2 : Design tokens + composants UI de base —
      `app/globals.css` (tokens CSS natifs reflétant `docs/DESIGN.md` :
      couleurs, typographie `next/font` Inter/Outfit, espacements, rayons,
      ombres, `--focus-ring`), 9 composants `components/ui/*` (Button,
      Badge, Alert, Card, Field, ProgressBar, Spinner, ErrorState, Modal +
      ModalDemo de démonstration), page interne `app/styleguide/page.tsx`
      (non indexée, non liée depuis la navigation) affichant tous les
      composants dans leurs états. Seules deux exceptions `'use client'` de
      tout le projet (Modal, pour l'élément natif `<dialog>` ; ModalDemo,
      démo locale à `/styleguide` uniquement) — voir docs/DECISIONS.md.
      Composants accessibles (focus visible via `:focus-visible` uniquement,
      attributs ARIA : `aria-describedby`/`aria-invalid` sur Field,
      `role="alert"`/`role="status"` sur Alert/Spinner/ErrorState,
      `role="progressbar"` sur ProgressBar, sémantique modale native sur
      Modal). 9 nouveaux fichiers de test de rendu (`tests/unit/ui-*.test.tsx`,
      `@testing-library/react` + jsdom via `// @vitest-environment jsdom`).
      Plusieurs nouvelles manifestations du bug de cache mount/git
      rencontrées et réparées (voir docs/DECISIONS.md).
      Re-vérification finale (passe complète, pas seulement les fichiers
      ciblés) : 3 bugs réels trouvés et corrigés — `vitest.config.ts`
      n'incluait pas `tests/unit/**/*.test.tsx` (9 fichiers de test invisibles
      au premier run) ; absence de `afterEach(cleanup())` dans
      `tests/setup/jest-dom.ts` (DOM non réinitialisé entre tests d'un même
      fichier) ; `Spinner` imbriqué dans `Button` polluait le nom accessible
      du bouton en chargement (nouveau prop `inline`, voir docs/DECISIONS.md).
      État final : 33 fichiers / 313 tests verts, `tsc --noEmit` et
      `npm run lint` propres, aucune régression Phase 1.

- [x] Phase 1.4 — Tâche 1.4.3 : Navigation, layouts et changements de page —
      `middleware.ts` (pose un en-tête `x-pathname` pour le lien actif sans
      hook client), `components/nav/{site-header,site-footer,nav-link}.tsx`
      (en-tête sticky avec marque/nav/actions, menu mobile en `<details>`/
      `<summary>` natif sans JS — troisième composant du projet après
      Modal/ModalDemo à approcher l'interactivité, mais entièrement
      server-rendu), `app/layout.tsx` (intègre header/footer + lien
      d'évitement + `id="contenu-principal"`), `app/loading.tsx` (état de
      chargement global, header/footer jamais démontés). Navigation adaptée
      au rôle (lien « Campagnes » si `team_manager`/`club_admin`, direct ou
      via `memberships`). Décisions autonomes (voir docs/DECISIONS.md) :
      mapping des zones génériques de la tâche vers les groupes réels du
      projet (header/footer injectés une seule fois à la racine plutôt que
      des layouts par groupe, `(financement)`/`(operations)` toujours vides),
      pas de lien back-office tant qu'aucune page n'existe. Une nouvelle
      manifestation du bug de cache mount/git sur `app/layout.tsx` (même
      fichier qu'à la Tâche 1.4.2) rencontrée et réparée. `tests/e2e/
      navigation.spec.ts` (desktop + viewport mobile 375px), non exécutable
      dans ce bac à sable comme les e2e précédents. État final : 33 fichiers
      / 313 tests verts (aucune régression, aucun nouveau test unitaire
      attendu pour cette tâche), `tsc --noEmit` et `npm run lint` propres.

- [x] Phase 1.4 — Tâche 1.4.4 : Application du design aux pages existantes —
      habillage présentation-only des 10 pages Phase 1 (accueil, pages
      publiques athlète/équipe/club, boutique, panier, login, signup,
      compte, assistant de création de campagne) et des composants
      `product-card.tsx`/`beneficiary-split.tsx` avec les primitives
      `components/ui/*` et de nouvelles classes utilitaires dans
      `app/globals.css` (`.page`, `.stack`, `.form`, `.table`,
      `.product-grid`, `.public-profile__*`, `.checkbox-list`). Aucun
      changement de logique métier ; tous les textes/`role`/`aria-*`/
      `data-testid` requis par les e2e existants vérifiés mot pour mot.
      Trois nouvelles manifestations du bug de cache mount/git rencontrées
      et corrigées par écriture directe via heredoc (voir docs/DECISIONS.md).
      État final : 33 fichiers / 313 tests verts (aucune régression),
      `tsc --noEmit` et `npm run lint` propres, `npx playwright test --list`
      confirme les 9 tests e2e toujours valides (exécution réelle bloquée en
      sandbox comme depuis la Tâche 0.1).

- [x] Phase 1.4 — Tâche 1.4.5 : Accessibilité, performance et finitions —
      `app/not-found.tsx` (404) et `app/error.tsx` (500, limite d'erreur
      globale, bouton « Réessayer » → `reset()`) en français, habillées avec
      `Card`/`Button` et les classes `.error-state*` existantes.
      `lib/env.ts` gagne `getPublicAppUrl()` ; `app/layout.tsx` définit
      `metadataBase` + valeurs `openGraph`/`twitter` par défaut ; les trois
      pages publiques (athlète/équipe/club) ont chacune un `generateMetadata`
      qui ne référence jamais les montants masqués par `hide_amounts` (aperçu
      de partage social correct sur Messenger/Facebook, section 54).
      `next.config.js` autorise `next/image` sur `*.supabase.co` (annule la
      décision « pas d'optimisation Next.js » de la Tâche 1.2/1.6, cette
      tâche le demande explicitement) ; avatars et image de catalogue
      converties en `<Image>`. Audit accessibilité automatisé : décision
      autonome de s'appuyer sur `eslint-plugin-jsx-a11y` (déjà inclus via
      `eslint-config-next` depuis la Tâche 1.4.2) plutôt que d'ajouter
      jest-axe/playwright-axe — `npm run lint` propre. 9 messages d'état vide
      passés de `<p>` brut à `<Alert variant="info">` (texte inchangé
      partout). Deux nouvelles manifestations du bug de cache mount/git
      rencontrées et réparées par réécriture heredoc complète (voir
      docs/DECISIONS.md) — réaffirmation définitive : l'outil Edit ne doit
      plus jamais être utilisé sur ce mount. État final : 35 fichiers / 317
      tests verts (313 existants + 4 nouveaux : `app-error.test.tsx`,
      `app-not-found.test.tsx`), `tsc --noEmit` et `npm run lint` propres,
      `npx playwright test --list` confirme 11 tests e2e dans 5 fichiers (9
      existants + 2 nouveaux dans `tests/e2e/error-pages.spec.ts`) ;
      exécution réelle toujours bloquée en sandbox comme depuis la Tâche 0.1.

## En cours
- [ ] Phase 1.4 — Tâche 1.4.6 : Déploiement Vercel.

## À venir
- (rien après la Phase 1.4 dans le cahier des charges fourni à ce jour)
