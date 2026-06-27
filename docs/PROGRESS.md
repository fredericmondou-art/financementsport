# Avancement

## Terminé
- [x] 0.0 Mise en place du dépôt git et de la structure docs/
- [x] 0.1 Initialisation du projet Next.js (commit c826770) — voir
      docs/rapports/RAPPORT-0.1.md (statut partiel : e2e Playwright écrit, non
      exécuté en sandbox).
- [x] 0.2 Migration du schéma + seed + clients DB (commit 39aecf4, puis
      appliqué pour de vrai au projet Supabase le 2026-06-19) — voir
      docs/rapports/RAPPORT-0.2.md.
- [x] 0.3 Authentification et rôles — voir docs/rapports/RAPPORT-0.3.md (statut
      partiel : logique de permissions testée unitairement (15/15 verts),
      trigger SQL écrit mais pas encore collé dans Supabase par Frédéric,
      e2e écrit mais non exécutable en sandbox).
- [x] 0.4 Politiques RLS — voir docs/rapports/RAPPORT-0.4.md. 24 tables RLS + 3 vues
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

- [x] Phase 1.4 — Tâche 1.4.6 (partie applicative) : gap découvert en testant
      le parcours d'achat de bout en bout sur le déploiement Vercel — le
      bouton de paiement (`panier` → Stripe Checkout) et la page
      `/commande/confirmation` n'avaient jamais été construits dans aucun
      commit antérieur (`success_url` pointait vers une page inexistante,
      404 réelle). Corrigé : `lib/checkout/create-checkout-session.ts`
      (orchestration extraite de `app/api/checkout/route.ts`, qui devient un
      mince adaptateur HTTP de compatibilité, pour être appelée aussi par la
      nouvelle Server Action), `checkoutAction` ajoutée à
      `app/(shop)/panier/actions.ts` + bouton « Procéder au paiement » sur
      `app/(shop)/panier/page.tsx`, nouvelle page minimale
      `app/(shop)/commande/confirmation/page.tsx` (volontairement sans
      lecture Stripe/Supabase — décision sécurité/latence webhook détaillée
      dans le fichier lui-même et docs/DECISIONS.md), `locale: 'fr-CA'`
      ajouté à la session Stripe Checkout (gap distinct : sans ce paramètre,
      la page de paiement hébergée restait en anglais pour la majorité des
      clients, CLAUDE.md section 2). Nouveau test e2e
      `tests/e2e/checkout.spec.ts` couvrant le parcours complet (carte test
      4242, vérification du crédit attribué en base via `service_role`),
      même statut que les e2e précédents (`npx playwright test --list` le
      confirme valide, exécution réelle bloquée en sandbox). Plusieurs
      nouvelles manifestations sévères du bug de cache mount/git rencontrées
      sur les 4 fichiers touchés (NUL en fin de fichier à longueur identique
      ou non, troncature réelle en plein mot, désaccord Read/bash sur le même
      fichier) puis sur `lib/checkout/create-checkout-session.ts` lui-même
      après l'ajout du `locale` — toutes réparées par réécriture heredoc
      complète + vérification indépendante (voir docs/DECISIONS.md, mémoire
      persistante mise à jour). 282/282 tests verts (281 existants, aucune
      régression ; le nouveau test e2e n'est pas compté dans cette suite
      Vitest), `tsc --noEmit` et `npm run lint` propres.

- [x] Phase 1.4 — Tâche 1.4.6 (clôture) : vérification réelle de bout en
      bout effectuée le 2026-06-23 sur https://financementsport.vercel.app/
      avec le navigateur de Frédéric (l'outil de navigation autonome refuse
      tout accès — même lecture — à checkout.stripe.com, restriction de
      sécurité du produit sur les domaines de paiement ; Frédéric a donc
      rempli lui-même le formulaire de paiement avec la carte de test 4242
      4242 4242 4242). Résultat vérifié directement en base (Supabase
      production, projet `zebskpuphqeattetznrg`) : commande `a9c76136-...`
      statut `paid`, total 8049 ¢ (70,00 $ + TPS/TVQ QC 14,98 % = 80,49 $,
      calcul exact) ; crédit de 1000 ¢ attribué à l'athlète Thomas Tremblay
      (`order_credits`, statut `active`) ; évènement Stripe
      `evt_1TlIScLRciJeuoQRpgSC9Hmq` (`checkout.session.completed`,
      `livemode: false`, `locale: fr-CA` confirmé) enregistré dans
      `stripe_events` pour l'idempotence ; page `/commande/confirmation`
      affichée correctement avec le bon `session_id`. `docs/DEPLOIEMENT.md`
      déjà rédigé (commit 622b9a1). Tous les critères d'acceptation de la
      Tâche 1.4.6 sont remplis.

- [x] Phase 1.6, Tâche 1.6.A1 — Achat invité fluide (page athlète →
      paiement) : la plupart des critères étaient déjà couverts par la
      Phase 1 (achat sans compte, bénéficiaire pré-sélectionné depuis la
      page athlète, message d'impact au panier, `locale: 'fr-CA'`, Apple
      Pay/Google Pay déjà offerts par Stripe Checkout hébergé sans
      restriction de `payment_method_types` — décision documentée dans
      docs/DECISIONS.md). Vrai correctif apporté à
      `app/(shop)/panier/page.tsx` : affichage du **nom** du produit
      (`lib/catalog/products.ts`) au lieu de son UUID brut (échec du test
      « 3 secondes » de la Phase 1.6), retrait du formulaire dev-only
      « Ajouter un produit » par UUID (jamais destiné à un vrai client),
      remplacé par un lien « Continuer mes achats ». Nouveau test e2e
      mobile (viewport 375×720) ajouté à `tests/e2e/checkout.spec.ts`
      (parcours factorisé dans `runGuestPurchaseFlow`, rejoué desktop +
      mobile). `tsc --noEmit` propre, `eslint .` propre, `vitest run` :
      35 fichiers / 317 tests verts (aucune régression).

- [x] Phase 1.6, Tâche 1.6.A2 — Création de compte encouragée après l'achat :
      `lib/orders/attach-guest-orders.ts` (réassigne uniquement
      `orders.user_id`, jamais un crédit -- pas de `credit_audit_log`),
      `app/(shop)/commande/confirmation/actions.ts` (Server Action
      `createAccountFromOrderAction`, mot de passe seulement -- le courriel
      n'est JAMAIS pris d'un champ de formulaire, toujours relu depuis
      Stripe via `session_id`), `app/(shop)/commande/confirmation/page.tsx`
      étendue (CTA de création de compte si invité + courriel Stripe
      résolu, masquée si déjà connecté). Rattachement scoped au seul
      parcours post-achat (jamais généralisé au formulaire d'inscription
      public, risque de squat de compte par courriel connu d'un tiers) —
      voir docs/DECISIONS.md. Échec d'inscription = commande inchangée ;
      échec de rattachement = journalisé seulement, jamais bloquant. 2
      nouveaux tests d'intégration contre un vrai Postgres embarqué (avec
      les vraies migrations/policies RLS) + 3 unitaires. 37 fichiers / 322
      tests verts (aucune régression), `tsc --noEmit` et `npm run lint`
      propres.

