# Spécification technique — Plateforme de financement sportif

> Dérivée de `charte.md` (auditée 83/100, signée le 2026-07-15). Décrit
> COMMENT le projet répond à la charte — pas une redite de la charte
> elle-même. Le détail architectural complet et à jour vit dans le code et
> `docs/DECISIONS.md` ; ce document trace le lien entre la charte et les
> choix déjà faits ou restants.

## Architecture / approche technique

Application Next.js (App Router) monolithique, quasi entièrement en
composants serveur (2 exceptions client à ce jour : `Modal`/`ModalDemo` et
`beneficiary-split.tsx`). Logique métier isolée dans `lib/` (calcul de
crédit, taxes, répartition, permissions), jamais dans les composants ni les
routes — conforme à CLAUDE.md section 6. Point d'écriture unique pour
commande + crédit : la fonction Postgres `create_paid_order`, appelée
uniquement depuis le webhook Stripe (`app/api/webhooks/stripe/route.ts`),
jamais à la soumission du formulaire de paiement (charte §8.1). Idempotence
par `stripe_events.id`. RLS activée sur toutes les tables ; les vues
publiques (`v_public_athlete`, `v_public_campaign`, etc.) appliquent les
champs `hide_*` avant toute exposition à `anon`.

Le module tirage/billets (Epic 6 du backlog) suit le même patron
d'atomicité (attribution au webhook, idempotente) mais reste non développé,
derrière le flag `RAFFLE_ENABLED=false`.

## Rôles et vues (charte §6.2)

| Rôle (charte §6.2) | Vue / interaction qui le sert | Statut |
| --- | --- | --- |
| Acheteurs / donateurs | Pages publiques athlète/équipe/club, boutique, panier, paiement Stripe, portail compte (historique, reçus, rachat) | Livré (Epics 1, 3.1) |
| Athlètes bénéficiaires | Profil éditable par le tuteur, page publique avec `hide_*`, suivi de progression, moteur de crédit polymorphe | Livré (Epics 2, 3.1) |
| Gestionnaires de club / d'équipe (team managers) | Portail campagnes (assistant, démarrage, QR, affiches, distribution, rapport, clôture), portail équipe (dashboard) | Livré (Epic 3.2, 3.3) |
| Administrateurs de la plateforme | Back-office (produits, commandes, crédits, paiements, livraisons, rapports), paramètres de plateforme P.1-P.8, dérogations | Livré (Epic 4) |
| Fournisseurs de produits (partie prenante externe, charte §6.1 — pas un rôle applicatif) | Aucune vue applicative : relation contractuelle hors plateforme, chantier business (Epic 8) | Non applicable au code |

Vérification de la règle 2 du skill `conduite-decorticage` (angle mort
documenté : oubli de rôle sur un projet antérieur de financement d'équipe de
hockey — voir rapport memoire-projets) : les 4 rôles nommés en §6.2 ont
chacun au moins une Feature dédiée dans `docs/backlog.md`. Aucun rôle
orphelin trouvé.

## Contraintes techniques héritées (charte §8.1)

- Stack imposée : Next.js (App Router) + React + TypeScript, PostgreSQL via
  Supabase (RLS activée sur toutes les tables), Supabase Auth, Stripe,
  SendGrid, Supabase Storage, hébergement Vercel — respectée intégralement,
  aucune dérogation.
- Tout montant stocké en centimes (`integer`), jamais en `float` — colonnes
  `*_cents` partout, vérifié par convention de nommage et par les tests
  d'arrondi (répartition, taxes, bonus de seuil).
- Calcul de crédit et création de commande atomiques (transaction DB
  unique) — implémenté comme fonction Postgres `SECURITY DEFINER` plutôt que
  comme transaction ouverte côté application, pour garantir l'atomicité même
  en cas d'échec réseau applicatif.
- Crédit déclenché uniquement sur confirmation webhook Stripe, avec
  idempotence garantie par `stripe_events.id`.

## Décisions techniques et leur justification

