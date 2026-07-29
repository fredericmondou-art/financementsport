-- =============================================================================
-- Migration 0028 -- Schéma : récompenses vendeurs et acheteurs.
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, entrée du jour) : l'utilisateur veut
-- récompenser, en plus du bénéficiaire (athlète/équipe/club) qui reçoit déjà
-- le crédit de financement, DEUX autres rôles :
--   - le VENDEUR : la personne qui partage son propre code/QR pour amener des
--     ventes à la campagne d'un athlète/équipe/club (ex. un coéquipier, un
--     parent, un ami -- pas nécessairement un compte "responsable").
--   - l'ACHETEUR : le client qui complète une commande.
--
-- Décision confirmée par l'utilisateur (question posée explicitement, choix
-- engageant l'argent -- CLAUDE.md section 9a) : ces récompenses sont
-- financées par la MARGE de la plateforme, JAMAIS en réduisant le crédit du
-- bénéficiaire. Aucune ligne de cette migration ne touche order_credits ou
-- son calcul -- règle NON NÉGOCIABLE, au même titre que CLAUDE.md section 4.
--
-- Portée de cette migration : SCHÉMA SEULEMENT (tables + RLS). Le calcul des
-- récompenses, la capture de l'attribution au moment du checkout
-- (create_paid_order), l'émission réelle des codes de rabais, et l'UI restent
-- à construire -- voir TODO.md, chantier "Récompenses vendeurs/acheteurs".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CODE VENDEUR -- extension de qr_codes (migration 0001), pas une table
--    séparée. Un code vendeur cible TOUJOURS une campagne (target_type=
--    'campaign', target_id=campaign_id, déjà supporté) -- on ajoute juste
--    l'identité du vendeur qui possède ce code précis. Ça réutilise tel quel
--    la génération de code (lib/qr/generate.ts), le compteur de scans
--    (scan_count, migration 0012) et la résolution de redirection
--    (lib/qr/resolve-target.ts, INCHANGÉE : elle ne regarde que target_type/
--    target_id, jamais les colonnes seller_*) -- pas de logique dupliquée.
-- -----------------------------------------------------------------------------

ALTER TABLE qr_codes
  ADD COLUMN seller_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN seller_name       TEXT,
  ADD COLUMN seller_email      CITEXT;

COMMENT ON COLUMN qr_codes.seller_profile_id IS
  'Migration 0028 : si non NULL, ce code QR est un code vendeur personnel (pas le QR général de la campagne) -- rattaché au compte de la personne qui le partage. NULL si le vendeur n''a pas de compte (voir seller_name/seller_email).';
COMMENT ON COLUMN qr_codes.seller_name IS
  'Migration 0028 : nom d''affichage du vendeur (palmarès, reçu de récompense) -- requis dès qu''un code est un code vendeur, même sans compte.';
COMMENT ON COLUMN qr_codes.seller_email IS
  'Migration 0028 : contact pour émettre une récompense à un vendeur SANS compte plateforme (ex. jeune coéquipier).';

ALTER TABLE qr_codes
  ADD CONSTRAINT qr_codes_seller_requires_campaign_target
  CHECK (
    (seller_profile_id IS NULL AND seller_name IS NULL AND seller_email IS NULL)
    OR target_type = 'campaign'
  );

ALTER TABLE qr_codes
  ADD CONSTRAINT qr_codes_seller_requires_name
  CHECK (
    (seller_profile_id IS NULL AND seller_email IS NULL) OR seller_name IS NOT NULL
  );

-- Un vendeur AVEC compte n'a qu'un seul code personnel par campagne (évite la
-- confusion sur le palmarès). Un vendeur SANS compte n'a aucune contrainte
-- d'unicité possible (rien à comparer) -- accepté volontairement.
CREATE UNIQUE INDEX qr_codes_unique_seller_per_campaign
  ON qr_codes(target_id, seller_profile_id)
  WHERE target_type = 'campaign' AND seller_profile_id IS NOT NULL;