- [x] Phase 1.6, Tâche 1.6.A3 — Espace parent : suivi, reçus et rachat en un
      clic — migration `0009_order_credits_select_own_order.sql` (policy RLS
      additive corrigeant une lacune : le propriétaire d'une commande ne
      pouvait pas lire le crédit que son propre achat avait généré),
      `lib/orders/list-orders.ts` (`groupOrderDetails` : historique complet
      toutes commandes/statuts ; `summarizeImpactByBeneficiary` : impact
      réel, crédits `active`/`pending` seulement), `lib/reorder/reorder.ts`
      (`buildReorderPlan` : revalidation catalogue actuel, additif au panier
      existant ; `deriveBeneficiarySplitFromCredits` : répartition exacte
      reconstruite depuis les crédits figés, appliquée sans condition),
      `components/print-button.tsx` (reçu imprimable via `window.print()`,
      aucune librairie PDF ajoutée), page reçu
      `app/(portails)/compte/commandes/[id]/recu/page.tsx`,
      `app/(portails)/compte/page.tsx` et `app/(shop)/panier/page.tsx`
      étendues. Décisions autonomes (lacune RLS, pas de librairie PDF,
      rachat additif, écrasement délibéré de la répartition au rachat,
      filtre de statut différent entre impact et historique) — voir
      docs/DECISIONS.md. 14 nouveaux tests unitaires + 5 nouveaux
      d'intégration (Postgres embarqué, prouvant le trou RLS puis sa
      correction) + 1 nouveau e2e (non exécutable en sandbox, comme les
      précédents). 40 fichiers / 341 tests verts (aucune régression),
      `tsc --noEmit` et `eslint .` propres.