| Décision | Justifiée par (charte ou raison technique) | Alternative écartée |
| --- | --- | --- |
| Fonction Postgres unique (`create_paid_order`) plutôt que transaction ouverte côté Next.js | Charte §8.1 (atomicité) ; élimine tout risque de connexion perdue en cours de transaction applicative | Transaction gérée depuis une route API Next.js |
| Bénéficiaire polymorphe `(beneficiary_type, beneficiary_id)` plutôt que 3 tables de crédit séparées | Charte §5.1 (bénéficiaire polymorphe explicite) | Table `athlete_credits` / `team_credits` / `club_credits` distinctes |
| Versements manuels (pas de Stripe Connect) en V1 | Charte §5.2 (exclusion explicite), décision assumée | Stripe Connect dès la V1 |
| Module tirage/billets : gate par variable d'environnement (`RAFFLE_ENABLED`) prévu comme patron d'implémentation, pour ne pas bloquer le reste du produit sur un jalon juridique externe (charte §10, fin août 2026) | Charte §5.1 (« développé mais désactivé ») | Développement différé après l'obtention du feu vert |

> **Correction post-pré-mortem (avocat-diable, voir `docs/backlog.md`) :**
> la charte §5.1/§9 affirme que le module est « développé mais désactivé »,
> mais `docs/PROGRESS.md` (section « À venir ») montre qu'aucune migration
> SQL ni logique d'attribution n'existe encore — seul le *patron* (flag,
> principe d'atomicité) est arrêté, pas le code. La ligne ci-dessus a été
> corrigée pour refléter l'état réel ; voir `docs/backlog.md` Epic 6 et la
> section « À valider » pour l'écart avec la charte elle-même.
| Défaut de confidentialité mineurs « Standard » (profil visible) avec champs `hide_*` prêts dès la V1 | Charte : « Confidentialité mineurs : défaut Standard... tous les champs `hide_*` existent dès la V1 » (règles projet) | Défaut restrictif (« masqué ») nécessitant une action d'opt-in |
| Taxes QC via table `tax_rates` (jamais en dur) | Charte §8.2 (TPS 5 % + TVQ 9,975 %) — permet un ajustement futur sans redéploiement de code | Constantes TPS/TVQ codées en dur dans `lib/` |

## Agents / skills nécessaires à l'exécution du projet cible

> Distinct des agents utilisés pour CE décorticage (`memoire-projets`,
> `avocat-diable`) — il s'agit ici de ce qui sert à construire/maintenir la
> plateforme elle-même. Croisé avec `../catalogue-skills/CATALOGUE.md`.

- **Aucun skill interne du catalogue ne s'applique.** Les deux skills
  internes existants (`conduite-entrevue`, `conduite-decorticage`) sont des
  outils de méthodologie de projet (charte/décorticage), pas des skills
  d'exécution logicielle — non pertinents pour construire une plateforme
  e-commerce.
- **`frontend-design` (officiel Anthropic)** — retenu, justifié par l'Epic 7
  du backlog (refonte visuelle complète restant à étendre à la boutique, aux
  pages publiques, au panier/paiement, aux portails, au back-office et au
  styleguide). Le reste du projet est déjà en code fonctionnel ; ce skill ne
  sert que le travail de mise en page/habillage restant.
- Aucun autre skill ajouté « au cas où » — conforme à la règle du catalogue
  (« peu de skills, tous justifiés »). La génération de PDF/CSV (rapports,
  affiches, QR) est déjà codée directement via des librairies (`pdf-lib`,
  `qrcode`) et ne requiert aucun skill de génération de documents.

## Hors scope technique (charte §5.2)

- Marketplace ouverte à des vendeurs tiers — aucun modèle de données
  multi-vendeurs, aucune commission différenciée par vendeur.
- Application mobile native — aucun projet React Native/Flutter, aucune API
  dédiée mobile au-delà du web responsive existant.
- Gestion multi-entrepôts — `products`/`order_items` ne portent aucune
  notion d'entrepôt ou de localisation de stock ; un seul stock global par
  produit.
- Recommandations par intelligence artificielle — le tri « popularité » de
  `listPublicProducts` est un comptage simple, pas un modèle de
  recommandation.
- Support multilingue complet — aucune infrastructure i18n (`next-intl` ou
  équivalent) ; tout le texte est codé en dur en français.
- Comptabilité complète intégrée — les rapports (Tâche 1.5.9) exportent des
  chiffres, ils ne tiennent pas un grand livre ni n'intègrent de logiciel
  comptable tiers.
- Abonnements très flexibles (changement de formule en libre-service) — le
  type de produit « abonnement » existe au catalogue, mais aucun flux de
  changement de formule par le client lui-même.
- Remboursement automatisé complexe — les remboursements suivent le flux
  Stripe standard ; aucune logique de remboursement partiel proportionnel
  par bénéficiaire n'est codée.
- Versements automatiques aux bénéficiaires (Stripe Connect) — voir
  décision technique ci-dessus ; `payouts` reste un enregistrement manuel
  validé par un administrateur.