-- Un vendeur avec compte doit pouvoir gérer (créer/consulter) SES PROPRES
-- codes, en plus de qr_codes_scoped (migration 0005 : campaign managers +
-- platform_admin) -- policies permissives multiples se combinent en OR.
DROP POLICY IF EXISTS qr_codes_seller_self ON qr_codes;
CREATE POLICY qr_codes_seller_self ON qr_codes FOR ALL
  USING (seller_profile_id = auth.uid())
  WITH CHECK (seller_profile_id = auth.uid());

COMMENT ON POLICY qr_codes_seller_self ON qr_codes IS
  'Migration 0028 : un vendeur avec compte gère son propre code personnel, même s''il n''est pas responsable de la campagne (rôle "client" ordinaire).';

-- -----------------------------------------------------------------------------
-- 2. ATTRIBUTION -- quel code vendeur a amené la vente, jusqu'à la commande.
--    Capturé au premier contact (visite via le lien du vendeur), gardé sur le
--    panier, puis FIGÉ sur la commande à sa création -- même patron que
--    orders.primary_campaign_id/team_id (copie figée depuis le panier,
--    jamais recalculée après coup). Attribution "dernier lien cliqué" par
--    COMMANDE entière (pas par ligne) -- cohérent avec la règle "une commande
--    = un seul point de livraison" (CLAUDE.md section 4) : une seule
--    attribution racine, pas une par bénéficiaire du panier.
-- -----------------------------------------------------------------------------

ALTER TABLE carts
  ADD COLUMN seller_qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN seller_qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL;

COMMENT ON COLUMN carts.seller_qr_code_id IS
  'Migration 0028 : code vendeur capté à la visite (lien /q/<code>), pour attribution -- voir orders.seller_qr_code_id pour la copie figée à la commande.';
COMMENT ON COLUMN orders.seller_qr_code_id IS
  'Migration 0028 : copie FIGÉE de carts.seller_qr_code_id au moment de la création de la commande (create_paid_order, migration 0006/0026 -- à mettre à jour dans l''implémentation complète pour écrire cette colonne). Devrait référencer un code dont le target_id correspond à primary_campaign_id ; non forcé par contrainte DB (cohérence cross-table laissée à l''application, même choix que saved_split_items pour la somme à 10000 -- voir migration 0013).';

CREATE INDEX orders_seller_qr_code_id_idx ON orders(seller_qr_code_id);

-- -----------------------------------------------------------------------------
-- 3. RÈGLES DE RÉCOMPENSE -- configurables, séparées de credit_rules (portée
--    différente : ceci ne calcule jamais un crédit au bénéficiaire, seulement
--    une récompense financée par la marge -- voir décision en tête de
--    fichier). Même forme générale que credit_rules (migration 0001) :
--    campaign_id NULL = règle par défaut plateforme (joker).
--
--    V1 volontairement NON MONÉTAIRE (décision autonome -- voir
--    docs/DECISIONS.md) : reward_type se limite à 'discount_code' (rabais
--    boutique, pas un versement en argent) et 'recognition' (reconnaissance
--    sans valeur monétaire, ex. badge/palmarès) -- pas de 'store_credit'/cash
--    tant que le mécanisme n'est pas validé. Ajouter une valeur au CHECK
--    plus tard n'exige qu'un ALTER TABLE ... DROP/ADD CONSTRAINT, pas une
--    refonte.
-- -----------------------------------------------------------------------------

