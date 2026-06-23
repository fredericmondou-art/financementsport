-- =============================================================================
-- SCHÉMA DE BASE DE DONNÉES — PLATEFORME DE FINANCEMENT SPORTIF
-- Cible : PostgreSQL / Supabase
-- Périmètre : Phase 0 (fondations) + Phase 1 (flux vendable) + amorces Phase 1.5
-- =============================================================================
--
-- PRINCIPES DE CONCEPTION
-- 1. Bénéficiaire POLYMORPHE : un crédit peut viser un athlète, une équipe OU un
--    club, au même niveau. Patron (beneficiary_type, beneficiary_id).
-- 2. Argent en CENTIMES (integer), jamais en float. amount_cents INTEGER.
-- 3. Tout est traçable : created_at, updated_at partout ; tables d'audit pour
--    l'argent et les crédits.
-- 4. Confidentialité mineurs : champs de masquage présents dès le départ
--    (défaut = visible, le parent peut masquer).
-- 5. Règles de crédit CONFIGURABLES, avec une hiérarchie de résolution claire.
-- 6. Les soldes (montant amassé, crédit total) ne sont PAS stockés en dur ;
--    ils se calculent via des vues / agrégations sur les lignes de crédit, qui
--    sont la source de vérité. (On pourra ajouter des colonnes cache + triggers
--    en Phase 2 si la performance l'exige.)
-- =============================================================================

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- emails insensibles à la casse

-- =============================================================================
-- TYPES ÉNUMÉRÉS
-- =============================================================================

CREATE TYPE user_role AS ENUM (
  'client',            -- parent / acheteur
  'athlete',           -- athlète (souvent géré par un parent)
  'team_manager',      -- responsable d'équipe
  'club_admin',        -- administrateur de club
  'platform_admin',    -- admin plateforme
  'support',
  'logistics',
  'accounting'
);

CREATE TYPE beneficiary_type AS ENUM ('athlete', 'team', 'club');

CREATE TYPE campaign_type AS ENUM (
  'team', 'club', 'athlete', 'event', 'annual', 'reorder'
);

CREATE TYPE campaign_status AS ENUM (
  'draft', 'pending_approval', 'scheduled', 'active',
  'ended', 'closed', 'paid', 'cancelled', 'archived'
);

CREATE TYPE order_status AS ENUM (
  'payment_pending', 'paid', 'preparing', 'ready',
  'delivered_to_team', 'distributed', 'completed',
  'cancelled', 'refunded', 'partially_refunded', 'error'
);

CREATE TYPE credit_status AS ENUM (
  'pending', 'active', 'expired', 'cancelled', 'refunded'
);

CREATE TYPE payout_status AS ENUM (
  'calculated', 'in_validation', 'approved', 'paid', 'adjusted', 'disputed', 'closed'
);

CREATE TYPE product_kind AS ENUM ('product', 'pack', 'subscription');

-- =============================================================================
-- UTILISATEURS & AUTH
-- Supabase gère auth.users. On crée une table profils liée par id.
-- =============================================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         CITEXT UNIQUE NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  role          user_role NOT NULL DEFAULT 'client',
  -- Consentements (section 59)
  consent_email BOOLEAN NOT NULL DEFAULT FALSE,
  consent_sms   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un utilisateur peut avoir plusieurs rôles contextuels (ex: responsable de
-- l'équipe A et parent). Le rôle ci-dessus est le rôle "principal" ; les accès
-- fins passent par les tables de liaison (memberships) ci-dessous.

CREATE TABLE addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label        TEXT,
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  province     TEXT NOT NULL,         -- ex: 'QC' (sert au calcul des taxes)
  postal_code  TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'CA',
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- ENTITÉS DE FINANCEMENT : CLUB → ÉQUIPE → ATHLÈTE
-- =============================================================================

CREATE TABLE clubs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,          -- /club/corsaires
  description  TEXT,
  logo_url     TEXT,
  city         TEXT,
  province     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at  TIMESTAMPTZ,                   -- validation admin (section 57)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      UUID REFERENCES clubs(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,          -- /team/u11-hockey
  sport        TEXT,
  category     TEXT,                          -- ex: 'U11'
  logo_url     TEXT,
  city         TEXT,
  province     TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE athletes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  -- Parent/tuteur qui gère le profil (peut être NULL si athlète adulte autonome)
  guardian_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Compte propre de l'athlète, si majeur/autonome (section 2.3)
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,        -- /thomas-u11
  sport           TEXT,
  city            TEXT,
  photo_url       TEXT,
  personal_message TEXT,
  is_minor        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Confidentialité (sections 5, 48) : défaut = tout visible (choix "Standard"),
  -- mais le parent peut activer chaque masquage.
  hide_last_name  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE => prénom + initiale
  hide_photo      BOOLEAN NOT NULL DEFAULT FALSE,
  hide_city       BOOLEAN NOT NULL DEFAULT FALSE,
  hide_amounts    BOOLEAN NOT NULL DEFAULT FALSE,
  show_team_only  BOOLEAN NOT NULL DEFAULT FALSE,
  parental_consent_at TIMESTAMPTZ,            -- consentement parental (section 48)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liaison rôles contextuels : qui gère quel club/équipe.
CREATE TABLE memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         user_role NOT NULL,            -- 'team_manager' | 'club_admin'
  club_id      UUID REFERENCES clubs(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Au moins un des deux scopes doit être présent
  CONSTRAINT membership_scope CHECK (club_id IS NOT NULL OR team_id IS NOT NULL)
);

-- =============================================================================
-- CATALOGUE : PRODUITS, PACKS
-- =============================================================================

CREATE TABLE product_categories (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL,
  slug  TEXT UNIQUE NOT NULL
);

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            product_kind NOT NULL DEFAULT 'product',
  category_id     UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  image_url       TEXT,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  -- Crédit FIXE optionnel (surtout pour les packs). Si NULL, on applique une
  -- règle de crédit (table credit_rules) au moment de l'achat.
  fixed_credit_cents INTEGER CHECK (fixed_credit_cents >= 0),
  is_taxable      BOOLEAN NOT NULL DEFAULT TRUE,
  stock_quantity  INTEGER NOT NULL DEFAULT 0,
  lead_time_days  INTEGER,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- RÈGLES DE CRÉDIT CONFIGURABLES (sections 14, 15)
-- Résolution, du plus spécifique au plus général :
--   1. products.fixed_credit_cents (crédit fixe sur le produit/pack)
--   2. credit_rules ciblant (campaign_id + product_id)
--   3. credit_rules ciblant (campaign_id)            -> taux de la campagne
--   4. credit_rules ciblant (product_id)
--   5. credit_rules globale (scope = 'permanent' / 'subscription' / défaut)
-- Le moteur applique la première règle trouvée selon cet ordre.
-- =============================================================================

CREATE TABLE credit_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Portée : à quoi s'applique la règle. NULL = joker.
  campaign_id   UUID,                          -- FK ajoutée après création campaigns
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'default', -- 'campaign'|'permanent'|'subscription'|'default'
  -- Mode de calcul : pourcentage OU montant fixe.
  percent_bps   INTEGER CHECK (percent_bps BETWEEN 0 AND 10000), -- points de base (1500 = 15%)
  flat_cents    INTEGER CHECK (flat_cents >= 0),
  -- Bonus de seuil (section 15) : si le panier dépasse min_basket_cents,
  -- on ajoute bonus_percent_bps.
  min_basket_cents   INTEGER,
  bonus_percent_bps  INTEGER CHECK (bonus_percent_bps BETWEEN 0 AND 10000),
  priority      INTEGER NOT NULL DEFAULT 0,     -- départage si plusieurs règles d'égale spécificité
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_rule_mode CHECK (percent_bps IS NOT NULL OR flat_cents IS NOT NULL)
);

-- =============================================================================
-- CAMPAGNES (section 16)
-- =============================================================================

CREATE TABLE campaigns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type               campaign_type NOT NULL,
  status             campaign_status NOT NULL DEFAULT 'draft',
  name               TEXT NOT NULL,
  slug               TEXT UNIQUE NOT NULL,
  public_message     TEXT,
  -- Bénéficiaire principal POLYMORPHE
  beneficiary_type   beneficiary_type NOT NULL,
  beneficiary_id     UUID NOT NULL,            -- pointe vers athletes|teams|clubs selon type
  -- Contexte (toujours utile pour les rapports et la résolution des accès)
  club_id            UUID REFERENCES clubs(id) ON DELETE SET NULL,
  team_id            UUID REFERENCES teams(id) ON DELETE SET NULL,
  goal_cents         INTEGER CHECK (goal_cents >= 0),
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,              -- verrouillage des ventes (section 16)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_dates CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

-- FK différée de credit_rules vers campaigns
ALTER TABLE credit_rules
  ADD CONSTRAINT credit_rules_campaign_fk
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Participants à une campagne (athlètes d'une campagne d'équipe)
CREATE TABLE campaign_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  athlete_id   UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  goal_cents   INTEGER CHECK (goal_cents >= 0),   -- objectif individuel optionnel
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,                       -- approbation parentale (section 2.4)
  UNIQUE (campaign_id, athlete_id)
);

-- Produits/packs inclus dans une campagne
CREATE TABLE campaign_products (
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, product_id)
);

