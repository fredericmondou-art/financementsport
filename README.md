# Plateforme de financement sportif

Plateforme web pour une entreprise établie au Québec (Canada) qui combine
quatre systèmes : une boutique en ligne, un moteur de financement qui calcule
et attribue des crédits (de l'argent réel) à des athlètes/équipes/clubs, des
portails de gestion pour les clubs et équipes, et un back-office admin.

Le cœur du produit, à ne jamais casser : identifier le bénéficiaire → vendre
→ calculer le crédit automatiquement → l'attribuer → afficher l'impact →
regrouper les commandes → relancer → produire des rapports.

**Avant de toucher au code, lis `CLAUDE.md`** — c'est la source de vérité des
règles non négociables du projet (argent en centimes, RLS partout, versements
manuels en V1, etc.). Ce README ne fait qu'orienter ; il ne remplace pas
`CLAUDE.md`.

## Stack

| Couche | Choix |
|---|---|
| Frontend / Backend | Next.js (App Router) + React + TypeScript |
| Base de données | PostgreSQL via Supabase (RLS sur toutes les tables) |
| Auth | Supabase Auth |
| Paiements | Stripe (Checkout + webhooks) |
| Courriels | SendGrid |
| Stockage fichiers | Supabase Storage |
| Hébergement | Vercel |
| Tests | Vitest (unitaire/intégration) + Playwright (e2e, incl. audit d'accessibilité axe-core) |

## Structure du dépôt

```
.
├── CLAUDE.md           # règles permanentes du projet — à lire en premier
├── ORCHESTRATION.md    # comment ce projet a été piloté tâche par tâche (historique du processus)
├── code/                # l'application Next.js — voir code/README.md pour démarrer
└── docs/                # documentation — voir docs/README.md pour l'index complet
```

## Démarrer en local

```bash
cd code
npm install
cp .env.example .env.local   # puis remplir les variables (voir ci-dessous)
npm run dev                  # http://localhost:3000
```

Variables d'environnement requises (`code/.env.local`, jamais commité) :
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `CONTACT_EMAIL`,
`NEXT_PUBLIC_APP_URL` — voir `code/.env.example` pour le détail de chacune et
`docs/DEPLOIEMENT.md` pour la mise en ligne.

Le schéma de base de données est dans `docs/schema-reference.sql` et les
migrations versionnées dans `code/supabase/migrations/`.

## Vérifier que tout fonctionne

```bash
cd code
npx tsc --noEmit   # TypeScript strict
npm run lint        # ESLint
npm test            # Vitest (unitaire + intégration)
npm run test:e2e    # Playwright (e2e + audit d'accessibilité) — nécessite un navigateur Chromium téléchargé et l'accès réseau à Supabase/Stripe
```

## S'orienter dans le code

- `code/app/` — pages Next.js (App Router), regroupées par zone : `(public)`,
  `(shop)`, `(auth)`, `(portails)` (équipes/clubs), `(admin)`, `(financement)`,
  `(operations)`, `api/`.
- `code/lib/` — toute la logique métier (calcul de crédit, taxes, répartition,
  commandes, versements, etc.), testable indépendamment des routes/composants.
- `code/components/` — composants UI partagés (système de design : `ui/`,
  navigation : `nav/`, assistant multi-étapes : `wizard/`).
- `code/tests/` — `unit/` (Vitest), `integration/` (Vitest + Postgres
  embarqué, exerce les policies RLS), `e2e/` (Playwright).
- `code/supabase/migrations/` — migrations SQL numérotées, source de vérité du
  schéma en production.

## Documentation

Voir **`docs/README.md`** pour l'index complet (documents vivants à jour vs.
historique archivé). En bref :
- `docs/PROGRESS.md` — où en est le projet, tâche par tâche.
- `docs/DECISIONS.md` — journal des choix faits en autonomie (avec le
  raisonnement derrière chacun).
- `docs/DESIGN.md` — système de design actuel (palette, typographie,
  composants).
- `docs/QUESTIONS.md` — questions qui ont nécessité une décision du
  propriétaire du produit (argent, sécurité, données de mineurs, ambiguïté du
  cahier des charges).

## Points ouverts avant un lancement commercial réel

- Les pages légales (`/confidentialite`, `/conditions`,
  `/remboursement-livraison`) sont des **gabarits** — révision juridique
  professionnelle requise (Québec/Canada, confidentialité des mineurs).
- Aucun favicon/`opengraph-image` n'existe encore — à fournir avec l'identité
  visuelle de marque.
- Les tests e2e (`code/tests/e2e/`) n'ont pas pu être exécutés dans
  l'environnement de développement utilisé pour construire ce projet (accès
  réseau restreint à Chromium/Supabase/Stripe) — à lancer en CI ou en local
  avant la mise en production.
