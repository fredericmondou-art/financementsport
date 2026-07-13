# PHASE C.10 — MODULE TIRAGE (BILLETS)

> **Statut : DÉVELOPPEMENT AUTORISÉ / ACTIVATION BLOQUÉE**
> Le module se développe derrière un feature flag `RAFFLE_ENABLED=false`.
> **Gate d'activation identique à Stripe production** : révision juridique complète (règlement de concours, entrée sans achat, affichage aux mineurs, Loi 25). Aucune activation avant feu vert écrit.
> Rapports selon `RAPPORTS.md`. Règles non négociables : `CLAUDE.md`. Style : `DESIGN.md`.

---

## Contexte et règle métier

- 1 commande complétée = **10 billets** attribués au bénéficiaire de la commande.
- Répartition multi-bénéficiaires : billets au **prorata**, arrondi à l'unité inférieure, reliquat au bénéficiaire principal.
- **Plafond : 100 billets par athlète par tirage**, toutes sources confondues, appliqué à l'attribution.
- **Entrée sans achat obligatoire** (exigence légale) : formulaire attribuant 10 billets, même valeur, fréquence limitée (paramètre configurable, défaut 1×/7 jours par athlète).
- Remboursement/annulation avant tirage → révocation proportionnelle des billets liés à la commande.
- Les billets sont rattachés à un **tirage** (`draw`) borné dans le temps, jamais globaux.
- **Prix : équipement sportif au choix du gagnant.** La valeur est un paramètre par tirage (`prize_value_cad`), jamais codée en dur — ni dans le code, ni dans les textes UI, ni dans les courriels. Toute mention de montant est rendue dynamiquement depuis le draw actif.

---

## C.10.1 — Schéma de données (Supabase)

```sql
-- Tirages
create table raffle_draws (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  drawn_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','active','closed','drawn','cancelled')),
  prize_description text,
  prize_value_cad numeric(10,2),
  rules_url text,                      -- lien vers le règlement publié
  max_tickets_per_athlete int not null default 100,
  tickets_per_order int not null default 10,
  tickets_per_free_entry int not null default 10,
  free_entry_cooldown_days int not null default 7,
  draw_seed text,                      -- seed enregistré pour auditabilité
  winner_athlete_id uuid references athletes(id),
  created_at timestamptz default now()
);

-- Billets (attributions, pas billets unitaires : un enregistrement = un lot)
create table raffle_tickets (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references raffle_draws(id),
  athlete_id uuid not null references athletes(id),
  order_id uuid references orders(id),          -- null si entrée gratuite
  free_entry_id uuid references raffle_free_entries(id),
  source text not null check (source in ('order','free_entry')),
  tickets_count int not null check (tickets_count >= 0),
  status text not null default 'active'
    check (status in ('active','revoked')),
  revoked_reason text,
  created_at timestamptz default now(),
  revoked_at timestamptz
);
create index on raffle_tickets (draw_id, athlete_id) where status = 'active';

-- Entrées sans achat
create table raffle_free_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references raffle_draws(id),
  athlete_id uuid not null references athletes(id),
  requested_by_user_id uuid not null references auth.users(id), -- parent/tuteur
  created_at timestamptz default now()
);

-- Journal d'audit du tirage
create table raffle_audit_log (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references raffle_draws(id),
  event text not null,       -- 'draw_executed','winner_selected','winner_disqualified','redraw', etc.
  payload jsonb not null,
  actor_user_id uuid,
  created_at timestamptz default now()
);
```

RLS : lecture des billets limitée au parent/tuteur de l'athlète et aux admins. Aucune exposition publique des compteurs de billets. Écriture uniquement via service role (webhooks/admin).

## C.10.2 — Attribution à l'achat (webhook Stripe)

