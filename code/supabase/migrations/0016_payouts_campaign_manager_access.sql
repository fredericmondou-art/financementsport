-- ============================================================================
-- Migration 0016 : accès lecture des versements pour les responsables
-- (Tâche 1.5.6 -- Dashboard équipe)
-- ============================================================================
-- Contexte (voir docs/DECISIONS.md, Tâche 1.5.6) : le dashboard équipe doit
-- afficher un « statut de versement » (cahier, docs/prompts/phase-1-5.md,
-- Tâche 1.5.6 -- "statut de versement" fait partie des éléments demandés).
-- En relisant les policies existantes sur `payouts` (migration 0005),
-- `payouts_staff_read` n'autorise QUE `private.is_platform_admin()` OU
-- `private.current_user_role() = 'accounting'` -- un `team_manager`/
-- `club_admin` ne pouvait donc PAS lire les versements de sa propre équipe ou
-- de ses propres athlètes, contrairement à `order_credits`/`campaigns`/
-- `athletes`/`teams`, qui accordent déjà cet accès via
-- `private.manages_beneficiary`/`private.manages_team`/`private.manages_athlete`
-- /`private.manages_campaign` (toutes vérifiées avant d'écrire cette
-- migration -- AUCUNE de ces quatre tables n'a besoin d'une nouvelle policy
-- pour cette tâche, seule `payouts` avait un trou).
--
-- Décision autonome (voir docs/DECISIONS.md, Tâche 1.5.6) : combler cet écart
-- avec une policy SUPPLÉMENTAIRE (Postgres combine plusieurs policies
-- permissives FOR SELECT avec OR -- même patron que la migration 0014), en
-- réutilisant `private.manages_beneficiary(beneficiary_type, beneficiary_id)`
-- (migration 0005), qui dispatch déjà correctement vers
-- `manages_team`/`manages_club`/`manages_athlete` selon le type de
-- bénéficiaire du versement. Portée volontairement étroite : SELECT
-- uniquement, et seulement les lignes dont le bénéficiaire (l'équipe
-- elle-même, OU un de ses athlètes) est géré par l'utilisateur courant --
-- jamais un accès général à `payouts`. `payouts_staff_read` n'est pas
-- modifiée (changement isolé, sans risque de régression -- CLAUDE.md
-- section 6).
-- ============================================================================

DROP POLICY IF EXISTS payouts_select_campaign_managers ON payouts;
CREATE POLICY payouts_select_campaign_managers ON payouts FOR SELECT
  USING (private.manages_beneficiary(beneficiary_type, beneficiary_id));
