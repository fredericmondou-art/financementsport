# PLAN — Paramètres de plateforme et limites de campagne

> Plan technique avant codage, réponse à `SPEC-PARAMETRES-PLATEFORME.md` (fichier
> reçu hors dépôt, non copié ici — voir la convention déjà suivie pour
> `BRIEF-REFONTE-ACCUEIL.md`, `docs/DECISIONS.md` 2026-07-10). Périmètre de cette
> session : **P.1 et P.2 seulement** (fondations données + module de lecture).
> P.3 à P.8 restent à traiter tâche par tâche, comme l'exige `CLAUDE.md` section 9.

---

## 1. Ce qui existe déjà et contraint ce plan

- Dernière migration en place : `0022_optimize_rls_and_harden_grants.sql` → la
  nouvelle migration sera `0023_platform_parameters.sql`.
- Convention RLS « service role uniquement » déjà établie sur `stripe_events`
  (migration 0006) : `ENABLE ROW LEVEL SECURITY` + **aucune policy** = la table
  n'est exposée à personne d'autre que `service_role` (BYPASSRLS). C'est
  exactement ce que demande la spec §2 (« lecture par le serveur uniquement »).
  On réutilise ce patron plutôt que d'inventer un nouveau mécanisme.
- Convention « repo injectable + module pur » déjà établie par
  `lib/taxes/rates.ts` (`createSupabaseTaxRatesRepo`) : un constructeur qui
  prend un `SupabaseClient` et retourne une interface étroite, pour permettre
  aux tests unitaires d'injecter un faux repo sans dépendre de Postgres.
- Convention de test à deux étages : `tests/unit/*.test.ts` (logique pure,
  repo en mémoire) + `tests/integration/*-rls.test.ts` (Postgres embarqué,
  rejoue toutes les migrations, vérifie RLS réel). Vu le volume de règles à
  venir (R1-R9), on garde ce découpage : le module `lib/parametres.ts` est
  testé unitairement maintenant ; un test RLS dédié à
  `parametres_plateforme`/`derogations_parametres` est ajouté dans cette même
  session pour verrouiller « aucune lecture client directe » dès la migration.

## 2. Modèle de données — décisions techniques précises

Reprend le modèle de `SPEC-PARAMETRES-PLATEFORME.md` §2 sans le modifier, avec
ces précisions nécessaires pour écrire du SQL valide :

- `parametres_plateforme.cle` : `TEXT PRIMARY KEY`.
- `parametres_plateforme.type_limite` : `TEXT NOT NULL CHECK (type_limite IN
  ('souple','dure'))` — contrainte en base plutôt qu'une simple convention
  documentaire, cohérent avec les enums texte+CHECK déjà utilisés ailleurs
  dans le schéma (ex. `entite_type` ci-dessous).
- `parametres_plateforme.modifie_par` : `UUID REFERENCES profiles(id) ON
  DELETE SET NULL`, nullable — même patron que `credit_audit_log.actor_id`
  (« NULL = système »).
- `derogations_parametres.cle_parametre` : `TEXT NOT NULL REFERENCES
  parametres_plateforme(cle)` — empêche une dérogation sur une clé qui
  n'existe pas.
- `derogations_parametres.entite_type` : `TEXT NOT NULL CHECK (entite_type IN
  ('campagne','equipe','athlete'))`.
- `derogations_parametres.admin_id` : **décision autonome** — la spec le liste
  sans préciser la nullabilité. `ON DELETE SET NULL` exige une colonne
  nullable ; on suit donc le même patron que `credit_audit_log.actor_id`
  (nullable, `ON DELETE SET NULL`) plutôt que `NOT NULL` + `ON DELETE
  RESTRICT`, pour ne jamais bloquer la suppression d'un compte admin à cause
  d'une ligne d'audit historique. Documenté dans `docs/DECISIONS.md`.
- RLS `derogations_parametres` : **décision autonome** — même patron
  « service role uniquement » que `parametres_plateforme` pour cette session,
  puisqu'aucun écran admin n'existe encore (spec §7, hors périmètre V1) et
  qu'aucune fonctionnalité ne lit cette table pour l'instant. Une policy
  `SELECT` pour `platform_admin` sera ajoutée en migration additive au moment
  de P.7 (mécanisme de dérogation), pas avant — cohérent avec la pratique du
  projet d'ajouter les policies au moment où une fonctionnalité les exerce
  réellement (ex. migration 0016 pour le dashboard équipe).