- Point d'accrochage : dans le handler existant du webhook `checkout.session.completed` / `payment_intent.succeeded`, **immédiatement après le calcul des crédits**, même unité logique.
- Algorithme :
  1. Trouver le `draw` actif (`status='active'`, `now()` entre `starts_at` et `ends_at`). Aucun draw actif → no-op silencieux.
  2. Pour chaque bénéficiaire de la commande : `part = floor(tickets_per_order × pct_répartition)`; reliquat au bénéficiaire principal.
  3. Plafond : `attribué = min(part, max_tickets - somme(billets actifs de l'athlète pour ce draw))`. Si 0, no-op (pas d'erreur).
  4. Insertion `raffle_tickets` avec `order_id`.
- **Idempotence obligatoire** : contrainte d'unicité `(draw_id, order_id, athlete_id)` partielle sur `source='order'` — un webhook rejoué ne double pas les billets.
- Aucune notification athlète (voir C.10.6).

## C.10.3 — Révocation sur remboursement

- Accrochage dans le flux de remboursement existant (même endroit que l'annulation des crédits).
- Remboursement complet → tous les billets `order_id` correspondants passent à `revoked`.
- Remboursement partiel → révocation proportionnelle au montant remboursé, arrondi supérieur (prudence : on révoque plus, jamais moins).
- Après tirage effectué (`status='drawn'`) : pas de révocation rétroactive; journaliser dans `raffle_audit_log` pour traitement manuel admin.

## C.10.4 — Entrée sans achat

- Route publique derrière authentification parent/tuteur : formulaire simple (sélection de l'athlète géré par le compte + case de consentement).
- Validation : cooldown `free_entry_cooldown_days` par athlète, plafond 100 respecté.
- Attribution `raffle_tickets` avec `source='free_entry'`.
- Anti-abus : rate limiting IP + compte; journalisation.
- ⚖️ Le texte du formulaire (mention « aucun achat requis ») provient du règlement validé — placeholder d'ici là.

## C.10.5 — Outil admin de tirage

- Page admin (back-office existant) : liste des draws, création/édition, compteurs de billets actifs par athlète.
- Exécution du tirage :
  1. Génération d'un seed (`crypto.randomUUID()` ou hash horodaté) enregistré dans `draw_seed` **avant** la sélection.
  2. Sélection pondérée : chaque athlète pèse `somme(tickets_count actifs)`. PRNG seedé déterministe (ex. `seedrandom`) → le résultat est **rejouable** à partir du seed pour vérification.
  3. Écriture `winner_athlete_id`, `drawn_at`, `status='drawn'` + événement complet dans `raffle_audit_log` (seed, total billets, distribution, résultat).
  4. Bouton « re-tirage » (disqualification) : journalise la disqualification et relance avec un nouveau seed, en excluant l'athlète disqualifié.
- Export CSV de l'état des billets au moment du tirage (preuve).

## C.10.6 — Affichage et conformité mineurs (CRITIQUE)

- **Aucun affichage du tirage sur le dashboard athlète.** Aucun badge, compteur, confetti ou mention liés au tirage dans les interfaces accessibles aux athlètes.
- Affichage autorisé uniquement : dashboard parent/tuteur, dashboard responsable d'équipe, pages destinées aux adultes.
- Le compteur de billets affiché au parent porte la mention du plafond et un lien vers le règlement.
- Communications (courriels) : uniquement aux comptes parents/tuteurs et responsables. Aucun courriel à un compte athlète.
- Feature flag `RAFFLE_ENABLED` contrôle TOUT l'affichage et les attributions (webhook inclus). Flag séparé `RAFFLE_UI_PARENT_ENABLED` si besoin de tester l'attribution sans UI.

## C.10.7 — Bannière promotionnelle du tirage (site public)

**Objectif** : afficher le tirage sur le site pour les acheteurs adultes, en conformité stricte avec l'interdiction de publicité destinée aux moins de 13 ans (art. 248-249 LPC) et les exigences de divulgation (art. 74.06 Loi sur la concurrence).

### Contenu
- Message adressé explicitement à l'adulte. Formulation de référence :
  « Chaque commande donne 10 chances de gagner de l'équipement sportif pour votre athlète. »
- **Aucun montant codé en dur** : la valeur du prix provient de `raffle_draws.prize_value_cad` du draw actif et s'affiche dynamiquement (ex. « d'une valeur de {prize_value_cad} $ »). Si le champ est nul, la bannière affiche la description sans montant.
- Ligne de divulgation obligatoire sous la bannière (petit texte, toujours visible) :
  « {nb_prix} prix · valeur approx. {prize_value_cad} $ CAD · Aucun achat requis · Question d'habileté · Se termine le {ends_at} · [Règlement complet]({rules_url}) »
- Ton et visuel adultes selon `DESIGN.md` : pas de mascotte, pas de langage enfantin, pas d'imagerie s'adressant directement aux jeunes.

### Placement
- **Autorisé** : page d'accueil, catalogue, panier, checkout, dashboard parent/tuteur, dashboard responsable d'équipe, courriels aux parents et responsables.
- **Interdit** : dashboard athlète, toute interface accessible à un compte athlète, toute communication adressée à un compte athlète. Pages publiques d'athlètes : interdit par défaut (paramètre `RAFFLE_BANNER_ON_ATHLETE_PAGES=false`, ne s'active qu'avec validation juridique explicite).

### Technique
- Composant unique `RaffleBanner` alimenté par le draw actif; rendu conditionnel sur `RAFFLE_ENABLED` **et** contexte non-athlète (vérification du rôle de session, pas seulement de la route).
- Aucune donnée de billets exposée publiquement — la bannière ne montre jamais de compteurs par athlète.
- La maquette et le texte final sont soumis à l'avocat avec le règlement (voir C.10.10).

## C.10.8 — Tests requis

- Attribution simple (1 bénéficiaire) : 10 billets.
- Répartition 50/50 : 5/5. Répartition 70/30 : 7/3. Répartition 33/33/34 : 3/3/4 (reliquat au principal).
- Plafond : athlète à 95 billets + commande → +5 seulement; athlète à 100 → +0 sans erreur.
- Idempotence webhook : rejeu → aucun doublon.
- Remboursement complet/partiel : révocation correcte; post-tirage : audit log seulement.
- Cooldown entrée gratuite; anti-abus.
- Reproductibilité du tirage : même seed + mêmes billets = même gagnant.
- Flag désactivé : aucune attribution, aucune UI.
- Bannière : montant affiché = `prize_value_cad` du draw actif (changement en base → changement à l'écran sans déploiement); jamais rendue pour une session athlète même sur une route autorisée; ligne de divulgation présente sur tous les formats.

## C.10.9 — Livrables

- [ ] Migrations SQL + RLS
- [ ] Hook webhook (attribution + idempotence)
- [ ] Hook remboursement (révocation)
- [ ] Formulaire entrée sans achat (parent/tuteur)
- [ ] Outil admin (CRUD draws + exécution tirage auditable + export)
- [ ] UI parent (compteur + lien règlement) derrière flag
- [ ] Composant `RaffleBanner` + divulgation + contrôle de placement par rôle (C.10.7)
- [ ] Suite de tests C.10.8
- [ ] Rapport selon `RAPPORTS.md`

## C.10.10 — Gate juridique (bloquant, hors développement)

À remettre à l'avocat avec le dossier existant (C.1–C.9) :
- [ ] `REGLEMENT_TIRAGE_MODELE.md` (validation art. 206 Code criminel : entrée sans achat + question d'habileté)
- [ ] Maquette + texte final de la bannière `RaffleBanner` (placement, ton, divulgation — validation vs art. 248-249 LPC et art. 74.06 Loi sur la concurrence)
- [ ] Validation de l'abrogation des obligations RACJ concours publicitaires (post-27 oct. 2023) et absence d'autres obligations
- [ ] Validation affichage/communications vs interdiction publicité <13 ans (lié à l'enjeu bloquant #2 existant)
- [ ] Validation Loi 25 : données du tirage (minimisation, durée de conservation, consentement parental)
- [ ] Feu vert écrit → alors seulement `RAFFLE_ENABLED=true`

---

*Généré le 2026-07-10. Ce fichier suit les conventions du projet (fichiers de tâches phasés). Ne pas activer avant clôture de C.10.9.*
