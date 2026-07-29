# Backlog — Plateforme de financement sportif

> Dérivé de `charte.md` (auditée 83/100, signée le 2026-07-15) par
> `/decortiquer`. Cocher au fur et à mesure de l'exécution restante. Chaque
> élément cite la section de la charte qui le justifie.
>
> **Avertissement de Phase 0 (règle 7 du skill conduite-decorticage) : ce
> décorticage est rétroactif.** Le cœur V1 était déjà livré et testé le
> 2026-07-13, deux jours avant la signature de la charte (2026-07-15). La
> majorité des PBI ci-dessous sont donc déjà cochés à la production de ce
> backlog — ce document sert désormais surtout à piloter le travail
> **restant** (Epics 6 à 9) et à tracer la couverture des risques/critères de
> succès, pas à mesurer un temps de reprise significatif sur les Epics 1 à 5.
> Sources d'avancement : `docs/PROGRESS.md`, `docs/DECISIONS.md`, historique
> git.
>
> Correspondance de numérotation : la charte utilise §5.1/§5.2 pour la
> portée incluse/exclue (pas §3) et §6.2 pour les personas (pas §4) — la
> dérivation ci-dessous cite les numéros réels de `charte.md`, pas les
> numéros génériques du gabarit.

## Dispositions du pré-mortem (avocat-diable, Phase 2)

Rapport complet livré au demandeur sans adoucissement. Dispositions tranchées :

| # | Point de l'avocat-diable | Disposition | Traçabilité |
| --- | --- | --- | --- |
| 1 | Contradiction charte (« tirage développé ») vs état réel (pas commencé) | **Retenu** — `spec.md` corrigé, écart consigné en À valider #5 | `spec.md` § Décisions techniques, backlog À valider #5 |
| 2 | Lancement suspendu à 3 chantiers externes non coordonnés | **Retenu** — PBI de priorisation ajouté | PBI 9.3.2 |
| 3 | Hypothèse fragile : défaut « Standard » mineurs, architecture déjà bâtie dessus | **Retenu** — question juridique isolée ajoutée, anticipée sur l'audit de fin août | PBI 5.3.4 |
| 4a | Question évitée : lancement partiel anticipé plutôt qu'attendre la refonte design complète | **Retenu** comme À valider stratégique | À valider #6 |
| 4b | Désaccord non exprimé : justification du flag tirage jamais suivie d'effet, non consigné à `DECISIONS.md` | **Non retenu explicitement** — signalé ici pour mémoire, aucune action backlog ajoutée (le demandeur n'a pas sélectionné cette option lors de l'arbitrage) | — |

---

## Epic 1 — Boutique en ligne (charte §5.1 : « Produits, packs, abonnements ; panier multi-bénéficiaires ; paiement Stripe (Checkout + webhooks) »)

### Feature 1.1 — Catalogue produits/packs/abonnements (sert le rôle : Acheteurs/donateurs, charte §6.2)
- [x] PBI 1.1.1 — Un acheteur voit le catalogue public (produits actifs, tri prix/crédit/popularité) — critère d'acceptation : `listPublicProducts` exclut les produits inactifs et respecte le tri demandé. Fait : `lib/catalog/products.ts`, Tâche 1.2 (PROGRESS.md).
- [x] PBI 1.1.2 — Un administrateur gère le catalogue (CRUD produits, packs, abonnements) — Fait : `app/(admin)/produits`, Tâche 1.2.

### Feature 1.2 — Panier multi-bénéficiaires (sert le rôle : Acheteurs/donateurs, charte §6.2)
- [x] PBI 1.2.1 — Un acheteur répartit un achat entre plusieurs bénéficiaires, la somme devant toujours faire 100 % — critère d'acceptation : `assertSplitTotals10000` rejette toute répartition ≠ 10000 points de base. Fait : `lib/cart/beneficiaries.ts`, Tâche 1.4.
- [x] PBI 1.2.2 — Un invité peut composer un panier sans compte, rattaché automatiquement à la connexion — Fait : `lib/cart/identity.ts`, `lib/cart/attach-guest-cart.ts`, Tâche 1.4.
- [x] PBI 1.2.3 — Un acheteur répartit facilement entre plusieurs enfants (égalisation automatique) — Fait : Tâche 1.6.A4.

