# CLAUDE.md — Plateforme de financement sportif

Ce fichier est lu automatiquement par Claude Code à chaque session. Il est la
source de vérité des conventions du projet. Respecte-le sans exception.

## Objectif du projet

Plateforme web de financement sportif pour athlètes, équipes ou clubs : une
boutique en ligne (produits, packs, abonnements) convertit chaque vente en
crédit attribué automatiquement au bénéficiaire choisi, avec des portails de
suivi de campagne pour les clubs/équipes et un back-office admin complet
(produits, commandes, crédits, paiements, livraisons, rapports).

## 1. Ce que construit ce projet

Une plateforme web qui combine quatre systèmes :
1. **Boutique en ligne** — vend produits, packs, abonnements.
2. **Financement** — attribue des crédits (de l'argent réel) à des athlètes,
   équipes ou clubs.
3. **Portails de gestion** — clubs et équipes suivent leurs campagnes.
4. **Back-office admin** — produits, commandes, crédits, paiements, livraisons,
   rapports.

Le cœur (à ne jamais casser) : identifier le bénéficiaire → vendre → calculer le
crédit automatiquement → l'attribuer → afficher l'impact → regrouper les
commandes → relancer → produire des rapports.

## 2. Décisions d'architecture déjà prises (ne pas les rediscuter)

- **Entreprise établie au Québec (Canada).** Interface en **français** par défaut
  (site, courriels, portails). Devise **CAD**. Taxes **TPS 5 % + TVQ 9,975 %**
  via la table `tax_rates` (jamais en dur dans la logique). Adresses au format
  canadien, province par défaut QC. Pour la confidentialité des mineurs, viser
  les bonnes pratiques applicables au Québec/Canada ; signaler tout point
  juridique incertain plutôt que de présumer (une revue professionnelle sera
  requise avant production).
- **Versements : MANUELS en V1.** Le système calcule les montants dus, un admin
  valide et paie à la main. PAS de Stripe Connect pour l'instant.
- **Bénéficiaire POLYMORPHE.** Un crédit peut viser un athlète, une équipe OU un
  club directement, au même niveau. Patron `(beneficiary_type, beneficiary_id)`.
- **Règles de crédit CONFIGURABLES** par campagne et par produit (table
  `credit_rules`), avec la hiérarchie de résolution documentée dans le schéma.
- **Confidentialité mineurs : défaut "Standard"** (profil complet visible), MAIS
  tous les champs de masquage `hide_*` existent dès la V1 et doivent être
  respectés partout où une donnée d'athlète est exposée publiquement.
- **Récompenses vendeurs/acheteurs : financées par la MARGE de la plateforme,
  jamais en réduisant le crédit du bénéficiaire.** Décision confirmée par
  l'utilisateur le 2026-07-16 (voir `docs/DECISIONS.md`) — aucune ligne de
  `reward_rules`/`reward_grants` ne touche `order_credits` ou son calcul.

## 3. Stack technique (imposée)

| Couche | Choix |
|---|---|
| Frontend / Backend | Next.js (App Router) + React + TypeScript |
| Base de données | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Paiements | Stripe (Checkout + webhooks) |
| Courriels | SendGrid |
| Stockage fichiers | Supabase Storage |
| Hébergement | Vercel |
| Automatisations | Cron jobs (Vercel Cron) + webhooks Stripe |
| Tests | Vitest (unitaire) + Playwright (e2e) |

## 4. Règles d'argent — NON NÉGOCIABLES

- **Tout montant est un `integer` en CENTIMES.** Jamais de `float` pour de
  l'argent. Les colonnes se nomment `*_cents`.
- **Le calcul de crédit et la création de commande sont ATOMIQUES** : une seule
  transaction DB. Si une étape échoue, tout est annulé (rollback).
- **Le crédit ne se déclenche QUE sur paiement confirmé par le webhook Stripe**,
  jamais à la soumission du formulaire de paiement.
- **Idempotence des webhooks** : un même évènement Stripe reçu deux fois ne doit
  créer qu'un seul crédit. Utilise l'id d'évènement Stripe comme clé.
- **Une commande = un seul point de livraison**, même si elle est répartie entre
  plusieurs bénéficiaires.
- **La répartition multi-bénéficiaires doit toujours totaliser 100 %**
  (`SUM(share_bps) = 10000`). Valide-le avant de créer la commande. Gère les
  centimes restants de l'arrondi en les attribuant au premier bénéficiaire.
- **Les soldes ne se stockent pas en dur** : ils se calculent depuis
  `order_credits` (voir les vues `v_*`). Source de vérité = les lignes de crédit.
- **Toute modification d'un crédit après coup écrit une ligne dans
  `credit_audit_log`.**

## 5. Sécurité — NON NÉGOCIABLE

- **RLS (Row Level Security) activée sur TOUTES les tables.** Aucune table
  exposée sans policy. Un client ne lit que ses propres données ; un team_manager
  que les données de ses équipes (via `memberships`).
- **Les pages publiques passent par des vues qui respectent les `hide_*`.** Ne
  jamais exposer à `anon` une donnée d'athlète marquée masquée.
- **Aucun secret dans le code.** Clés Stripe/SendGrid/Supabase en variables
  d'environnement uniquement. Jamais commitées.
- **Validation des entrées côté serveur** (zod), pas seulement côté client.
- **2FA pour les comptes admin** (Phase 1.5, mais prévoir le champ).
- **Données de mineurs** : consentement parental requis avant publication d'un
  profil ; respecter les demandes de suppression.

## 6. Conventions de code

- TypeScript strict (`strict: true`). Pas de `any` sauf justifié par commentaire.
- Validation des données avec **zod** à chaque frontière (API, formulaires,
  webhooks).
- Logique métier (calcul crédit, taxes, répartition) dans `lib/`, PAS dans les
  composants ni les routes. Les routes appellent des fonctions pures testables.
- Nommage : fichiers en `kebab-case`, composants React en `PascalCase`, fonctions
  en `camelCase`, colonnes DB en `snake_case`.
- Pas de console.log en production ; utilise un logger structuré.
- Commits petits et atomiques, message en français à l'impératif
  (ex: `ajoute le calcul des taxes par province`).

## 7. Règles de qualité par fonctionnalité

Pour CHAQUE fonctionnalité livrée, tu dois fournir :
1. Le code, organisé selon l'architecture de la section 64 du cahier des charges.
2. Des **tests** (voir section 8) qui passent.
3. La gestion des cas d'erreur et des cas limites (section "Gestion des
   exceptions" du cahier des charges : mauvais bénéficiaire, campagne terminée,
   stock épuisé, paiement échoué...).