CREATE TABLE reward_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  applies_to         TEXT NOT NULL CHECK (applies_to IN ('buyer', 'seller')),
  reward_type        TEXT NOT NULL CHECK (reward_type IN ('discount_code', 'recognition')),
  -- 'per_order' : déclenché par le total d'UNE commande (typiquement acheteur).
  -- 'cumulative' : déclenché par le total des ventes ramenées à date par ce
  -- vendeur pour cette campagne (typiquement vendeur -- paliers de palmarès).
  threshold_scope    TEXT NOT NULL DEFAULT 'per_order' CHECK (threshold_scope IN ('per_order', 'cumulative')),
  threshold_cents    INTEGER CHECK (threshold_cents >= 0),
  reward_value_cents INTEGER CHECK (reward_value_cents >= 0),
  reward_label       TEXT,
  priority           INTEGER NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_rule_discount_needs_value
    CHECK (reward_type <> 'discount_code' OR reward_value_cents IS NOT NULL),
  CONSTRAINT reward_rule_recognition_needs_label
    CHECK (reward_type <> 'recognition' OR reward_label IS NOT NULL)
);

COMMENT ON TABLE reward_rules IS
  'Migration 0028 : règles configurables de récompense acheteur/vendeur, financées par la marge -- ne touche JAMAIS order_credits. campaign_id NULL = règle par défaut plateforme.';

CREATE INDEX reward_rules_campaign_id_idx ON reward_rules(campaign_id);

ALTER TABLE reward_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reward_rules_scoped ON reward_rules;
CREATE POLICY reward_rules_scoped ON reward_rules FOR ALL
  USING (
    private.is_platform_admin()
    OR (campaign_id IS NOT NULL AND private.manages_campaign(campaign_id))
  )
  WITH CHECK (
    private.is_platform_admin()
    OR (campaign_id IS NOT NULL AND private.manages_campaign(campaign_id))
  );

COMMENT ON POLICY reward_rules_scoped ON reward_rules IS
  'Migration 0028 : même patron que campaign_products_scoped (migration 0005) -- une règle sans campagne (défaut plateforme, campaign_id NULL) n''est gérable que par platform_admin.';

-- -----------------------------------------------------------------------------
-- 4. OCTROIS DE RÉCOMPENSE -- ledger, même esprit que order_credits : le
--    solde/palmarès d'un vendeur ne se stocke JAMAIS en dur, il se calcule
--    depuis ces lignes (CLAUDE.md section 4, appliqué par analogie).
-- -----------------------------------------------------------------------------

CREATE TABLE reward_grants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  recipient_type       TEXT NOT NULL CHECK (recipient_type IN ('buyer', 'seller')),
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Seulement pour recipient_type='seller' : quel code vendeur a mérité ceci.
  recipient_qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
  -- Contact de secours si le destinataire n'a pas de compte (acheteur
  -- invité, vendeur sans compte -- voir qr_codes.seller_email).
  recipient_email      CITEXT,
  applied_rule_id      UUID REFERENCES reward_rules(id) ON DELETE SET NULL,
  -- Copie FIGÉE depuis reward_rules au moment de l'octroi (la règle peut
  -- changer après coup sans affecter les octrois déjà accordés -- même
  -- principe que order_credits.applied_rule_id / computation_note).
  reward_type          TEXT NOT NULL CHECK (reward_type IN ('discount_code', 'recognition')),
  value_cents          INTEGER CHECK (value_cents >= 0),
  label                TEXT,
  code                 TEXT,  -- code de rabais réellement émis (une fois généré)
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'redeemed', 'cancelled')),
  computation_note     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_grants_recipient_reachable
    CHECK (recipient_profile_id IS NOT NULL OR recipient_email IS NOT NULL),
  CONSTRAINT reward_grants_seller_has_code
    CHECK (recipient_type <> 'seller' OR recipient_qr_code_id IS NOT NULL)
);

COMMENT ON TABLE reward_grants IS
  'Migration 0028 : ligne = une récompense accordée pour une commande donnée. Source de vérité du palmarès/solde de récompenses -- jamais stocké en dur ailleurs, cf. order_credits (CLAUDE.md section 4).';