- Index : `idx_derogations_parametres_cle`, `idx_derogations_parametres_entite
  (entite_type, entite_id)`, `idx_derogations_parametres_admin` — même
  discipline que la migration 0021 (indexer toutes les FK).
- Seed des 12 valeurs de la spec §3 inséré dans la même migration (pas de
  fichier seed séparé) : ce sont des données de configuration permanentes,
  pas des données de démo — différent de `supabase/seed.sql`.

## 3. Module `lib/parametres.ts`

- Types stricts : une union `CleParametre` des 12 clés, une interface
  `ParametresValeurs` qui type chaque clé individuellement (`number`,
  `boolean`, ou `{min,max,defaut}` selon la spec §3) — pas de `Record<string,
  unknown>` générique, pour que les futurs appels R1-R9 (P.3+) aient de
  l'autocomplétion et une erreur de compilation si une clé est mal orthographiée.
- `PARAMETRES_DEFAUT` : constante exportée, valeurs identiques au seed §3 —
  c'est la même donnée à deux endroits (SQL + TS) par nécessité (spec §2 :
  « codées aussi dans une constante serveur... utilisée en fallback »).
  Risque de divergence documenté ; un test unitaire compare littéralement les
  deux jeux de valeurs pour l'attraper si quelqu'un modifie l'un sans l'autre.
- `createSupabaseParametresRepo(supabase)` : repo étroit (`listAll()`
  uniquement), même patron que `lib/taxes/rates.ts`.
- Cache mémoire 5 minutes au niveau du module (pas par requête) : un
  singleton `{ valeurs, expiresAt }`. `invalidateParametresCache()` exportée
  pour P.7 (une dérogation ou une modification admin doit pouvoir forcer une
  relecture immédiate, spec §2).
- Fallback à deux niveaux, conforme spec §2 :
  1. Table inaccessible (erreur réseau/RLS/permissions) → `PARAMETRES_DEFAUT`
     complet, rien n'est mis en cache (retentera au prochain appel).
  2. Table accessible mais une clé absente ou de forme invalide (validée par
     un schéma zod par clé) → seule CETTE clé retombe sur sa valeur par
     défaut, les autres clés lues restent celles de la base.
- `getParametres(supabase)` (objet complet) et `getParametre(cle, supabase)`
  (une seule clé, typé par `cle`) — les deux passent par la même fonction
  interne testable `loadParametres(repo, now?)` qui accepte un repo/horloge
  injectés, pour tester le TTL et le fallback sans Postgres ni faux timers
  globaux.
- Hors périmètre de P.2, volontairement : `type_limite`/`description` ne sont
  pas exposés par le module. Chaque règle R1-R9 encode déjà elle-même son
  comportement souple/dur dans le code (spec §4) ; `type_limite` en base sert
  de documentation pour l'admin, pas de branchement runtime. À réévaluer si
  P.6/P.7 en ont besoin.

## 4. Séquencement de cette session

1. **P.1** — migration `0023_platform_parameters.sql` (tables + RLS + seed).
2. **P.2** — `lib/parametres.ts` + tests unitaires (cache, fallback total,
   fallback par clé, cohérence seed↔TS) + test d'intégration RLS dédié
   (`tests/integration/platform-parameters-rls.test.ts`) vérifiant qu'`anon`/
   `authenticated` ne lisent rien et que `service_role` lit tout.
3. Vérification : `npx tsc --noEmit`, `npm run lint`, suite de tests ciblée
   puis suite complète par lots (contrainte de délai du bac à sable, même
   pratique que les tâches précédentes).
4. Documentation : entrée `docs/DECISIONS.md`, mise à jour `docs/PROGRESS.md`,
   commit.

P.3 à P.8 ne sont **pas** codés dans cette session — ce sont des tâches
distinctes (validations serveur R1-R9, écran assistant, mécanisme de
dérogation) qui dépendent de P.1/P.2 mais touchent des mutations existantes
déjà testées ; les traiter une à la fois limite le risque de régression sur
la création de campagne/panier, conformément à `CLAUDE.md` section 9.

## 5. Points déjà signalés par la spec, non retranchés ici

- §8 : qualification/expiration des crédits et traitement fiscal du plafond
  annuel restent des points ouverts nécessitant une décision humaine — aucune
  valeur de `athlete_credit_annuel_max`/`campagne_duree_jours.max` ne sera
  relevée sans instruction explicite (spec §3, note).
- §8 : valeur définitive de `campagne_commandes_max` et politique de
  communication « campagne complète » restent à trancher après le pilote —
  la valeur seed (250) est posée telle quelle en attendant.