### Feature 1.3 — Paiement Stripe (sert le rôle : Acheteurs/donateurs, charte §6.2)
- [x] PBI 1.3.1 — Un acheteur paie via Stripe Checkout, en français (`locale: fr-CA`) — Fait : Tâches 1.5 et 1.4.6.
- [x] PBI 1.3.2 — Le crédit ne se déclenche que sur confirmation webhook, jamais à la soumission du formulaire (charte §8.1) — Fait : `app/api/webhooks/stripe/route.ts`, seul point d'écriture, Tâche 1.5.
- [x] PBI 1.3.3 — Un même évènement Stripe reçu deux fois ne crée qu'un seul crédit (idempotence, charte §8.1) — Fait : clé `stripe_events.id`, migration 0006, vérifié par test d'intégration dédié.

**DoD Epic 1** : atteint — vérifié en production le 2026-06-23 (commande réelle, carte test, crédit attribué, voir PROGRESS.md Tâche 1.4.6 clôture).

---

## Epic 2 — Moteur de financement (charte §5.1 : « Calcul et attribution automatique des crédits ; bénéficiaire polymorphe ; règles de crédit configurables »)

### Feature 2.1 — Calcul et attribution automatique des crédits (sert le rôle : Athlètes bénéficiaires, charte §6.2)
- [x] PBI 2.1.1 — Le système résout la règle de crédit applicable selon une hiérarchie à 5 niveaux (crédit fixe produit → règle campagne+produit → règle campagne → règle produit → règle globale permanente/abonnement) — critère d'acceptation : chaque niveau testé indépendamment. Fait : `lib/credits/resolve-rule.ts`, Tâche 1.3.
- [x] PBI 2.1.2 — Le bénéficiaire est polymorphe (athlète, équipe ou club, au même niveau) — Fait : patron `(beneficiary_type, beneficiary_id)`, Tâche 1.3.
- [x] PBI 2.1.3 — Calcul de crédit et création de commande sont atomiques (une transaction DB, charte §8.1) — Fait : fonction `create_paid_order` (RPC unique), migration 0006.
- [x] PBI 2.1.4 — Toute modification d'un crédit après coup écrit une ligne d'audit (`credit_audit_log`) — Fait : Tâche 1.5.

### Feature 2.2 — Règles de crédit configurables (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [x] PBI 2.2.1 — Un gestionnaire de campagne configure une règle de crédit en libre-service, plafonnée (50 %/100 $) — Fait : `credit_rules_campaign_manager_insert/_update`, Tâche 1.7.

**DoD Epic 2** : atteint — 125+ tests dédiés au moteur de crédit, tous les critères d'acceptation du cahier vérifiés mot pour mot (Tâche 1.3).

---

## Epic 3 — Portails de gestion (charte §5.1 : « Portails compte, campagnes (assistant, démarrage, QR, affiches, distribution, rapport, clôture) et équipe »)

### Feature 3.1 — Portail compte (sert le rôle : Acheteurs/donateurs et Athlètes bénéficiaires, charte §6.2)
- [x] PBI 3.1.1 — Historique de commandes, impact par bénéficiaire, reçu imprimable, rachat en un clic — Fait : Tâche 1.6.A3.
- [x] PBI 3.1.2 — Profil athlète éditable par le tuteur (photo, message, ville, champs `hide_*`) — Fait : Tâche 1.6.C1.
- [x] PBI 3.1.3 — Suivi de progression et partage pré-rédigé pour l'athlète — Fait : Tâche 1.6.C2.

