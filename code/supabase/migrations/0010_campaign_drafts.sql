-- =============================================================================
-- Migration 0010 — Tâche 1.6.B1 : brouillons de l'assistant de campagne.
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md, entrée « Tâche 1.6.B1 ») :
--
--   Le formulaire unique de la Tâche 1.7 devient un assistant en étapes
--   courtes (section 17/53 du cahier). Chaque étape doit s'enregistrer
--   automatiquement, sans action de l'utilisateur, et la reprise doit
--   fonctionner sur N'IMPORTE QUEL appareil — donc le brouillon ne peut PAS
--   vivre seulement côté navigateur (cookie/localStorage) : il doit être
--   persistant côté serveur, rattaché à `auth.uid()`.
--
--   Un brouillon n'est volontairement PAS une ligne `campaigns` avec
--   `status = 'draft'` (cette valeur de `campaign_status` reste réservée à un
--   usage back-office futur, voir Tâche 1.7) : les données saisies au fil des
--   étapes (ex. un nom de campagne seul, sans bénéficiaire ni packs) ne
--   satisferaient aucune des contraintes NOT NULL/CHECK de `campaigns` avant
--   la dernière étape. Une table à part, à schéma libre (JSONB), évite cette
--   tension et garantit par construction qu'aucun brouillon n'apparaît jamais
--   dans `v_public_campaign` (migration 0007, filtrée sur `status = 'active'`)
--   : tant que l'étape finale n'a pas réussi, AUCUNE ligne n'existe dans
--   `campaigns` — pas seulement une ligne masquée par un filtre de statut.
--
--   Un seul brouillon actif par gestionnaire (`user_id UNIQUE`) — le cahier
--   parle d'« un brouillon » au singulier et le critère d'acceptation ne
--   demande pas de gérer plusieurs campagnes en cours de création
--   simultanément (CLAUDE.md section 1 : ne pas anticiper). Démarrer une
--   nouvelle campagne alors qu'un brouillon existe déjà réutilise ce même
--   brouillon (ou le remplace via une action « Recommencer » explicite,
--   `lib/campaigns/draft.ts`) plutôt que d'en créer un second.
--
--   Propriétaire uniquement (même patron que `addresses_owner`/`carts_owner`,
--   migration 0005) : `private.is_platform_admin()` est ajouté par cohérence
--   avec ce patron (support technique éventuel), mais aucune UI admin ne lit
--   cette table pour l'instant — hors scope Tâche 1.6.B1.
-- =============================================================================

CREATE TABLE campaign_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  current_step TEXT NOT NULL DEFAULT 'type_nom',
  draft_data   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE campaign_drafts IS
  'Tâche 1.6.B1 : état de l''assistant de création de campagne, étape par '
  'étape, un brouillon par gestionnaire (user_id UNIQUE). JAMAIS promu en '
  'ligne `campaigns` avant la dernière étape — voir lib/campaigns/draft.ts. '
  'Supprimé dès la création réussie de la vraie campagne.';

ALTER TABLE campaign_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_drafts_owner ON campaign_drafts;
CREATE POLICY campaign_drafts_owner ON campaign_drafts FOR ALL
  USING (user_id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (user_id = auth.uid() OR private.is_platform_admin());

COMMENT ON POLICY campaign_drafts_owner ON campaign_drafts IS
  'Tâche 1.6.B1 : même patron que addresses_owner/carts_owner (migration '
  '0005) — un brouillon n''est lisible/modifiable que par son propriétaire '
  '(ou platform_admin). Aucune restriction de rôle ici (team_manager/'
  'club_admin) : la création réelle de campagne reste filtrée par '
  'lib/campaigns/create-campaign.ts#createCampaign (can()), donc un brouillon '
  'orphelin d''un rôle non autorisé échouera simplement à l''étape finale, '
  'sans risque de sécurité.';