4. Pas de régression : les tests existants doivent continuer de passer.

## 8. Tests — obligatoires

- **Unitaires (Vitest)** pour toute la logique métier : calcul de crédit (chaque
  branche de la hiérarchie de règles), bonus de seuil, taxes par province,
  répartition multi-bénéficiaires et arrondis, transitions de statut.
- **e2e (Playwright)** pour les parcours critiques : créer une campagne ;
  acheter via une page publique ; vérifier que le crédit est attribué au bon
  bénéficiaire ; répartir entre deux enfants.
- **Aucune fonctionnalité touchant l'argent n'est considérée "faite" sans tests
  qui couvrent les cas limites** (montant 0, arrondi, campagne inactive,
  remboursement).
- Lance `npm test` et corrige avant de te déclarer terminé.

## 9. Comment travailler (autonomie)

- Travaille tâche par tâche selon les prompts fournis. Les plans déjà traités
  (phases 0 à 1.6, puis la refonte visuelle V1-V10) sont archivés dans
  `docs/archive/prompts/` une fois terminés — voir `docs/PROGRESS.md` pour
  l'état actuel et `docs/README.md` pour l'index complet de la documentation.
  Tout nouveau plan de tâches arrive sous forme de nouveau fichier, à traiter
  puis archiver de la même façon.
- **Avance de façon autonome tant que tu n'as pas de doute bloquant.** Ne
  demande pas confirmation pour des choix mineurs : prends la décision la plus
  raisonnable, code-la, et NOTE-la dans `docs/DECISIONS.md` (un journal des
  petits choix que tu fais seul).
