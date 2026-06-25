# Audit complet du projet — 2026-06-25

Rapport rédigé à la demande de Frédéric (« vérifier tout le projet pour que
ce soit structuré, clair, précis et sans erreur, comme pour une livraison
d'un projet d'une grande firme du web »). Portée : dépôt entier — code,
base de données en production, sécurité, et documentation — après les
Phases 0 à 1.6 et 1.5.

## 1. Constat global

Le projet est sain. Aucune des règles non négociables du `CLAUDE.md`
(argent, sécurité, RLS) n'est violée. Les seuls défauts trouvés sont
d'ordre opérationnel (un index git corrompu, deux fichiers tronqués par un
bug d'environnement) et documentaire (un fichier d'orchestration coupé en
plein milieu d'une phrase, un journal d'avancement mal classé) — tous
corrigés pendant cet audit.

788 tests (unitaires + intégration) verts, aucune régression. `tsc --noEmit`
et `npm run lint` propres sur tout `code/`.

## 2. État du dépôt git

**Trouvaille notable : corruption de l'index git.** `git status` affichait
faussement une quarantaine de fichiers suivis comme supprimés ET non suivis
en même temps. Cause : des fichiers `.lock` (`index.lock`, `HEAD.lock`,
`index.new.lock`, `refs/heads/main.lock`) laissés par un processus git
interrompu. Aucune perte de donnée : le contenu réel sur disque et dans
`HEAD` était intact, confirmé avant toute correction (`git ls-tree`,
`git fsck`). Réparé par reconstruction non destructive de l'index.

Le dépôt est maintenant à jour, propre, **24 commits en avance sur
`origin/main`** (jamais poussés). Aucune action de poussée n'a été faite —
à confirmer avec vous, puisque cela peut déclencher un déploiement Vercel.

## 3. Code — tests, types, lint

- `tsc --noEmit` : propre, aucune erreur de type.
- `npm run lint` : propre.
- Suite de tests : 788 tests (46 fichiers unitaires + 14 fichiers
  d'intégration), tous verts, exécutés par lots (contrainte de bac à
  sable, sans impact sur le résultat).
- Aucune logique métier dans `app/**/page.tsx` ni dans les composants —
  tout passe par `lib/`, conforme à la section 6 du `CLAUDE.md`.
- Nommage vérifié : fichiers en kebab-case, composants en PascalCase,
  fonctions en camelCase, colonnes DB en snake_case. Aucune exception
  trouvée.

## 4. Règles d'argent (section 4 du CLAUDE.md) — toutes vérifiées conformes

- Tous les montants en `integer` centimes (`*_cents`), aucun `float` trouvé.
- Calcul de crédit + création de commande : atomiques, une seule
  transaction Postgres (`create_paid_order`).
- Le crédit ne se déclenche que sur le webhook Stripe confirmé — jamais à
  la soumission du formulaire.
- Idempotence des webhooks : clé `stripe_event_id` + `ON CONFLICT DO
  NOTHING`, vérifié dans `app/api/webhooks/stripe/route.ts`.
- Répartition multi-bénéficiaires : `assertSplitTotals10000()` force
  `SUM(share_bps) = 10000`, résidu d'arrondi attribué au premier
  bénéficiaire — `lib/cart/beneficiaries.ts`.
- Aucun solde stocké en dur ; tout calculé depuis `order_credits`.

## 5. Sécurité

- **RLS activée sur toutes les tables.** Confirmé via les advisors Supabase
  et lecture directe du schéma.
- **7 vues `SECURITY DEFINER`** flaguées ERROR par le linter Supabase —
  inspection du SQL réel de chacune (`v_public_athlete`,
  `v_public_club`, `v_public_team`, `v_public_campaign`,
  `v_public_campaign_products`, `v_beneficiary_credit_totals`,
  `v_campaign_progress`) : **toutes intentionnelles et correctes**. C'est
  le patron exigé par la section 5 du `CLAUDE.md` (vues publiques qui
  respectent les `hide_*`) — `v_public_athlete` masque bien
  `last_name`/`city`/`photo_url` selon les drapeaux et exclut les mineurs
  sans consentement parental.
- **Une recommandation de durcissement, non appliquée** (changement de
  droits en production = à confirmer avec vous) : la fonction trigger
  `handle_new_auth_user()` a un `EXECUTE` accordé à `anon`/`authenticated`
  qui n'est pas nécessaire (les fonctions trigger ne sont de toute façon
  appelables que par un vrai trigger, donc risque pratique faible, mais
  retirer ce grant serait plus propre).
- Aucun secret en dur dans le code — seul `.env.example` est suivi, avec
  des valeurs vides et bien commentées.
- `console.log` : un seul usage, dans `lib/logger/logger.ts`, qui EST le
  logger centralisé exigé par la section 6.

## 6. Cohérence de la documentation — corrigée pendant cet audit

Trois défauts trouvés et corrigés (voir le détail et la justification dans
`docs/DECISIONS.md`, entrée du 2026-06-25) :

1. **`ORCHESTRATION.md` était tronqué** — coupé en plein milieu de la
   section « Quand t'arrêter et me demander », juste avant le point (c).
   Même bug d'environnement que les fichiers tronqués déjà documentés.
   Reconstruit à partir de la section 9 du `CLAUDE.md`. Au passage,
   corrigé une dizaine de références à des noms de fichiers obsolètes
   (datant d'avant le déplacement de tout vers `docs/`).
2. **`docs/PROGRESS.md` mal classé** — les Phases 1.6 et 1.5, entièrement
   terminées et cochées, se trouvaient sous l'en-tête « À venir » au lieu
   de « Terminé ». Reclassé ; la section « À venir » reflète maintenant
   qu'il n'y a rien de planifié pour l'instant.
3. **Fichier de débogage résiduel** (`copy-button-debug.disabled.txt`,
   vide, jamais suivi) supprimé.

## 7. Recommandations — appliquées le 2026-06-25

Sur votre demande, appliquées en production via migrations (voir
`docs/DECISIONS.md`) :

- **26 index ajoutés** sur les clés étrangères qui n'en avaient pas
  (migration `0021`). Vérifié après coup : 0 restante.
- **9 politiques RLS réécrites** pour évaluer `auth.uid()` une fois par
  requête au lieu d'une fois par ligne (migration `0022`). Même logique,
  juste plus rapide à volume élevé.
- **2 politiques RLS en double fusionnées** sur `credit_rules` (migration
  `0022`).
- **Grant `EXECUTE` inutile retiré** sur `handle_new_auth_user()` (migration
  `0022`). Confirmé : ni `anon` ni `authenticated` ne peuvent plus l'exécuter
  directement.

Les 19 fichiers de tests d'intégration ont été relancés après ces
migrations : tous verts, aucune régression.

**Laissé tel quel, à votre décision :**

- 11 index jamais utilisés à ce jour — les supprimer maintenant serait
  prématuré tant qu'il y a peu de trafic réel.
- Les 24 commits non poussés vers `origin/main` (peut déclencher un
  déploiement Vercel).
- Un écart constaté en passant : la table de suivi des migrations Supabase
  ne référence que les migration