# Audit de structure et de code — état après la Tâche 1.7

Rapport rédigé à la demande de Frédéric (« révision complète, structurer
comme un expert développeur »). Portée : tout le projet livré (Tâches 0.0 à
1.7) — `code/lib`, `code/app`, `code/supabase`, `code/tests`, `docs/`.

Principe suivi pour ce passage : **ne pas toucher à la logique métier déjà
testée et partiellement déployée en production** (calcul de crédit, RLS,
transactions atomiques) — elle est saine et couverte par 281 tests verts.
Le travail ci-dessous porte sur la **structure, la cohérence et la dette de
documentation**, pas sur une réécriture spéculative de ce qui fonctionne.

## 1. Constat global

- ~5 200 lignes dans `lib/`, ~2 400 dans `app/`, ~4 850 dans `tests/` (hors
  `node_modules`/`.next`).
- 24 fichiers de test, 281 tests, tous verts ; `tsc --noEmit` et
  `npm run lint` propres avant ce passage.
- Architecture en couches (CLAUDE.md §6) globalement bien respectée : aucune
  logique métier trouvée dans `app/**/page.tsx` ou dans `components/*.tsx` —
  toutes les pages/route handlers délèguent à des fonctions pures de `lib/`.
- Règles d'argent (§4) respectées partout où vérifié : `*_cents` en
  `integer`, aucun `float`, transactions atomiques via fonctions SQL
  (`create_paid_order`, `create_campaign_with_details`), idempotence webhook
  par id d'évènement Stripe, audit log des crédits.