- **Ne demande une question QUE si** : (a) un choix engage l'argent, la sécurité
  ou les données de mineurs ; (b) deux interprétations du cahier des charges
  sont également plausibles et incompatibles ; (c) il manque un secret/accès que
  tu ne peux pas obtenir seul. Dans ces cas, pose UNE question claire et arrête-toi.
- Après chaque tâche : lance les tests, fais un commit, passe à la suivante.
- Tiens à jour `docs/PROGRESS.md` : tâche faite, tâche en cours, prochaine tâche.

## 10. Ce qu'on ne construit PAS maintenant (section 63 du cahier)

Marketplace ouverte, app native, multi-entrepôts, IA de recommandation,
multilingue complet, comptabilité complète, abonnements très flexibles,
remboursement automatisé complexe. Ne pas anticiper ces fonctions : elles
viendront après la V1.

## 11. État actuel et prochaines étapes (détail)

Voir les sections dédiées ci-dessous (`État actuel`, `Prochaines étapes`).

## État actuel

(2026-07-13) Le cœur V1 est livré et testé (boutique, moteur de crédit,
panier multi-bénéficiaires, paiement Stripe, pages publiques, portails
campagne/équipe/compte, back-office admin, paramètres de plateforme P.1 à
P.8). Direction visuelle validée dans `docs/DESIGN.md` (2026-06-27) ; une
refonte de la page d'accueil est en brouillon
(`docs/PLAN-DESIGN-REFONTE-ACCUEIL.md`, pas encore fusionnée). Le module
tirage/billets (Phase C.10) est en attente d'un feu vert juridique avant
activation (`RAFFLE_ENABLED`) — voir `docs/PROGRESS.md`.

(2026-07-16) Schéma défini pour un nouveau chantier — récompenses vendeurs
et acheteurs (migration `code/supabase/migrations/0028_seller_buyer_rewards.sql`
+ résumé dans `docs/schema-reference.sql`). Décisions et contexte dans
`docs/DECISIONS.md`. Implémentation applicative (branchement au checkout,
calcul, UI, tests) pas encore commencée — voir `TODO.md`, chantier 3.

## Prochaines étapes

(1 et 2 décidées le 2026-07-13 ; 3 ajoutée le 2026-07-16)

1. **Partenariats fournisseurs.** Finaliser les ententes avec les compagnies
   qui vont approvisionner la boutique en produits. C'est une piste
   **business, hors code** (prospection, négociation, signature) — suivie
   dans `TODO.md`. Aucun développement de modèle de données fournisseur tant
   que rien n'est décidé côté catalogue/contrat ; à réévaluer avec
   l'utilisateur une fois les premières ententes signées (par ex. besoin ou
   non d'un suivi produit↔fournisseur au back-office).
2. **Refonte design complète du site.** Étendre la direction déjà validée
   (`docs/DESIGN.md` + brouillon `docs/PLAN-DESIGN-REFONTE-ACCUEIL.md`) à
   l'ensemble des pages pour obtenir un rendu professionnel et sportif :
   boutique, pages publiques athlète/équipe/club, panier/paiement, portails
   (compte, campagnes, équipe), back-office admin, `/styleguide`. On ne
   repart pas de zéro — pas de nouveau brief de design, pas de nouveaux
   tokens en dehors de ceux déjà additifs de `docs/PLAN-DESIGN-REFONTE-ACCUEIL.md`.
   Détail des sous-tâches dans `TODO.md`.
3. **Récompenses vendeurs et acheteurs.** Schéma défini (voir `docs/
   DECISIONS.md`, entrée du 2026-07-16) : financé par la marge de la
   plateforme, jamais en réduisant le crédit du bénéficiaire. Reste à
   brancher au flux de commande réel (`create_paid_order`, capture de
   l'attribution, calcul des règles, UI, tests) — détail des sous-tâches
   dans `TODO.md`.

## Routine de fin de session

À la fin de chaque session de travail, mets à jour CLAUDE.md (section État
actuel et Prochaines étapes), mets à jour TODO.md, ajoute une entrée au
JOURNAL.md avec la date, ce qui a été fait, les décisions prises et les
blocages, puis fais un commit avec un message descriptif. Propose-le
toi-même si l'utilisateur ne le demande pas.