CREATE INDEX reward_grants_order_id_idx ON reward_grants(order_id);
CREATE INDEX reward_grants_recipient_profile_id_idx ON reward_grants(recipient_profile_id);
CREATE INDEX reward_grants_recipient_qr_code_id_idx ON reward_grants(recipient_qr_code_id);

-- Journal d'audit -- même patron que credit_audit_log (migration 0001),
-- exigé dès qu'un octroi change après coup (ex. annulation pour commande
-- remboursée).
CREATE TABLE reward_grant_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_grant_id UUID NOT NULL REFERENCES reward_grants(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL = système
  action          TEXT NOT NULL,  -- 'created'|'issued'|'redeemed'|'cancelled'|'adjusted'...
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reward_grant_audit_log_reward_grant_id_idx ON reward_grant_audit_log(reward_grant_id);

ALTER TABLE reward_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_grant_audit_log ENABLE ROW LEVEL SECURITY;

-- Lecture : le destinataire voit ses propres octrois ; un campaign manager
-- voit les octrois liés à sa campagne (acheteur via orders.primary_campaign_id,
-- vendeur via qr_codes.target_id) ; platform_admin/accounting voient tout.
-- ÉCRITURE : pas de policy INSERT/DELETE -- même règle d'or que order_credits
-- (migration 0003, commentaire section 14) : seul service_role (calcul
-- déclenché par le webhook Stripe confirmé, jamais manuellement) insère.
-- platform_admin peut corriger via UPDATE, toujours accompagné d'une ligne
-- reward_grant_audit_log (garanti en application, pas par RLS -- RLS ne peut
-- pas forcer une écriture corrélée dans une autre table).
DROP POLICY IF EXISTS reward_grants_select_scoped ON reward_grants;
CREATE POLICY reward_grants_select_scoped ON reward_grants FOR SELECT
  USING (
    private.is_platform_admin()
    OR private.current_user_role() = 'accounting'
    OR recipient_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = reward_grants.order_id
        AND o.primary_campaign_id IS NOT NULL
        AND private.manages_campaign(o.primary_campaign_id)
    )
    OR EXISTS (
      SELECT 1 FROM qr_codes q
      WHERE q.id = reward_grants.recipient_qr_code_id
        AND q.target_type = 'campaign'
        AND private.manages_campaign(q.target_id)
    )
  );

DROP POLICY IF EXISTS reward_grants_admin_update ON reward_grants;
CREATE POLICY reward_grants_admin_update ON reward_grants FOR UPDATE
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS reward_grant_audit_log_staff_read ON reward_grant_audit_log;
CREATE POLICY reward_grant_audit_log_staff_read ON reward_grant_audit_log FOR SELECT
  USING (private.is_platform_admin() OR private.current_user_role() = 'accounting');

-- =============================================================================
-- CE QUI RESTE À FAIRE (implémentation complète, hors schéma -- voir TODO.md) :
--   - create_paid_order (migrations 0006/0026) : accepter p_seller_qr_code_id,
--     écrire orders.seller_qr_code_id.
--   - lib/rewards/ : calcul pur (hiérarchie de règles reward_rules, comme
--     lib/credits/ le fait pour credit_rules), déclenché UNIQUEMENT par le
--     webhook Stripe confirmé (même règle d'or que le crédit -- CLAUDE.md
--     section 4), jamais à la soumission du formulaire de paiement.
--   - Capture de seller_qr_code_id sur le panier à la visite via /q/<code>.
--   - UI : génération d'un code vendeur personnel (portail compte/équipe),
--     palmarès vendeurs, affichage de la récompense acheteur post-achat.
--   - Tests unitaires (paliers, arrondi, cumulative vs per_order, commande à
--     0$, campagne inactive) + e2e (un vendeur partage son lien, un acheteur
--     achète, la récompense des deux est correctement calculée et journalisée)
--     -- CLAUDE.md section 8, obligatoire avant de considérer ceci "livré".
-- =============================================================================