### Feature 3.2 — Portail campagnes (sert le rôle : Gestionnaires de club/équipe, charte §6.2)
- [x] PBI 3.2.1 — Assistant de création de campagne pas-à-pas avec sauvegarde automatique et défauts intelligents — Fait : Tâches 1.6.B1, 1.6.B2.
- [x] PBI 3.2.2 — Aperçu, activation et écran « prochaines actions » (lien, message parents, affiche, QR) — Fait : Tâche 1.6.B3.
- [x] PBI 3.2.3 — Codes QR téléchargeables (PNG/PDF) par campagne/athlète — Fait : Tâche 1.5.1.
- [x] PBI 3.2.4 — Affiches téléchargeables (3 formats, PDF) — Fait : Tâche 1.5.2.
- [x] PBI 3.2.5 — Liste de distribution par équipe, export CSV/PDF — Fait : Tâche 1.5.4.
- [x] PBI 3.2.6 — Confirmation de réception et suivi de livraison groupée — Fait : Tâche 1.5.5.
- [x] PBI 3.2.7 — Clôture et réouverture de campagne (blocage des nouveaux achats après clôture) — Fait : Tâche 1.5.8.
- [x] PBI 3.2.8 — Rapport de campagne (ventes, ventilation TPS/TVQ, export CSV/PDF, figé à la clôture) — Fait : Tâche 1.5.9.
- [x] PBI 3.2.9 — Répartitions favorites réutilisables (« saved splits ») — Fait : Tâche 1.5.3.

### Feature 3.3 — Portail équipe (sert le rôle : Gestionnaires de club/équipe, charte §6.2)
- [x] PBI 3.3.1 — Dashboard équipe (objectif collectif, ventes par athlète, statut de versement) — Fait : Tâche 1.5.6.

**DoD Epic 3** : atteint pour les 3 portails listés en charte §5.1.

---

## Epic 4 — Back-office admin (charte §5.1 : « Produits, commandes, crédits, paiements, livraisons, rapports, paramètres de plateforme (P.1 à P.8), mécanisme de dérogation »)