- [x] Phase 1.6, Tâche 1.6.A4 — Répartition entre plusieurs enfants, version
      simple — `components/beneficiary-split.tsx` devient un Client
      Component (égalisation automatique à l'ajout/retrait, ajustement
      manuel qui force le total à 100 %, impact par bénéficiaire affiché en
      direct via `splitCreditAmongBeneficiaries`), nouvelles fonctions pures
      `equalSplitBps`/`splitBpsEqually` (`lib/cart/beneficiaries.ts`, même
      convention d'arrondi — reliquat au premier — que le reste du projet).
      Server Action et validation serveur inchangées (aucune duplication de
      la règle « somme = 10000 »). Bug réel trouvé et corrigé : `equalizeAll()`
      ne réégalisait pas la dernière ligne restante après un retrait. Décisions
      autonomes (Client Component scoping, convention d'arrondi, redistribution
      égale plutôt que proportionnelle à l'ajustement) — voir docs/DECISIONS.md.
      25 nouveaux tests unitaires (8 fonctions pures + 7 composant, plus
      ajustements de tests existants), aucune régression sur les suites déjà
      en place, `tsc --noEmit` et `eslint .` propres.

- [x] Phase 1.6, Tâche 1.6.B1 — Assistant de campagne pas-à-pas avec
      sauvegarde automatique — refonte complète de `app/(portails)/
      campagnes/nouvelle` (formulaire unique de la Tâche 1.7) en assistant à
      6 étapes pilotées par `?etape=1..6` (type/nom → bénéficiaire →
      objectif/dates → participants → packs → récapitulatif), chaque étape
      son propre `<form>` Server Component natif. Persistance exclusivement
      serveur (`campaign_drafts`, migration 0010, RLS propriétaire seul,
      reprise multi-appareil sans cookie/localStorage). Retrait complet de
      la section « Règle de crédit » (principe du Bloc B :
      `buildCampaignInputFromDraft` force toujours `creditRule: null`).
      Nouveaux fichiers : `lib/campaigns/draft.ts` (validation par étape,
      fusion superficielle, assemblage final), `components/wizard/*`
      (progression + navigation « Revenir »/« Continuer »),
      `app/(portails)/campagnes/nouvelle/actions.ts` (Server Actions par
      étape, `redirect()` toujours hors try/catch). `lib/campaigns/
      create-campaign.ts` exporte désormais `campaignBaseSchema` pour que
      les schémas par étape n'aient pas à redupliquer les énumérations.
      9e à 12e manifestations du bug de cache mount/git rencontrées et
      réparées (voir docs/DECISIONS.md). 15 nouveaux tests unitaires
      (`tests/unit/campaign-draft.test.ts`), aucune régression,
      `tsc --noEmit` propre.

- [x] Phase 1.6, Tâche 1.6.B2 — Défauts intelligents et saisie des athlètes
      sans douleur — `lib/campaigns/defaults.ts#applyCampaignDefaults`
      préremplit type/nom, bénéficiaire (équipe prioritaire sur club), dates
      (60 jours par défaut), participants et packs (tout sélectionné) sans
      jamais écraser un choix déjà fait ; aucune règle de crédit/taux exposée
      au responsable. `lib/athletes/bulk-add.ts` ajoute la saisie en lot par
      liste collée (`parsePastedAthleteList`, `detectDuplicates`,
      `bulkCreateAthletesFromPastedList`) : un par ligne, séparateurs
      tabulation/virgule/espace, doublons signalés (contre l'équipe ET dans
      la liste) sans être créés. Assouplissement décidé avec l'utilisateur
      (question bloquante, voir docs/DECISIONS.md) : `athleteInputSchema`
      (`lib/entities/athletes.ts`) accepte désormais un mineur sans
      `guardianId` — création jamais bloquée, mais profil définitivement non
      publiable tant qu'un tuteur/consentement n'est pas lié. 13e à 16e
      manifestations du bug de cache mount/git rencontrées et réparées (voir
      docs/DECISIONS.md). 38 nouveaux tests unitaires
      (`campaign-defaults.test.ts`, `athletes-bulk-add.test.ts`, 4 cas
      ajoutés à `entities-validation.test.ts`) + `tests/e2e/
      campagne-defauts-bulk.spec.ts` (création tout-par-défaut + collage de
      15 noms, non exécutable dans ce bac à sable). 395 tests verts au
      total, `tsc --noEmit`/`eslint .` propres.

- [x] Phase 1.6, Tâche 1.6.B3 — Aperçu, activation et écran « prochaines
      actions » — `components/public-profile-view.tsx` extrait comme rendu
      partagé unique entre les 3 pages publiques ET l'aperçu du
      récapitulatif de l'assistant (`RecapStep`, via
      `lib/public/preview.ts#loadBeneficiaryPreviewIdentity`), pour éviter
      toute divergence entre l'aperçu et la vraie page publique. Mécanisme
      `retour=recap` (champ caché `<ReturnToField>`, `saveStepAndAdvance`
      dans `app/(portails)/campagnes/nouvelle/actions.ts`) : corriger une
      section ramène directement au récapitulatif en un seul clic après
      l'ouverture de l'étape. Bouton d'activation « Lancer ma campagne » →
      nouvel écran `app/(portails)/campagnes/[campaignId]/demarrage`
      (4 actions concrètes : copier le lien, copier le message aux parents
      via `lib/campaigns/demarrage-message.ts#buildParentMessage` — un seul
      gabarit pour les 3 types de bénéficiaire —, affiche imprimable, suivi
      des ventes ; lien Messenger via `fb-messenger://`, pas l'API Graph).
      Décisions autonomes (composant d'aperçu partagé, sémantique de
      `retour=recap`, Messenger en lien profond plutôt qu'intégration Graph,
      écran de démarrage volontairement limité à des actions plutôt qu'un
      tableau de bord complet, gabarit de message unique, nom de route
      `[campaignId]`) — voir docs/DECISIONS.md. Bug réel trouvé et corrigé :
      `userEvent.setup()` (testing-library v14) écrase silencieusement le
      mock `navigator.clipboard` posé avant son appel — voir
      docs/DECISIONS.md. 414/414 tests verts (395 existants + 19 nouveaux :
      `campaign-demarrage-message.test.ts`, `campaign-draft-preview.test.ts`,
      `public-preview.test.ts`, `copy-button.test.tsx`) + 1 nouveau e2e
      (`campagne-apercu-correction.spec.ts`, non exécutable en sandbox comme
      les précédents), `tsc --noEmit` et `eslint .` propres.

- [x] Phase 1.6, Tâche 1.6.C1 — Profil athlète éditable + page publique soignée
      — `lib/athletes/profile.ts` (`loadOwnerCampaignSection` : objectif de la
      campagne active affiché au tuteur, sans jamais lire `v_public_athlete`
      ni appliquer `applyAmountsMask` -- voir docs/DECISIONS.md ; `MyAthletesRepo`
      pour « Mes athlètes »), `lib/entities/athletes.ts` étendu (`photoUrl`,
      même convention que `logoUrl`), page `app/(portails)/compte/athletes`
      (liste scopée `guardian_id`/`user_id` strictement) et
      `app/(portails)/compte/athletes/[athleteId]` (édition message/photo/
      sport/ville + section « Confidentialité » rendue seulement si
      `canEditHiddenAthleteFields`, objectif de campagne en lecture seule),
      page publique athlète enrichie. Décisions autonomes (pas de nouveau
      champ « objectif personnel », loader privé séparé du loader public,
      scindage des permissions d'édition, périmètre strict de « Mes
      athlètes ») — voir docs/DECISIONS.md. 12 nouveaux tests (8
      intégration + 4 unitaires zod), aucune régression, `tsc --noEmit` et
      `eslint .` propres. Nouveau e2e `tests/e2e/athlete-profile-edit.spec.ts`
      (édition → page publique reflète les changements → respect de
      `hide_photo`/`hide_city`), non exécutable en sandbox comme les
      précédents -- suppose un jeu `supabase/seed-e2e.sql` toujours à créer.

- [x] Phase 1.6, Tâche 1.6.C2 — Suivi de progression et partage pour
      l'athlète — migration `0011_campaign_supporter_count_view.sql`
      (`v_campaign_supporter_count`, agrégat sans PII contournant le trou RLS
      de `order_credits` pour un tuteur non-acheteur -- voir docs/DECISIONS.md),
      `lib/athletes/profile.ts#loadAthleteSuivi` (compose
      `loadOwnerCampaignSection` + `repo.getSupporterCount`, `null` si aucune
      campagne active distinct de `0` supporter), `lib/athletes/
      share-message.ts#buildAthleteShareMessage` (message pré-rédigé à la
      troisième personne, cadre parental), page
      `app/(portails)/compte/athletes/[athleteId]/suivi` (objectif/montant/
      supporters, AUCUN palmarès, partage en un clic : copier le lien, copier
      le message, courriel, Messenger -- mêmes briques que l'écran de
      démarrage de campagne, Tâche 1.6.B3 ; QR code toujours différé à la
      Tâche 1.7), lien « Voir mon suivi » ajouté à `app/(portails)/compte/
      athletes/page.tsx`. Une nouvelle manifestation (la 17e à 20e selon le
      fichier touché) du bug de cache mount/git rencontrée et réparée par
      réécriture heredoc complète à chaque occurrence (voir mémoire
      persistante `mount-staleness-ecommerce.md`). 18 tests d'intégration
      (4 nouveaux pour `loadAthleteSuivi`) + 3 nouveaux tests unitaires
      (`athlete-share-message.test.ts`) verts, aucune régression,
      `tsc --noEmit` propre. Nouveau e2e `tests/e2e/athlete-suivi.spec.ts`
      (consulter le suivi → partager le lien → message pré-rédigé), non
      exécutable en sandbox comme les précédents -- suppose le même jeu
      `supabase/seed-e2e.sql` (toujours à créer) qu'`athlete-profile-edit.spec.ts`.
      **Phase 1.6 (Blocs A, B, C) entièrement complétée.**
- [x] 1.5.1 QR codes téléchargeables (PNG/PDF) — `lib/qr/generate.ts`
      (`generateQrPngBuffer`/`generateQrPdfBuffer`, libs `qrcode`/`pdf-lib`),
      `lib/qr/resolve-target.ts` (résolution pure injectable : athlète/équipe/
      club → page publique respectant `hide_*` ; campagne active → page du
      bénéficiaire, tout autre statut → `/boutique` ; produit → `/boutique` ;
      `redirect_url`/`expires_at` prioritaires), migration 0012
      (`resolve_and_count_qr_scan`, lecture+incrément atomique en un seul
      `UPDATE ... RETURNING`), `app/api/qr/[code]/route.ts` (résolution
      PUBLIQUE du scan, client `service_role`, redirection + incrément sans
      bloquer si l'écriture échoue), `app/api/qr/[code]/{png,pdf}/route.ts`
      (téléchargement, client anon/RLS via la policy `qr_codes_scoped`
      existante, URL encodée TRAÇABLE `/api/qr/[code]` plutôt que l'URL
      publique finale), page `app/(portails)/campagnes/[campaignId]/qr` (un
      QR par campagne + un par athlète participant, découvert dans la
      logique déjà existante de `create-campaign.ts`), lien ajouté à l'écran
      de démarrage (`demarrage/page.tsx`, action « 4. Télécharger les codes
      QR », renumérotation de « Suivre les ventes » en 5). Cinquième
      manifestation du bug de cache mount/git rencontrée et réparée (cette
      fois sur des fichiers neufs après un deuxième passage d'édition --
      mémoire `mount-staleness-ecommerce.md` mise à jour). 41/41 tests
      unitaires + 11/11 fichiers d'intégration verts (dont 21 nouveaux tests
      `qr-resolve-target`, 6 nouveaux `qr-generate`, 4 nouveaux
      `qr-scan-increment`), aucune régression, `tsc --noEmit`/`eslint .`
      propres. Nouveau e2e `tests/e2e/campagne-qr.spec.ts`, non exécutable en
      sandbox (même limitation réseau que les précédents). Voir
      docs/rapports/RAPPORT-1.5.1.md et docs/DECISIONS.md.
- [x] 1.5.2 Génération automatique d'affiches — `lib/posters/generate.ts`
      (`buildPosterContent` pur + `generatePosterPdfBuffer`, 3 formats lettre/
      carré/story en PDF via `pdf-lib`, jamais de raster PNG/JPEG -- aucune
      lib de composition d'image dans le projet) ; QR intégré réutilise le
      code `qr_codes` existant (`target_type = 'campaign'`, repli sur l'URL
      publique si absent) ; `hide_amounts` masque uniquement `goalCents`,
      jamais le prix des forfaits (même portée que `applyAmountsMask`
      existant) ; une affiche par campagne, pas par athlète participant.
      Nouvelle page `app/(portails)/campagnes/[campaignId]/affiches` +
      nouvelle route `app/api/campagnes/[campaignId]/affiches/[format]`,
      nouvelle carte « 5. Télécharger les affiches » ajoutée à l'écran de
      démarrage (ancienne affiche texte simple de la Tâche 1.6.B3 conservée
      intacte, « Suivre les ventes » renuméroté 4→6). Onzième et douzième
      manifestations du bug de cache mount/git (deux fichiers tronqués après
      une seconde édition dans la même tâche), réparées par réécriture
      heredoc + revérification octets nuls. Bug ESLint distinct trouvé et
      corrigé : `eslint-disable-next-line` réparti sur 3 lignes ne
      désactive pas l'avertissement -- corrigé en replaçant la directive
      immédiatement au-dessus du `<img>` visé. `tsc --noEmit`/`eslint .`
      propres, 29/29 fichiers unitaires verts (321 tests au total dont 16
      nouveaux pour `posters-generate.test.ts`), aucune régression. Nouveau
      e2e `tests/e2e/campagne-affiches.spec.ts`, non exécutable en sandbox
      (même limitation réseau que les précédents). Voir
      docs/rapports/RAPPORT-1.5.2.md et docs/DECISIONS.md.
- [x] 1.5.3 Saved splits (répartitions favorites) — migration 0013
      (`saved_splits`/`saved_split_items`, RLS propriétaire), `lib/cart/
      saved-splits.ts` (`saveSplitAsNamed`/`listSavedSplitsForUser`/
      `deleteSavedSplit`/`findInactiveItems`, réutilise intégralement
      `assertSplitTotals10000`/`beneficiarySplitInputSchema` de la Tâche
      1.4, aucune validation dupliquée), nouvelle fonction sœur
      `loadBeneficiaryActiveStatus` dans `lib/cart/beneficiary-labels.ts`.
      `components/beneficiary-split.tsx` étendu avec un sélecteur « Charger
      une répartition favorite », un formulaire « Enregistrer comme
      répartition favorite » et une liste « Mes répartitions favorites »
      avec suppression -- tout masqué pour un invité (`canSaveSplits`
      faux), jamais affiché désactivé. Une répartition favorite référençant
      un bénéficiaire devenu inactif ou supprimé affiche un avertissement
      non bloquant (`role="alert"`) après chargement. Bug d'infrastructure
      de test trouvé et corrigé : `GRANT ... ON ALL TABLES IN SCHEMA
      public` n'est pas rétroactif en Postgres -- déplacé pour s'exécuter
      après la boucle complète de migrations plutôt que juste après la
      migration 0001 (sinon `saved_splits`/`saved_split_items`, créées à la
      migration 0013, n'héritent jamais du GRANT). 11 nouveaux tests
      unitaires (`saved-splits.test.ts`) + 5 nouveaux tests d'intégration
      RLS (`saved-splits-rls.test.ts`, vrai Postgres embarqué) + tests
      `beneficiary-split.test.tsx` étendus, tous verts, aucune régression.
      `tsc --noEmit`/`eslint .` propres. Voir docs/rapports/RAPPORT-1.5.3.md
      et docs/DECISIONS.md.
- [x] 1.5.4 Liste de distribution par équipe — migration 0014
      (`orders_select_campaign_managers`/`order_items_select_campaign_managers`/
      `profiles_select_campaign_buyers`, policies SELECT additives via
      `private.manages_campaign()`, n'altère aucune policy existante),
      `lib/distribution/build-list.ts` (groupement athlète → client →
      produits, statut de paiement, tri automatique),
      `lib/export/csv.ts`/`lib/export/pdf.ts` (réutilisables, alimentés par
      la même fonction `flattenDistributionGroups` pour garantir des données
      identiques entre les deux formats), page
      `app/(portails)/campagnes/[campaignId]/distribution` + routes API
      d'export CSV/PDF. Une commande partagée entre plusieurs bénéficiaires
      apparaît dans chacun de leurs groupes (sémantique de livraison
      physique, pas de répartition financière). 24 nouveaux tests
      (`distribution-build-list.test.ts` -- 11, `distribution-export.test.ts`
      -- 7, `distribution-rls.test.ts` -- 6, vrai Postgres embarqué), tous
      verts. Suite complète relancée (46 fichiers unitaires + 13 fichiers
      d'intégration), aucune régression. `tsc --noEmit`/`eslint .` propres.
      Voir docs/rapports/RAPPORT-1.5.4.md et docs/DECISIONS.md.

- [x] **1.5.5 — Confirmation de réception et livraison groupée.** Migration
      `0015_order_status_transitions.sql` (table `order_status_log` traçable,
      fonction gardée `advance_order_status` en `SECURITY DEFINER` --  même
      patron que `create_paid_order`, migration 0006 -- aucune policy RLS
      `UPDATE` additive sur `orders`, c'est le seul chemin d'écriture pour
      team_manager/club_admin), `lib/orders/status.ts` (machine de
      transitions pure, miroir manuel de la table plpgsql), page
      `app/(portails)/campagnes/[campaignId]/livraison` + Server Action.
      Notification `email_log` seulement à distribué/complété, jamais à la
      réception interne. Bug trouvé et corrigé avant tout commit :
      `public.is_platform_admin()`/`public.current_user_role()` n'existent
      plus depuis la migration 0005 (déplacées vers `private.*`), détecté
      uniquement parce que le test d'intégration rejoue les migrations
      contre un vrai Postgres embarqué. 43 nouveaux tests
      (`orders-status.test.ts` -- 37, `order-status-transitions-rls.test.ts`
      -- 6), tous verts. Suite complète relancée (46 fichiers unitaires,
      175+ tests + 14 fichiers d'intégration, 127 tests), aucune régression.
      `tsc --noEmit`/`eslint .` propres. Voir docs/rapports/RAPPORT-1.5.5.md
      et docs/DECISIONS.md.

- [x] **1.5.6 — Dashboard équipe.** Migration `0016_payouts_campaign_manager_access.sql`
      (policy additive `payouts_select_campaign_managers`, réutilise
      `private.manages_beneficiary` -- comble un trou réel : un team_manager
      ne pouvait pas lire le versement de sa propre équipe ; `payouts_staff_read`
      non touchée, additive plutôt que remplacée). `lib/dashboards/team.ts`
      (agrégations pures par bénéficiaire -- objectif collectif, ventes
      totales, crédits générés, nombre de commandes, panier moyen, ventes par
      athlète, progression hebdomadaire, commandes à distribuer, statut de
      versement ; `totalCents` construit comme somme littérale des parties,
      garantissant par construction que les ventes par athlète totalisent les
      ventes de l'équipe), page `app/(portails)/equipe/[teamId]` (réutilise
      `ProgressBar` existant, aucune nouvelle dépendance de graphiques).
      32 nouveaux tests (`dashboards-team.test.ts` -- 25 unitaires sur un jeu
      de données connu, `team-dashboard-rls.test.ts` -- 7 d'intégration contre
      un vrai Postgres embarqué, scope équipe + les deux formes de
      bénéficiaire de versement). Suite complète relancée (34 fichiers
      unitaires/412 tests + 15 fichiers d'intégration/134 tests, 546 tests au
      total), aucune régression. `tsc --noEmit`/`eslint .` propres. Voir
      docs/rapports/RAPPORT-1.5.6.md et docs/DECISIONS.md.

- [x] **1.5.8 — Clôture de campagne.** Migration `0017_campaign_closure.sql`
      (table `campaign_status_log`, fonctions gardées `close_campaign`/
      `reopen_campaign` en `SECURITY DEFINER` -- même patron que
      `advance_order_status`, migration 0015 ; `close_campaign` vérifie aussi
      l'absence de commande `payment_pending` rattachée -- actuellement
      inatteignable par le code applicatif, conservée en défense en
      profondeur, voir docs/DECISIONS.md). `lib/campaigns/close.ts` (machine de
      transitions pure : seule `active` peut être clôturée, seule `closed`
      peut être rouverte, raison obligatoire à la réouverture). Page
      `app/(portails)/campagnes/[campaignId]/cloturer` + Server Actions
      (réouverture réservée `platform_admin`, défense en profondeur côté UI en
      plus de la policy SQL). Le blocage des nouveaux achats après clôture vit
      dans `lib/checkout/create-checkout-session.ts` (relecture du statut de
      campagne juste avant la création de la session Stripe), PAS dans
      `create_paid_order` -- un paiement déjà confirmé par Stripe avant la
      clôture produit toujours sa commande/son crédit normalement. 30 nouveaux
      tests unitaires (`campaigns-close.test.ts`) + 9 nouveaux tests
      d'intégration RLS (`campaign-closure-rls.test.ts`, Postgres embarqué :
      REVOKE anon, autorisation manager/admin, double-clôture rejetée,
      réouverture sans raison rejetée, scoping de lecture du journal). Une
      nouvelle manifestation du bug de cache mount/git rencontrée sur
      `lib/checkout/create-checkout-session.ts` (fichier vu tronqué à 146
      lignes par bash/`tsc` alors que l'outil Read montrait les 193/194 lignes
      correctes) et réparée par réécriture directe sur le mount (voir mémoire
      persistante `mount-staleness-ecommerce.md`). Suite complète relancée par
      lots (53 fichiers, 625 tests), aucune régression. `tsc --noEmit`/
      `eslint .` propres. Voir docs/rapports/RAPPORT-1.5.8.md et
      docs/DECISIONS.md.

- [x] **1.5.7 — Dashboard admin plateforme.** Aucune nouvelle migration RLS
      requise (policies existantes depuis la migration 0005 accordaient déjà
      à `platform_admin` un accès SELECT total sur `orders`/`order_items`/
      `order_credits`/`payouts`/`campaigns` — vérifié par relecture directe
      avant codage, confirmé par un test d'intégration de régression).
      `lib/dashboards/admin.ts` (agrégations pures : revenus totaux/commandes
      totales/panier moyen, marge brute -- toujours indisponible en V1, aucune
      colonne de coût --, crédits dus/payés -- crédits `active` uniquement
      croisés avec les versements `paid` --, campagnes actives, campagnes à
      risque -- seuils autonomes 14 jours/50 % --, produits populaires,
      paiements échoués, remboursements ; `canViewAdminDashboard` extrait en
      fonction pure testable). Page `app/(admin)/dashboard` (réservée
      `platform_admin`, `notFound()` sinon -- pas de message « accès refusé »
      qui révélerait l'existence de la route). 35 nouveaux tests unitaires
      (`dashboards-admin.test.ts`, incluant le critère d'acceptation explicite
      « crédits dus diminue quand un versement passe à `paid` ») + 5 tests
      d'intégration RLS (`admin-dashboard-rls.test.ts`, Postgres embarqué :
      `platform_admin` lit tout sans lien personnel, `team_manager`/`client`
      non liés ne voient rien, `anon` ne voit rien, régression -- le
      propriétaire réel de la commande la voit toujours). Suite complète
      relancée par lots (51 fichiers, 586 tests), aucune régression.
      `tsc --noEmit`/`eslint .` propres. Voir docs/rapports/RAPPORT-1.5.7.md
      et docs/DECISIONS.md.

- [x] **1.5.9 — Rapport de campagne.** Migration `0018_campaign_reports.sql`
      (table `campaign_reports`, clé `UNIQUE (campaign_id, closed_at)` —
      auto-invalidation naturelle à chaque cycle clôture/réouverture, NI
      policy UPDATE NI policy DELETE -- immuabilité imposée par la base
      elle-même ; policies SELECT/INSERT ordinaires
      `private.is_platform_admin() OR private.manages_campaign(campaign_id)`,
      pas de fonction `SECURITY DEFINER` -- voir docs/DECISIONS.md).
      `lib/reports/campaign.ts` (`splitQcTax` : ventilation TPS/TVQ à partir
      du taux combiné unique de `tax_rates` + constante fédérale fixe
      `QC_TPS_RATE_BPS = 500`, reliquat d'arrondi toujours à la TVQ ;
      `summarizeSales`/`summarizeTaxBreakdown`/`summarizePaymentFees`
      -- `fee_held_cents` sommé tous statuts --/`summarizeCreditTotal`
      -- crédits `active` uniquement -- ; `computeProductCost` toujours
      indisponible en V1 ; `loadCampaignReport` lit le figeage existant si la
      campagne est `closed`, sinon calcule et enregistre un nouveau figeage,
      sinon calcule à la volée -- toujours en direct -- si la campagne est
      encore active). `lib/reports/export.ts` (CSV/PDF construits depuis la
      même fonction `flattenCampaignReport`, même patron que la Tâche 1.5.4).
      Page `app/(portails)/campagnes/[campaignId]/rapport` + routes
      `app/api/campagnes/[campaignId]/rapport/{csv,pdf}`. 25 nouveaux tests
      unitaires (`reports-campaign.test.ts`, exactitude ligne par ligne sur
      un jeu de données connu + ventilation TPS/TVQ) + 8 nouveaux tests
      d'intégration RLS (`campaign-report-rls.test.ts`, Postgres embarqué :
      autorisation manager/admin, refus manager non lié/anon, contrainte
      UNIQUE, coexistence de deux figeages après un second cycle de clôture,
      immuabilité UPDATE). Suite complète relancée, aucune régression.
      `tsc --noEmit`/`eslint .` propres. Voir docs/rapports/RAPPORT-1.5.9.md
      et docs/DECISIONS.md.
- [x] **1.5.10 — Calcul des versements (paiement manuel).** Tâche financière
      sensible. Migration `0019_payout_status_transitions.sql` (table
      `payout_status_log` -- journal d'audit INSERT-only --, fonction
      `SECURITY DEFINER` `advance_payout_status` -- verrouille la ligne,
      revalide autorisation/transition/preuve/raison côté serveur, écrit le
      statut + le journal en une transaction --, trigger
      `payouts_guard_amount_lock` -- verrouille le montant hors
      `calculated`/`in_validation`). `lib/payouts/calculate.ts`
      (`computeActiveCreditsDueByBeneficiary` -- somme des crédits `active`
      uniquement --, `planPayoutRecalculation` -- idempotent, union des clés
      bénéficiaire, ignore les versements déjà validés --,
      `recalculatePayoutsForCampaign` -- réservé aux campagnes
      `closed`/`paid` --). `lib/payouts/workflow.ts` (graphe complet à 7
      statuts conçu en autonomie -- le cahier ne décrit que `calculated →
      approved → paid` --, `paid` atteignable QUE depuis `approved`/`adjusted`,
      preuve obligatoire pour `paid`, montant+raison obligatoires pour
      `adjusted`). `amount_cents` reste la somme BRUTE des crédits actifs
      (cohérence avec `summarizeCreditsDue`, Tâche 1.5.7) ; `fee_held_cents`
      est une retenue séparée, posée uniquement via `adjusted`, jamais
      calculée automatiquement (aucun taux de frais en V1). Pages
      `app/(admin)/versements` (liste des campagnes éligibles) et
      `app/(admin)/versements/[campaignId]` (calcul + cycle de validation).
      Décision notable confirmée empiriquement par test d'intégration :
      `accounting` peut écrire directement sur `payouts`/appeler le RPC
      malgré un accès lecture seule dans l'interface admin -- asymétrie
      intentionnelle, pas un bug (voir docs/DECISIONS.md). 83 nouveaux tests
      unitaires (`payouts-calculate.test.ts` : 34, `payouts-workflow.test.ts` :
      49) + 18 nouveaux tests d'intégration RLS
      (`payout-status-transitions-rls.test.ts`, Postgres embarqué : RPC
      gardé, RLS de `payout_status_log`, trigger de verrouillage du montant,
      écriture directe sur `payouts`). Suite unitaire complète (471 tests) et
      suite d'intégration complète relancées par lots, aucune régression.
      `tsc --noEmit`/`eslint .` propres. Voir docs/rapports/RAPPORT-1.5.10.md
      et docs/DECISIONS.md.
- [x] **1.5.11 — Export des commandes (admin).** `lib/export/orders.ts`
      (`canExportOrders` -- `platform_admin`/`accounting` uniquement, garde
      explicite distincte de la RLS puisque `support`/`logistics` lisent déjà
      `orders` par ailleurs ; `parseOrderExportFilters`/
      `matchesOrderExportFilters`/`applyOrderExportFilters` -- campagne,
      équipe, statut, période sur `created_at`, combinables, double
      application requête + en mémoire ; `buildOrderExportRows`/
      `buildOrderExportCsv` -- montants en dollars via `formatCents`,
      ventilation TPS/TVQ identique à `splitQcTax`/`findApplicableTaxRateBps`
      de la Tâche 1.5.9 ; `loadOrderExportData`/`createSupabaseOrderExportRepo`).
      Migration `0020_orders_export_staff_access.sql` (policies SELECT
      additives `accounting`-only sur `campaigns`/`teams`, suivant le
      précédent non destructif de la migration 0014). Page
      `app/(admin)/commandes/export` (filtres + aperçu, lien d'export
      transmettant la même chaîne de requête) et route
      `app/api/commandes/export/csv` (même `parseOrderExportFilters`,
      garantit que le CSV téléchargé reflète exactement l'aperçu). 22
      nouveaux tests unitaires (`export-orders.test.ts`) + 7 nouveaux tests
      d'intégration (`orders-export-rls.test.ts`, Postgres embarqué : accès
      `accounting`/`platform_admin`, preuve que `support`/`logistics` lisent
      `orders` via RLS mais sont quand même refusés par `canExportOrders`,
      refus `team_manager` non lié/`anon` ; plus une réconciliation
      mathématique pure prouvant que les colonnes Total/TPS/TVQ/Livraison/
      Sous-total de l'export, sommées pour les commandes payées d'une
      campagne, égalent exactement `summarizeSales`/`summarizeTaxBreakdown`
      du rapport de campagne, Tâche 1.5.9). Suite complète relancée par lots
      (60 fichiers, 788 tests), aucune régression. `tsc --noEmit`/`eslint .`
      propres. Voir docs/rapports/RAPPORT-1.5.11.md et docs/DECISIONS.md.
      **Phase 1.5 entièrement complétée.**

## Terminé (suite)
- [x] Phase 1.6 — UX de tous les usagers (voir `docs/prompts/phase-1-6.md`) —
      **demandée AVANT la Phase 1.5** (demande de Frédéric, 2026-06-23 ; cohérent
      avec l'ordre déjà prévu dans `ORCHESTRATION.md`) — Blocs A, B et C tous
      complétés.
  - [x] Bloc A — Client / parent acheteur
    - [x] 1.6.A1 Achat invité fluide (page athlète → paiement)
    - [x] 1.6.A2 Création de compte encouragée après l'achat
    - [x] 1.6.A3 Espace parent : suivi, reçus et rachat en un clic
    - [x] 1.6.A4 Répartition entre plusieurs enfants, version simple
  - [x] Bloc B — Responsable de campagne
    - [x] 1.6.B1 Assistant de campagne pas-à-pas avec sauvegarde automatique
    - [x] 1.6.B2 Défauts intelligents et saisie des athlètes sans douleur
    - [x] 1.6.B3 Aperçu, activation et écran « prochaines actions »
  - [x] Bloc C — Athlète
    - [x] 1.6.C1 Profil athlète et page publique soignée
    - [x] 1.6.C2 Suivi de progression et partage pour l'athlète
- [x] Phase 1.5 — Campagne pleinement opérationnelle (voir
      `docs/prompts/phase-1-5.md`) — **entièrement complétée.**
  - [x] 1.5.1 QR codes téléchargeables (PNG/PDF)
  - [x] 1.5.2 Génération automatique d'affiches
  - [x] 1.5.3 Saved splits (répartitions favorites)
  - [x] 1.5.4 Liste de distribution par équipe
  - [x] 1.5.5 Confirmation réception et livraison groupée
  - [x] 1.5.6 Dashboard équipe
  - [x] 1.5.7 Dashboard admin plateforme
  - [x] 1.5.8 Clôture de campagne
  - [x] 1.5.9 Rapport de campagne
  - [x] 1.5.10 Calcul des versements (manuel)
  - [x] 1.5.11 Export des commandes (admin)

## Terminé (suite 2)
- [x] Correction critique : migrations 0009-0020 jamais réellement
      appliquées en production (découvert et corrigé le 2026-06-25, voir
      `docs/DECISIONS.md` et `docs/AUDIT-2.0.md` §7).
- [x] Phase 1.4b — Confiance et finitions visuelles (voir
      `docs/prompts/phase-1-4b.md`) — **terminée.**
  - [x] 1.4b.1 Corriger le bug de création de campagne (PRIORITÉ) —
        cause réelle : tables manquantes en production (voir ci-dessus),
        pas un problème de permissions ni d'interface (l'état guidé existait
        déjà). Bug additionnel trouvé et corrigé dans deux specs e2e
        existantes (`profiles.role` jamais provisionné). Nouveau test e2e
        dédié : `tests/e2e/campagne-creation-acces.spec.ts`. Détail :
        `docs/rapports/RAPPORT-1.4b.1.md`.
  - [x] Ajout de la liste « Mes campagnes » (`/campagnes`) — bug de
        navigation signalé directement par l'utilisateur (le lien « Campagnes »
        menait droit à l'assistant de création, jamais aux campagnes
        existantes). Nouveau : `lib/campaigns/list-for-manager.ts` (logique
        pure testée, 8 tests), `app/(portails)/campagnes/page.tsx` (liste,
        scope géré par RLS seul), lien de nav corrigé
        (`components/nav/site-header.tsx`), `tests/e2e/campagnes-liste.spec.ts`.
        54/54 fichiers de tests unitaires verts, `tsc`/`lint` propres. Détail :
        `docs/DECISIONS.md` (entrée du 2026-06-26).
  - [x] 1.4b.5 Pages de confiance (À propos, Confidentialité, Conditions
        d'utilisation, Remboursement et livraison, Contact) — construites
        avant 1.4b.2 pour que le pied de page de l'accueil ait des liens
        fonctionnels. Nouveau : 5 pages dans `app/(public)/`, formulaire de
        contact (`lib/contact/`, 4 tests unitaires sur
        `buildContactMessageContent`), pied de page mis à jour
        (`components/nav/site-footer.tsx`), e2e
        `tests/e2e/pages-confiance.spec.ts`.
  - [x] 1.4b.2 Page d'accueil : sections de confiance et portes d'entrée —
        3 portes d'entrée (Trouver un athlète / Lancer une campagne / Voir
        la boutique), exemple chiffré sourcé sur le seed réel, section
        « Comment ça fonctionne », témoignages neutres (aucun faux
        contenu — voir `docs/DECISIONS.md`), FAQ en HTML natif. Nouveau :
        `app/(public)/page.tsx` réécrite, annuaire `/trouver`
        (`lib/public/athlete-directory.ts`, 5 tests unitaires,
        `loadAthleteDirectory`/`listAthletes` ajoutés à
        `lib/public/profile.ts`), e2e
        `tests/e2e/accueil-confiance.spec.ts`. h1/bouton « Voir la
        boutique » préservés (aucune régression sur `tests/e2e/home.spec.ts`
        existant). `tsc`/`lint` propres ; tests unitaires/intégration
        touchés (27) verts. Bug de désync mount/git rencontré une 3e fois
        sur `code/.env.example`, réparé (voir `docs/DECISIONS.md`).
  - [x] 1.4b.3 Boutique : images produits et cartes alignées — chaque carte
        affiche désormais soit l'image du produit (`next/image`, inchangé)
        soit un remplacement visuel neutre (SVG inline,
        `ProductImagePlaceholder` dans `components/product-card.tsx` —
        aucun produit du seed n'a d'image aujourd'hui). Cartes de hauteur
        égale et bouton « Ajouter au panier » alignés sur toute la grille
        via `app/globals.css` (`.product-grid > li > .card { flex: 1 }`,
        la grille CSS étire déjà les `<li>` d'une rangée à la même hauteur).
        Nouveau : `tests/e2e/boutique-images.spec.ts` (non exécutable en
        sandbox, mêmes raisons réseau que `checkout.spec.ts`). `tsc`/`lint`
        propres ; tests unitaires ciblés (`catalog-products`, `format-cents`,
        `ui-card`, `ui-badge`) verts. Bug de désync mount/git rencontré deux
        fois de plus sur ces deux fichiers (voir `docs/DECISIONS.md`).

  - [x] 1.4b.4 Panier : clarté, taxes, impact et paiement rassurant —
        nouveau `lib/cart/tax-breakdown.ts#computeCartTaxBreakdown` (fonction
        pure, COMPOSE `calculateTaxCents`/`splitQcTax` déjà testés, ne
        duplique aucun calcul d'argent, taux lu depuis `tax_rates` via
        `lib/taxes/rates.ts`, jamais en dur) avec 7 tests unitaires
        (`tests/unit/cart-tax-breakdown.test.ts`). Page panier
        (`app/(shop)/panier/page.tsx`) : nouveau bloc « Détail des taxes »
        (Sous-total/TPS 5 %/TVQ 9,975 %/Total, via `.recap-list` déjà utilisé
        ailleurs) remplaçant l'ancienne mention vague « taxes calculées à
        l'étape suivante » ; bloc impact renommé « L'impact de votre achat »
        et reformulé pour inviter à choisir un bénéficiaire plutôt que
        décrire un état. `components/beneficiary-split.tsx` : phrase
        technique « Répartition actuelle : 100 % entre N bénéficiaire(s) »
        remplacée par une formulation humaine. Texte du bouton de paiement
        (« Procéder au paiement ») et message d'état vide (« Votre panier
        est vide. ») volontairement INCHANGÉS (référencés tel quel par
        `tests/e2e/checkout.spec.ts`/`compte-dashboard.spec.ts`) — aucun
        changement de logique de calcul (présentation uniquement, comme
        exigé par le cahier). `tests/e2e/checkout.spec.ts` complété avec des
        assertions sur le détail des taxes et le bloc impact, avant le clic
        sur le bouton de paiement (toujours non exécutable en sandbox, mêmes
        raisons réseau). `tsc`/`lint` propres ; tests unitaires ciblés
        (`cart-tax-breakdown`, `checkout-prepare-checkout`,
        `reports-campaign` — 41/41) verts. Bug de désync mount/git rencontré
        trois fois de plus sur ces fichiers (voir `docs/DECISIONS.md`) ;
        régression évitée de justesse en re-grepant les chaînes préservées
        après une modification du texte du bouton, avant de la corriger.

  - [x] 1.4b.6 États vides encourageants et finitions générales — états vides
        froids (« Aucun… ») reformulés en invitation à agir là où une action
        a du sens (ex. boutique vide, commandes vides, distribution/livraison
        vides, dashboards admin/équipe), ton seulement adouci là où aucune
        action n'existe (ex. « Rien à distribuer pour le moment. »). Aucun
        changement de logique ni de structure de données — présentation
        uniquement. `app/loading.tsx` déjà conforme (`.page-loading` +
        `Spinner`, aucune régression de layout entre pages) — vérifié, aucun
        changement nécessaire. Espacement/largeur déjà couverts par les
        primitives existantes (`.page`/`.page--wide`/`.stack`) — aucune
        nouvelle classe requise. Bug de désync mount/git rencontré une 4e
        fois, cette fois sur **13 fichiers simultanément** (tous les fichiers
        touchés par cette tâche) — détecté via `npx tsc --noEmit` (erreurs de
        JSX tronqué), réparé par reconstruction complète de chaque fichier via
        heredoc bash, vérifié par scan d'octets (longueur exacte, aucun octet
        NUL, fin de fichier correcte) en plus de `tsc`/`lint`. Voir
        `docs/DECISIONS.md` (entrée du 2026-06-26) pour le détail des fichiers
        et la liste des reformulations. 44/44 fichiers de tests unitaires
        (631 tests) + 20/20 fichiers d'intégration (181 tests) verts,
        `tsc --noEmit` et `npm run lint` propres.

## Terminé (suite 3)
- [x] Refonte visuelle — **Tâche V1** : direction validée par Frédéric le
      2026-06-27 (tutoiement partout ; titres en Bricolage Grotesque, corps en
      Inter ; voir `docs/QUESTIONS.md` et `docs/DECISIONS.md`). Ancien
      `docs/DESIGN.md` archivé dans `docs/DESIGN-v1-archive.md` ; `docs/
      DESIGN.md` à jour avec les choix définitifs et la correction WCAG AA.
      Aperçu de validation conservé à `/styleguide-refonte` (page isolée, non
      indexée).

- [x] Refonte visuelle — **Tâche V2** : système de design (tokens + composants)
      conforme à `docs/DESIGN.md`. `app/globals.css` réécrit (`:root` :
      nouvelle palette orange/teal avec inversion de rôle primary↔accent sans
      toucher un seul fichier `.tsx`, nouveau token `--color-surface` distinct
      de `--color-bg`/cream, couleurs d'état recalculées pour l'AA — `danger`
      → `#AC3932`, nouveau `--color-info-text` → `#236293` —, rayons 8/10/16/
      24px, ombres et anneau de focus reteintés sur la nouvelle palette).
      `app/layout.tsx` : police de titre Outfit → Bricolage Grotesque.
      Composants migrés vers `--color-surface` : `.card`, `.field__control`,
      `.modal` (+ fond/couleur explicites, absents jusqu'ici), `.site-header`,
      `.mobile-nav__panel`, `.wizard-nav` ; teintes de badges/alertes
      retokenisées ; deux survols auparavant en dur (`.btn--accent:hover`/
      `.btn--danger:hover`) deviennent `--color-accent-dark`/
      `--color-error-dark`. `/styleguide` complété avec une section « État
      vide » (composant `EmptyState` existant mais jamais démontré). Détail
      complet des 4 décisions (mapping de rôle, recalculs AA, `--color-
      surface`, rayons/ombres) dans `docs/DECISIONS.md` (entrée du
      2026-06-27). Aucun fichier `.tsx` de composant/page modifié. Deux
      nouvelles manifestations du bug de cache mount/git rencontrées
      (`app/layout.tsx` tronqué, `app/globals.css` tronqué de ~118 lignes,
      puis `app/styleguide/page.tsx` tronqué) et réparées par reconstruction
      heredoc/git-show+Python, vérifiées par `wc -l`/scan d'octets nuls/
      `git diff --stat`. `tsc --noEmit`/`eslint .` propres, 10/10 fichiers de
      test `components/ui/*` verts + tous les tests unitaires de logique
      métier déjà observés verts (aucune régression — V2 ne touche aucune
      logique métier).

- [x] Refonte visuelle — **Tâche V3** : navigation, pied de page et coquille
      générale. En-tête (`components/nav/site-header.tsx`) : marque visuelle
      (icône SVG médaille, décorative), liseré dégradé orange→teal, lien actif
      en repère « pilule » (`--color-primary-tint`) au lieu d'un simple
      soulignement, menu mobile avec icône hamburger et animation d'ouverture
      CSS douce. Pied de page (`components/nav/site-footer.tsx`) : passage
      d'une rangée plate à un plan du site à 3 colonnes (marque/tagline/
      mention Québec, navigation, liens de confiance) + barre de copyright
      séparée ; ajout du lien « Trouver un athlète ». Tous les noms/chemins de
      lien testés par `tests/e2e/navigation.spec.ts` et
      `pages-confiance.spec.ts` conservés à l'identique (DOM order, `aria-
      current`, scoping `contentinfo`, cible tactile 44×44px). Détail complet
      dans `docs/DECISIONS.md` (entrée du 2026-06-27, Tâche V3). **Note
      importante** : cette tâche a aussi permis de découvrir et corriger une
      corruption silencieuse déjà présente dans le commit V2 (`c704d35`,
      poussé vers `origin/main`) — l'entrée Tâche V2 ci-dessus avait été
      tronquée en plein milieu d'une phrase sans qu'aucune vérification ne le
      détecte à l'époque (le texte committé s'arrêtait à « → `#AC3932` »).
      Reconstruite ici à l'identique du texte original prévu. Voir
      `docs/DECISIONS.md` (entrée du 2026-06-27, Tâche V3, point 4) pour le
      détail de la détection et de la réparation. `tsc --noEmit`/`npm run
      lint` propres. Aucun test unitaire Vitest pour ces composants (Server
      Components purs, couverts seulement par les e2e non exécutables en
      sandbox).

## En cours
(aucune — Tâche V3 complétée et committée)

## À venir
Tâches V4-V10 de la refonte visuelle à suivre une à la fois, rapport après
chacune (`docs/prompts/07-prompts-refonte-visuelle.md`).