- RLS activée et testée sur toutes les tables manipulées par le code
  applicatif (vérifié via `tests/integration/rls-policies.test.ts` et les
  tests d'intégration de chaque tâche).
- Aucun secret en dur trouvé dans le code (`.env.local` correctement
  `.gitignore`).

## 2. Dette structurelle identifiée et corrigée dans ce passage

| # | Constat | Correction |
|---|---|---|
| 1 | `code/supabase/a-coller-manuellement/` (4 fichiers SQL) datait d'avant la mise en place des migrations numérotées ; son contenu est intégralement repris et déjà appliqué en production via `supabase/migrations/0001-0003`. Le conserver crée un risque de double source de vérité qui pourrait diverger silencieusement des migrations réelles. | Dossier supprimé. Les rapports historiques (`docs/rapports/RAPPORT-0.3.md`, `docs/rapports/RAPPORT-0.4.md`) qui le mentionnent restent inchangés (ce sont des comptes-rendus datés, pas une documentation vivante). |
| 2 | 5 fichiers `README.md` de stub (`lib/credits`, `lib/orders`, `lib/payments`, `lib/taxes`, `lib/email`) annonçaient encore « à implémenter dans une tâche ultérieure », alors que ces modules sont pleinement implémentés et testés depuis les Tâches 1.3/1.5. Trompeur pour quiconque relit le code. | Contenu remplacé par une description factuelle d'une phrase de ce que contient réellement le dossier, plus un renvoi vers le test correspondant. |
| 3 | `lib/validation/README.md` annonçait un module de schémas zod partagés ; ce module n'a jamais été créé (0 import nulle part) — chaque module valide ses propres entrées avec zod, colocalisé avec sa logique. C'est en fait le choix qui a été fait projet entier, mais le dossier vide contredisait silencieusement la convention réelle. | Dossier `lib/validation/` supprimé. Convention « zod colocalisé par module, pas de schéma partagé centralisé » actée explicitement dans `docs/DECISIONS.md`. |
| 4 | `getEnv()` (lecture d'une variable d'environnement obligatoire, erreur explicite si absente) dupliquée à l'identique dans `lib/db/supabase-client.ts` et `lib/auth/supabase-server.ts`. | Extrait dans `lib/env.ts` (nouveau, 9 lignes), les deux fichiers l'importent désormais. |
| 5 | `.gitkeep` laissés dans des dossiers qui ne sont plus vides : `app/(shop)/`, `app/(portails)/`, `app/api/`, `components/`. | Les 4 `.gitkeep` devenus inutiles supprimés. Ceux de `app/(financement)/`, `app/(operations)/`, `app/(public)/` conservés : ces groupes de routes sont réellement vides, réservés à des phases futures (cahier §63). |
| 6 | Le groupe de routes `app/(public)/` existait (vide) alors que les pages publiques réelles (`app/page.tsx`, `app/[athleteSlug]`, `app/team/[slug]`, `app/club/[slug]`) vivaient à la racine de `app/` — incohérent avec `(auth)`, `(shop)`, `(portails)` qui, eux, regroupent bien leurs pages. Les groupes de routes Next.js n'affectent jamais l'URL (les parenthèses sont retirées), donc ce déplacement est sans risque pour les routes existantes. | Les 4 pages déplacées dans `app/(public)/`. Aucune URL ne change (`/`, `/[athleteSlug]`, `/team/[slug]`, `/club/[slug]` restent identiques). Vérifié : aucun fichier `lib/`/`tests/` n'importait ces pages par chemin (Next.js les route par convention, jamais par import). |
| 7 | `tests/credits/calculate.test.ts` et `tests/credits/resolve-rule.test.ts` étaient les deux seuls fichiers de test situés hors de `tests/unit/`, `tests/integration/`, `tests/e2e/` — incohérent avec la convention établie depuis la Tâche 1.4. | Déplacés vers `tests/unit/credits-calculate.test.ts` et `tests/unit/credits-resolve-rule.test.ts` (même convention de nommage `<domaine>-<fonction>.test.ts` que `tests/unit/cart-beneficiaries.test.ts`, etc.). `vitest.config.ts` n'a pas besoin de changer (il scanne déjà tout `tests/**`). |

## 3. Vérifié conforme — aucune action nécessaire

- Nommage : fichiers `kebab-case`, composants React `PascalCase`
  (`ProductCard`, `BeneficiarySplit`), fonctions `camelCase`, colonnes DB
  `snake_case` — cohérent sur l'ensemble du code lu.
- Deux clients Supabase distincts (`createSupabaseBrowserClient`/
  `createSupabaseServiceClient` dans `lib/db/`, `createSupabaseServerClient`
  dans `lib/auth/`) : ce n'est **pas** une duplication mais une séparation
  voulue et documentée (anon vs service_role vs SSR cookies) — conservée
  telle quelle.
- `lib/format-cents.ts` et `lib/slug.ts` restent directement sous `lib/`
  (plutôt que dans un sous-dossier dédié) : ce sont des utilitaires
  transverses sans dépendance métier, utilisés par de nombreux modules —
  convention acceptable, pas de changement.
- `lib/db/client.ts` (ré-export de `supabase-client.ts`) : shim volontaire et
  documenté en tête de fichier pour respecter un nom de fichier attendu par
  la Tâche 0.2 — pas une erreur, conservé.
- `lib/db/types.ts` : types écrits manuellement, avec un avertissement
  explicite en tête de fichier rappelant qu'ils doivent être régénérés via
  `supabase gen types typescript --linked` dès que c'est pratique. Risque
  résiduel connu et déjà documenté — aucune action requise de ce passage.

## 4. Risques résiduels (hors scope de ce passage, à garder à l'œil)

- `lib/db/types.ts` manuel : un futur changement de schéma DB appliqué
  directement en SQL (hors migration) pourrait faire diverger ce fichier
  sans qu'aucun test ne le détecte (les tests d'intégration créent leur
  propre schéma à partir des migrations, pas de ce fichier de types). À
  régénérer dès qu'un flux CI avec le CLI Supabase sera en place.
- 2FA admin : champ prévu mais non actif (Phase 1.5 assumée, CLAUDE.md §5).
- QR codes : seule la couche de données existe (Tâche 1.7) ; génération
  d'image, téléchargement et route `/q/<code>` restent à faire en Phase 1.5.

## 5. Résultat après refactorisation

`tsc --noEmit`, `npm run lint` et `npx vitest run` (281/281) repassés
intégralement après chaque déplacement de fichier, pour confirmer l'absence
de régression d'import (`@/lib/...`, `@/app/...`).