-- =============================================================================
-- QR CODES & LIENS (sections 18, 19)
-- =============================================================================

CREATE TABLE qr_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cible polymorphe : athlète, équipe, club, campagne ou produit
  target_type      TEXT NOT NULL,   -- 'athlete'|'team'|'club'|'campaign'|'product'
  target_id        UUID NOT NULL,
  code             TEXT UNIQUE NOT NULL,   -- identifiant court encodé dans l'URL
  is_dynamic       BOOLEAN NOT NULL DEFAULT TRUE,
  redirect_url     TEXT,                   -- redirection si campagne terminée
  expires_at       TIMESTAMPTZ,
  scan_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- PANIER & COMMANDES (sections 12, 22)
-- =============================================================================

-- Panier persistant (permet "panier abandonné" + achat sans compte).
CREATE TABLE carts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL = invité
  session_token TEXT,                       -- pour rattacher un panier invité
  status       TEXT NOT NULL DEFAULT 'open', -- 'open'|'converted'|'abandoned'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cart_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id      UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,          -- figé au moment de l'ajout
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Répartition du panier entre bénéficiaires (sections 13). Somme des parts = 100%.
CREATE TABLE cart_beneficiaries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  beneficiary_type beneficiary_type NOT NULL,
  beneficiary_id   UUID NOT NULL,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  share_bps        INTEGER NOT NULL CHECK (share_bps BETWEEN 0 AND 10000) -- 5000 = 50%
);