### Feature 4.1 — Gestion opérationnelle (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [x] PBI 4.1.1 — Dashboard admin (revenus, crédits dus/payés, campagnes à risque, produits populaires) — Fait : Tâche 1.5.7.
- [x] PBI 4.1.2 — Versements manuels validés par un administrateur, pas de Stripe Connect (charte §5.2, décision assumée V1) — Fait : table `payouts`, accès team_manager, Tâche 1.5.6.
- [ ] PBI 4.1.3 — Surveiller la charge opérationnelle des versements manuels à mesure que le volume de campagnes croît, et réévaluer une migration vers Stripe Connect si nécessaire (mitigation du risque charte §9 « Versements manuels à l'échelle ») — critère d'acceptation : point de suivi ajouté à une revue périodique post-lancement (pas de code requis tant que le seuil n'est pas atteint). **À valider** : aucun seuil chiffré de déclenchement n'est fixé dans la charte.

### Feature 4.2 — Paramètres de plateforme configurables P.1 à P.8 (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [x] PBI 4.2.1 à 4.2.8 — Paramètres P.1 à P.8 (taux, plafonds, vérifications R1-R9, dérogations) — Fait intégralement, voir PROGRESS.md « Terminé (suite 15 à 21) » et commits `de9e252`/`7c24260`/`952ac84`.

**DoD Epic 4** : atteint pour tout ce qui est chartéré, sauf PBI 4.1.3 (suivi continu, pas un livrable ponctuel).

---

## Epic 5 — Conformité / sécurité (charte §5.1 : « Taxes QC (TPS/TVQ), Row Level Security sur toutes les tables, champs de masquage pour données de mineurs, interface en français »)

### Feature 5.1 — Taxes et conformité financière (sert le rôle : Acheteurs/donateurs, charte §6.2)
- [x] PBI 5.1.1 — TPS 5 % + TVQ 9,975 % via la table `tax_rates`, jamais en dur — Fait, vérifié en production (commande réelle 70,00 $ → 80,49 $, Tâche 1.4.6 clôture).

### Feature 5.2 — Sécurité des données (sert tous les rôles, charte §6.2)
- [x] PBI 5.2.1 — RLS activée sur toutes les tables, aucune exposée sans policy — Fait : Tâche 0.4, durci par migrations 0004/0005.
- [x] PBI 5.2.2 — Pages publiques exposées via des vues qui respectent les `hide_*` (jamais de donnée masquée à `anon`) — Fait : `v_public_athlete`/`v_public_campaign`, Tâches 1.6, 1.6.C1.

### Feature 5.3 — Confidentialité des mineurs (sert le rôle : Athlètes bénéficiaires, charte §6.2)
- [x] PBI 5.3.1 — Champs `hide_*` présents dès la V1, défaut « Standard » — Fait : Tâche 1.1.
- [x] PBI 5.3.2 — Consentement parental / `guardian_id` requis pour la création d'un athlète mineur, profil non publiable sans lien tuteur — Fait : Tâche 1.6.B2.
- [ ] PBI 5.3.3 — Confirmer ou ajuster le défaut « Standard » (profil complet visible) une fois les conclusions de l'audit juridique de fin août 2026 connues (charte §8.2, §9) — critère d'acceptation : décision juridique documentée dans `docs/DECISIONS.md`, et `hide_*` par défaut ajusté en conséquence si requis. **Bloqué** par l'audit juridique (jalon charte §10, fin août 2026).
- [ ] PBI 5.3.4 — *(issu du pré-mortem avocat-diable, disposition : retenu)* Poser une question écrite courte et isolée à un avocat, dès maintenant, sur la seule défendabilité du défaut « Standard » (profil mineur visible) — sans attendre la rencontre d'audit complète de fin août qui couvre aussi le tirage/billets et les pages légales. Justification : l'architecture (vues publiques, tests, portail athlète) est déjà construite sur cette hypothèse (PBI 5.3.1/5.3.2, Epic 3.1) ; si l'hypothèse est fausse, c'est la réouverture d'Epics déjà cochés « Fait », pas un simple changement de paramètre — plus l'écart est détecté tôt, moins la reprise coûte. Critère d'acceptation : réponse écrite reçue (courriel ou note courte), indépendamment du calendrier de l'audit complet.

**DoD Epic 5** : atteint pour tout ce qui ne dépend pas de l'audit juridique externe (PBI 5.3.3 en attente).

---

## Epic 6 — Module optionnel : Tirage / billets (charte §5.1 : « développé mais désactivé, en attente d'un feu vert juridique » ; conditionnel charte §8.2, §9, §10)

> **Écart charte vs réalité (pré-mortem avocat-diable, À valider #5) :** la
> charte affirme le module « développé mais désactivé ». En réalité, d'après
> `docs/PROGRESS.md` (« À venir »), aucune migration ni logique d'attribution
> n'existe — seul le principe du flag `RAFFLE_ENABLED` est arrêté. Les PBI
> ci-dessous reflètent l'état réel (non commencé), pas le libellé de la
> charte.

### Feature 6.1 — Infrastructure technique du tirage (sert le rôle : Athlètes bénéficiaires et Acheteurs/donateurs, charte §6.2)
- [ ] PBI 6.1.1 — Schéma `raffle_draws`/`raffle_tickets`/`raffle_free_entries`/`raffle_audit_log` + RLS — critère d'acceptation : migration appliquée, policies testées. **Pas commencé** (plan reçu 2026-07-13, `docs/prompts/phase-c10-tirage.md`).
  - [ ] Tâche 6.1.1.a — Concevoir et écrire la migration SQL (C.10.1, prochaine sous-tâche logique selon PROGRESS.md).
  - [ ] Tâche 6.1.1.b — Écrire les policies RLS et leurs tests d'intégration.
- [ ] PBI 6.1.2 — Attribution de billets au webhook Stripe (idempotente), révocation au remboursement.
- [ ] PBI 6.1.3 — Formulaire d'entrée sans achat (art. 206 C.cr., voie de participation gratuite).
- [ ] PBI 6.1.4 — Outil admin de tirage (seed auditable, re-tirage).
- [ ] PBI 6.1.5 — UI parent derrière le flag `RAFFLE_ENABLED`, bannière publique `RaffleBanner` (montant jamais codé en dur, jamais affichée à une session athlète).

### Feature 6.2 — Gate juridique du module (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [x] PBI 6.2.1 — Le module reste désactivé par indicateur (`RAFFLE_ENABLED=false`) tant qu'aucun feu vert juridique n'est obtenu — Fait par construction (feature flag posé dès le développement, aucune UI/attribution tant que faux).
- [ ] PBI 6.2.2 — Obtenir le feu vert juridique écrit (règlement de concours, entrée sans achat art. 206 C.cr., publicité <13 ans art. 248-249 LPC, divulgation art. 74.06 Loi sur la concurrence, Loi 25) — critère d'acceptation : avis juridique écrit reçu et versé à `docs/dossier-avocat/`. **Bloqué**, dépend de l'audit juridique fin août 2026 (charte §8.2, §9, §10). Modèle de règlement déjà rédigé (`docs/dossier-avocat/reglement-tirage-modele.md`).

**DoD Epic 6** : non atteint — développement non commencé, activation conditionnelle au feu vert juridique (charte §8.2).

---

## Epic 7 — Refonte visuelle complète du site (charte §7 : « Refonte visuelle complète du site (direction validée, déploiement en cours) » ; chantier 2, charte §10 ; effort inclus dans les ~150-200 h de charte §11)

### Feature 7.1 — Direction visuelle et fondations (sert tous les rôles, charte §6.2)
- [x] PBI 7.1.1 — Direction visuelle validée (palette, typographie, composants) — Fait : `docs/DESIGN.md`, validé 2026-06-27.
- [x] PBI 7.1.2 — Design tokens et 9 composants UI de base, page `/styleguide` — Fait : Tâche 1.4.2.
- [x] PBI 7.1.3 — Navigation, layouts et changements de page habillés — Fait : Tâche 1.4.3.
- [x] PBI 7.1.4 — Accessibilité, performance, `metadataBase`/Open Graph, pages 404/500 — Fait : Tâche 1.4.5.
- [ ] PBI 7.1.5 — Finaliser et fusionner `docs/PLAN-DESIGN-REFONTE-ACCUEIL.md` dans `docs/DESIGN.md` après validation visuelle (captures desktop + mobile, `npm run build` complet) — **en brouillon**, pas encore fusionné (CLAUDE.md « État actuel »).

### Feature 7.2 — Extension aux pages restantes (sert Acheteurs/donateurs, Gestionnaires de club/équipe et Administrateurs, charte §6.2)
- [ ] PBI 7.2.1 — Habiller la boutique (`app/(shop)/boutique`, `product-card.tsx`) avec la direction validée.
- [ ] PBI 7.2.2 — Habiller les pages publiques athlète/équipe/club.
- [ ] PBI 7.2.3 — Habiller le panier et la confirmation de paiement.
- [ ] PBI 7.2.4 — Habiller les portails : compte, campagnes (assistant, démarrage, QR, affiches, distribution, rapport, clôture), équipe.
- [ ] PBI 7.2.5 — Habiller le back-office admin (dashboard, dérogations).
- [ ] PBI 7.2.6 — Mettre à jour `/styleguide` avec tout composant ajouté en cours de route.
  - [ ] Tâche 7.2.a (transverse, chaque PBI 7.2.1-7.2.5) — Vérifier après chaque page habillée : contrastes AA, focus visible, aucune régression des tests de rendu/e2e existants (repris de `TODO.md`, section 2).
- [ ] PBI 7.2.7 — Revue finale : captures desktop + mobile de tout le site, `npm run build` complet avant de considérer la refonte terminée.

**DoD Epic 7** : non atteint — fondations et 4 pages de la Phase 1 habillées, reste : accueil (fusion brouillon), boutique, pages publiques, panier/paiement, portails, back-office, styleguide à jour.

---

## Epic 8 — Partenariats fournisseurs (charte §6.1, §7 « chantier business, hors code », §9 risque, §10 chantier 1, §11 effort) — HORS CODE, ne s'exécute pas via Claude Code

### Feature 8.1 — Approvisionnement du catalogue (sert le rôle : Fournisseurs de produits comme partie prenante externe, charte §6.1 — pas un persona utilisateur au sens §6.2, mais nommé en gouvernance)
- [ ] PBI 8.1.1 — Lister les compagnies cibles (équipements, vêtements, accessoires sportifs).
- [ ] PBI 8.1.2 — Contacter et négocier les conditions (prix, exclusivité, délais de livraison, minimums de commande).
- [ ] PBI 8.1.3 — Obtenir catalogues/prix/photos officiels de chaque fournisseur retenu.
- [ ] PBI 8.1.4 — Signer les ententes de partenariat.
- [ ] PBI 8.1.5 — Une fois des ententes signées, décider comment les représenter dans le catalogue (nouveaux produits/packs) et si un suivi produit↔fournisseur devient nécessaire au back-office. **Explicitement bloqué** tant que 8.1.4 n'est pas fait (CLAUDE.md « Prochaines étapes » #1 : « Aucun développement de modèle de données fournisseur tant que rien n'est décidé »).

**DoD Epic 8** : non atteint — chantier business piloté par le commanditaire seul, suivi dans `TODO.md`, pas par ce backlog d'exécution logicielle.

---

## Epic 9 — Préparation au lancement commercial (charte §8.2, §9, §10 « Lancement commercial : à déterminer », §4 point de départ de la mesure de KPI)

### Feature 9.1 — Conformité légale (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [ ] PBI 9.1.1 — Revue juridique professionnelle des pages légales (confidentialité, conditions, remboursement/livraison), actuellement des gabarits — critère d'acceptation : avis juridique écrit reçu, pages mises à jour en conséquence. **Bloqué**, audit planifié fin août 2026 (charte §8.2, §9, §10).
- [ ] PBI 9.1.2 — Confirmer la conformité de la confidentialité des données de mineurs selon l'avis juridique (lié à PBI 5.3.3).

### Feature 9.2 — Validation technique avant lancement (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [ ] PBI 9.2.1 — Exécuter la suite de tests e2e (Playwright) complète en environnement avec accès réseau (Chromium/Supabase/Stripe) — critère d'acceptation : tous les fichiers `tests/e2e/*.spec.ts` passent en CI ou en local hors bac à sable (mitigation du risque charte §9 « Tests e2e non exécutés »). Un jeu `supabase/seed-e2e.sql` reste à créer pour au moins 2 e2e (`athlete-profile-edit.spec.ts`, `athlete-suivi.spec.ts`, voir PROGRESS.md Tâches 1.6.C1/C2).

### Feature 9.3 — Fixer le jalon de lancement (sert le rôle : Administrateurs de la plateforme, charte §6.2)
- [ ] PBI 9.3.1 — Fixer une date de lancement commercial une fois PBI 9.1.1, 8.1.4 (au moins un fournisseur signé) et l'Epic 7 (refonte design) suffisamment avancés — critère d'acceptation : date ajoutée à charte §10 (actuellement « à déterminer »). **À valider** par le commanditaire — aucune date n'est fixée dans la charte (§8.4).
- [ ] PBI 9.3.2 — *(issu du pré-mortem avocat-diable, disposition : retenu)* Prioriser explicitement les 3 chantiers dont dépend le lancement (audit juridique PBI 9.1.1, au moins un fournisseur signé PBI 8.1.4, refonte design Epic 7) — lequel est réellement bloquant pour un premier lancement, lequel peut rester partiel (ex. lancement avec un catalogue réduit ou une refonte partielle). Justification : les 3 chantiers sont externes, non coordonnés entre eux et portés par une seule personne (charte §6.1) ; sans priorisation explicite, chacun peut indéfiniment repousser le lancement sans qu'aucun ne soit formellement en cause. Critère d'acceptation : un ordre de priorité et un seuil minimal par chantier sont consignés dans `docs/DECISIONS.md` avant que PBI 9.3.1 (date de lancement) ne soit tranché.

**DoD Epic 9** : non atteint — aucun sous-critère rempli, tous conditionnels à des évènements externes (audit juridique, négociations fournisseurs) ou à un chantier encore en cours (refonte design).

---

## Traçabilité risques → backlog (charte §9)

| Risque (charte §9) | Tâche / PBI de mitigation |
| --- | --- |
| Pages légales non révisées par un avocat | PBI 9.1.1 |
| Données de mineurs | PBI 5.3.1/5.3.2 (fait) + PBI 5.3.3/9.1.2 (en attente de l'audit) |
| Tests e2e non exécutés en environnement de développement | PBI 9.2.1 |
| Partenariats fournisseurs non finalisés | Epic 8 (PBI 8.1.1 à 8.1.5) |
| Versements manuels à l'échelle | PBI 4.1.3 |
| Module tirage/billets | Epic 6 (PBI 6.1.x développement, PBI 6.2.2 gate juridique) |
| ~~Absence de KPIs et de budget formalisés~~ | Résolu à la charte (§4, §11) avant ce décorticage — aucune action backlog requise |

## Traçabilité critères de succès → backlog (charte §4)

| Critère de succès (charte §4) | PBI / Tâche de vérification |
| --- | --- |
| 20 campagnes actives dans les 6 mois suivant le lancement | PBI 4.1.1 (dashboard admin, compte déjà les campagnes actives) — mesure elle-même post-lancement, hors portée de ce backlog |
| Délai d'activation d'une campagne ≤ 14 jours | **À valider** — aucun PBI existant ne calcule ce délai (inscription → première vente) ; à ajouter si le suivi post-lancement le requiert |
| Taux de reconduction ≥ 50 % (2ᵉ campagne dans les 12 mois) | **À valider** — aucun PBI existant ne calcule ce taux par athlète/équipe/club |
| Volume/valeur des commandes, crédits attribués, taux de conversion | Couvert par PBI 4.1.1 (dashboard admin, Tâche 1.5.7) pour commandes/crédits ; taux de conversion panier→paiement non instrumenté (**À valider**) |
| Délai moyen de versement aux bénéficiaires | Traçable via `payouts`/`order_status_log` (PBI 4.1.2) mais aucun rapport dédié ne calcule ce délai (**À valider**) |
| Adoption des portails (comptes actifs, fréquence) | Aucune instrumentation d'usage trouvée (**À valider**) |
| Zéro incident de sécurité / fuite de données (mineurs) | Couvert structurellement par Epic 5 (RLS, `hide_*`) ; absence d'incident se constate a posteriori, pas par un PBI |

## À valider issus du décorticage

| # | Question précise | Critique? | Qui peut répondre | Statut |
| --- | --- | --- | --- | --- |
| 1 | Faut-il ajouter un PBI de mesure du « délai d'activation ≤ 14 jours » et du « taux de reconduction ≥ 50 % » avant le lancement, ou ces KPI seront-ils calculés manuellement en post-lancement ? | Oui — sinon les 2 indicateurs secondaires chiffrés de la charte (§4) ne sont vérifiables par aucun PBI | Frédéric Mondou (commanditaire) | Ouvert |
| 2 | PBI 4.1.3 (suivi de la charge opérationnelle des versements manuels) : quel seuil de volume devrait déclencher une réévaluation de Stripe Connect ? | Non | Frédéric Mondou | Ouvert |
| 3 | PBI 9.3.1 : une date de lancement commercial cible (même approximative) peut-elle être fixée maintenant, ou reste-t-elle strictement conditionnelle aux 3 chantiers externes (juridique, fournisseurs, design) ? | Non | Frédéric Mondou | Ouvert |
| 4 | Le taux de conversion panier→paiement et l'adoption des portails (indicateurs secondaires sans seuil, charte §4) doivent-ils être instrumentés avant le lancement, ou seulement suivis manuellement ? | Non | Frédéric Mondou | Ouvert |
| 5 | Écart de charte : §5.1/§9 affirment que le module tirage/billets est « développé mais désactivé », mais `docs/PROGRESS.md` (section « À venir ») montre qu'aucune migration/logique n'existe encore (seul le principe du flag `RAFFLE_ENABLED` est arrêté). Non détecté par l'audit de charte (83/100). À corriger dans un futur avenant à la charte — ce décorticage ne modifie pas `charte.md` lui-même. | Oui — un document audité contient une affirmation factuelle fausse | Frédéric Mondou (ou l'agent auditeur-charte lors d'une révision) | Ouvert |
| 6 | *(issu du pré-mortem avocat-diable, disposition : retenu)* Le cœur V1 est livré et vérifié en production depuis le 2026-06-23 (une commande réelle, taxes exactes, crédit attribué — PROGRESS.md Tâche 1.4.6). La charte elle-même reconnaît (§12) qu'aucune donnée historique n'existe pour valider la cible de 20 campagnes. Faut-il envisager un lancement commercial anticipé sur un catalogue partiel (avant la fin de l'Epic 7 refonte design, ~150h), plutôt que d'attendre que les 3 chantiers de l'Epic 9 convergent — pour commencer à mesurer les KPI réels plus tôt ? | Oui — chaque mois de retard décale d'autant la fenêtre de mesure des KPI §4 (6 mois post-lancement) | Frédéric Mondou (commanditaire) | Ouvert |
