-- =============================================================================
-- Migration 0013 — Tâche 1.5.3 : répartitions favorites (saved splits).
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, entrée « Tâche 1.5.3 ») :
--
--   Un parent avec plusieurs enfants répète souvent la même répartition
--   (ex. 50/50 entre Thomas et Emma) à chaque commande. Plutôt que de la
--   ressaisir, un client CONNECTÉ peut l'enregistrer sous un nom et la
--   réappliquer plus tard à un panier différent.
--
--   Réservé aux clients connectés (`auth.uid()`) -- contrairement au panier
--   lui-même (Tâche 1.4), qui supporte aussi les invités via
--   `carts.session_token` : une répartition favorite n'a de sens que
--   rattachée à un compte qui survit entre deux visites. Pas de colonne
--   `session_token` ici, volontairement (CLAUDE.md section 1 : ne pas
--   anticiper un besoin non demandé par le cahier).
--
--   Une répartition sauvegardée mémorise les BÉNÉFICIAIRES et leurs parts
--   (`share_bps`), jamais le panier d'origine ni son contenu (articles) --
--   c'est une recette de répartition réutilisable, pas un panier dupliqué.
--
--   `saved_split_items` est une table séparée (plutôt qu'un JSONB sur
--   `saved_splits`) pour rester cohérente avec `cart_beneficiaries` (même
--   forme de colonnes, migration 0001). La somme à 10000 n'est PAS imposée
--   par une contrainte DB : elle est validée en TypeScript au moment de
--   l'enregistrement (`assertSplitTotals10000`, réutilisée de
--   lib/cart/beneficiaries.ts, jamais dupliquée -- voir
--   lib/cart/saved-splits.ts). Un bénéficiaire référencé peut aussi devenir
--   inactif (`is_active = false`) APRÈS l'enregistrement de la répartition ;
--   ce n'est volontairement pas bloqué ici non plus -- la détection se fait
--   à l'application (voir lib/cart/saved-splits.ts), pour avertir le client
--   et le laisser corriger, plutôt que de supprimer silencieusement une
--   répartition enregistrée.
--
--   Nom unique par utilisateur (`UNIQUE(user_id, name)`) : évite la
--   confusion de deux répartitions au même nom pour la même personne ; un
--   autre client peut réutiliser le même nom sans collision.
-- =============================================================================

CREATE TABLE saved_splits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

COMMENT ON TABLE saved_splits IS
  'Tâche 1.5.3 : répartition entre bénéficiaires nommée, enregistrée par un '
  'client connecté pour réapplication rapide à un panier ultérieur. Ne '
  'mémorise jamais le contenu du panier, seulement les bénéficiaires et '
  'leurs parts -- voir lib/cart/saved-splits.ts.';

CREATE TABLE saved_split_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_split_id   UUID NOT NULL REFERENCES saved_splits(id) ON DELETE CASCADE,
  beneficiary_type beneficiary_type NOT NULL,
  beneficiary_id   UUID NOT NULL,
  campaign_id      UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  share_bps        INTEGER NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000)
);

COMMENT ON TABLE saved_split_items IS
  'Tâche 1.5.3 : une ligne par bénéficiaire d''une répartition favorite -- '
  'même forme que cart_beneficiaries (migration 0001), polymorphe '
  '(beneficiary_type, beneficiary_id). La somme des share_bps d''une même '
  'saved_split_id DOIT totaliser 10000 ; validé en TypeScript à '
  'l''enregistrement (assertSplitTotals10000), pas par contrainte DB -- voir '
  'lib/cart/saved-splits.ts.';

CREATE INDEX saved_split_items_saved_split_id_idx ON saved_split_items (saved_split_id);

ALTER TABLE saved_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_split_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_splits_owner ON saved_splits;
CREATE POLICY saved_splits_owner ON saved_splits FOR ALL
  USING (user_id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR private.is_platform_admin());

COMMENT ON POLICY saved_splits_owner ON saved_splits IS
  'Tâche 1.5.3 : même patron que campaign_drafts_owner/addresses_owner '
  '(migrations 0010/0005) -- une répartition favorite n''est lisible/'
  'modifiable que par son propriétaire (ou platform_admin, support '
  'technique).';

-- `saved_split_items` n'a pas de `user_id` propre : la policy rejoint
-- `saved_splits` pour retrouver le propriétaire -- contrairement à
-- `cart_items`/`cart_beneficiaries` vis-à-vis de `carts`, qui n'ont AUCUNE
-- RLS (Tâche 1.4 : un panier supporte les invités, donc le contrôle d'accès
-- y est applicatif, pas RLS -- voir lib/cart/cart.ts). Ici, saved_splits
-- est réservé aux comptes connectés, donc RLS est directement utilisable.
DROP POLICY IF EXISTS saved_split_items_owner ON saved_split_items;
CREATE POLICY saved_split_items_owner ON saved_split_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM saved_splits s
      WHERE s.id = saved_split_items.saved_split_id
        AND (s.user_id = auth.uid() OR private.is_platform_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_splits s
      WHERE s.id = saved_split_items.saved_split_id
        AND (s.user_id = auth.uid() OR private.is_platform_admin())
    )
  );

COMMENT ON POLICY saved_split_items_owner ON saved_split_items IS
  'Tâche 1.5.3 : saved_split_items n''a pas de user_id propre -- la policy '
  'rejoint saved_splits pour retrouver le propriétaire réel.';