CREATE TABLE orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       TEXT UNIQUE NOT NULL,    -- numéro lisible, ex: CMD-2026-000123
  user_id            UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = invité
  guest_email        CITEXT,                  -- si achat sans compte
  status             order_status NOT NULL DEFAULT 'payment_pending',
  -- Montants, tous en centimes, figés à la création
  subtotal_cents     INTEGER NOT NULL,
  tax_cents          INTEGER NOT NULL DEFAULT 0,
  shipping_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL,
  credit_total_cents INTEGER NOT NULL DEFAULT 0, -- crédit total généré (somme des lignes)
  -- Livraison : UNE commande = UN point de livraison (règle section 13)
  shipping_address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  -- Lien campagne principal (pour les rapports ; la répartition fine est dans
  -- order_credits)
  primary_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  team_id            UUID REFERENCES teams(id) ON DELETE SET NULL, -- pour distribution groupée
  stripe_payment_intent_id TEXT,
  notes_internal     TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,                 -- figé (le produit peut changer après)
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);

-- =============================================================================
-- CRÉDITS (sections 14, 15) — SOURCE DE VÉRITÉ DU FINANCEMENT
-- Chaque ligne = un crédit attribué à UN bénéficiaire pour UNE commande.
-- Une commande répartie sur 2 enfants => 2 lignes order_credits.
-- =============================================================================

CREATE TABLE order_credits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  beneficiary_type beneficiary_type NOT NULL,
  beneficiary_id   UUID NOT NULL,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0),
  status           credit_status NOT NULL DEFAULT 'pending',
  -- Traçabilité du calcul : quelle règle a produit ce crédit
  applied_rule_id  UUID REFERENCES credit_rules(id) ON DELETE SET NULL,
  computation_note TEXT,                      -- ex: "15% campagne + bonus seuil"
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Journal d'audit des crédits : toute transition de statut/montant y est écrite.
CREATE TABLE credit_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_credit_id UUID NOT NULL REFERENCES order_credits(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = système
  action          TEXT NOT NULL,             -- 'created'|'activated'|'cancelled'|'adjusted'...
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TAXES (section 21) — table de taux par province
-- =============================================================================

CREATE TABLE tax_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province     TEXT NOT NULL,                 -- 'QC', 'ON', ...
  rate_bps     INTEGER NOT NULL,              -- taux combiné en points de base
  label        TEXT,                          -- 'TPS+TVQ'
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (province, effective_at)
);

-- =============================================================================
-- LIVRAISON (sections 23, 24) — amorce Phase 1.5
-- =============================================================================

CREATE TABLE distribution_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  team_id      UUID REFERENCES teams(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'draft'  -- 'draft'|'ready'|'distributed'
);

-- =============================================================================
-- VERSEMENTS (section 37) — calcul auto, paiement MANUEL en V1
-- =============================================================================

CREATE TABLE payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  beneficiary_type beneficiary_type NOT NULL,
  beneficiary_id   UUID NOT NULL,
  amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0), -- somme des crédits actifs
  fee_held_cents   INTEGER NOT NULL DEFAULT 0,                  -- retenue pour frais
  status           payout_status NOT NULL DEFAULT 'calculated',
  approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at          TIMESTAMPTZ,
  proof_url        TEXT,                       -- preuve de paiement manuel
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- COURRIELS (section 28) — journal des envois pour idempotence
-- =============================================================================

CREATE TABLE email_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient    CITEXT NOT NULL,
  template     TEXT NOT NULL,                  -- 'order_confirmation'|'credit_confirmation'...
  related_type TEXT,                           -- 'order'|'campaign'...
  related_id   UUID,
  sent_at      TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'queued', -- 'queued'|'sent'|'failed'
  provider_id  TEXT,                           -- id SendGrid
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEX
-- =============================================================================

CREATE INDEX idx_athletes_team        ON athletes(team_id);
CREATE INDEX idx_athletes_guardian    ON athletes(guardian_id);
CREATE INDEX idx_teams_club           ON teams(club_id);
CREATE INDEX idx_memberships_user     ON memberships(user_id);
CREATE INDEX idx_campaigns_status     ON campaigns(status);
CREATE INDEX idx_campaigns_benef      ON campaigns(beneficiary_type, beneficiary_id);
CREATE INDEX idx_orders_user          ON orders(user_id);
CREATE INDEX idx_orders_status        ON orders(status);
CREATE INDEX idx_orders_campaign      ON orders(primary_campaign_id);
CREATE INDEX idx_order_items_order    ON order_items(order_id);
CREATE INDEX idx_order_credits_order  ON order_credits(order_id);
CREATE INDEX idx_order_credits_benef  ON order_credits(beneficiary_type, beneficiary_id);
CREATE INDEX idx_order_credits_camp   ON order_credits(campaign_id);
CREATE INDEX idx_credit_rules_lookup  ON credit_rules(campaign_id, product_id, scope);
CREATE INDEX idx_qr_target            ON qr_codes(target_type, target_id);

-- =============================================================================
-- VUES UTILES (les soldes se calculent, ils ne se stockent pas)
-- =============================================================================

-- Montant amassé (crédit actif) par bénéficiaire
CREATE VIEW v_beneficiary_credit_totals AS
SELECT
  beneficiary_type,
  beneficiary_id,
  campaign_id,
  COALESCE(SUM(amount_cents) FILTER (WHERE status = 'active'), 0)  AS active_cents,
  COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_cents
FROM order_credits
GROUP BY beneficiary_type, beneficiary_id, campaign_id;

-- Progression d'une campagne
CREATE VIEW v_campaign_progress AS
SELECT
  c.id AS campaign_id,
  c.goal_cents,
  COALESCE(SUM(oc.amount_cents) FILTER (WHERE oc.status IN ('active','pending')), 0) AS raised_cents
FROM campaigns c
LEFT JOIN order_credits oc ON oc.campaign_id = c.id
GROUP BY c.id, c.goal_cents;

-- =============================================================================
-- NOTE RLS (Row Level Security)
-- En Supabase, ACTIVER RLS sur TOUTES les tables et écrire des policies :
--   - un client ne voit que ses propres orders/addresses/carts ;
--   - un team_manager ne voit que les campagnes/commandes de ses équipes ;
--   - les pages publiques (athletes/teams/clubs/campaigns en statut public)
--     sont lisibles par 'anon' MAIS via des vues qui respectent les champs
--     hide_* (ne jamais exposer hide_amounts=TRUE, etc.) ;
--   - seul platform_admin écrit dans products, credit_rules, tax_rates.
-- Les policies RLS détaillées font l'objet d'un prompt dédié (voir 03-prompts).
-- =============================================================================
