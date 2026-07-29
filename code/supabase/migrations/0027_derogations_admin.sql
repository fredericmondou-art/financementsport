-- ============================================================================
-- Migration 0027 — P.7 (SPEC-PARAMETRES-PLATEFORME.md, mécanisme de
-- dérogation admin) : ouvre `derogations_parametres` à l'écriture/lecture par
-- `platform_admin`, et corrige une lacune du CHECK `entite_type` découverte
-- en concevant P.7 (voir docs/DECISIONS.md, P.7).
-- ============================================================================
--
-- 1. `entite_type` admettait seulement 'campagne' | 'equipe' | 'athlete'
--    (migration 0023). Or R1/R3/R5 (durée, athlètes, produits) sont validées
--    à la CRÉATION d'une campagne (lib/campaigns/create-campaign.ts,
--    `assertPlatformParameterRules`), donc AVANT qu'un id de campagne
--    n'existe -- une dérogation pour ces règles doit cibler l'ÉQUIPE ou le
--    CLUB porteur de la future campagne, pas la campagne elle-même. 'equipe'
--    existait déjà, mais 'club' manquait -- alors même que R1 illustre
--    explicitement son propre exemple avec un club (spec §4 : « ex. campagne
--    club annuelle »). Sans ce correctif, une équipe géniale sans club (ou un
--    club sans équipe, cas également possible dans ce schéma) ne pourrait
--    jamais recevoir de dérogation. Décision autonome, voir docs/DECISIONS.md.
--
-- 2. Policies : `derogations_parametres` restait sans AUCUNE policy depuis la
--    migration 0023 (zéro policy = zéro exposition, en attente de P.7 -- voir
--    le commentaire d'origine de cette table). P.7 est la fonctionnalité qui
--    exerce enfin cette table : `platform_admin` peut désormais lire (pour un
--    écran de consultation minimal) et écrire (pour poser une dérogation) --
--    exactement le patron additif déjà utilisé en migration 0016. Aucune
--    policy UPDATE/DELETE : `derogations_parametres` est un journal d'audit
--    APPEND-ONLY (une correction se fait en ajoutant une nouvelle ligne, pas
--    en modifiant l'historique -- voir lib/derogations/derogations.ts, «
--    dérogation active = ligne la plus récente pour cette portée »).
-- ============================================================================

ALTER TABLE derogations_parametres DROP CONSTRAINT derogations_parametres_entite_type_check;
ALTER TABLE derogations_parametres
  ADD CONSTRAINT derogations_parametres_entite_type_check
  CHECK (entite_type IN ('campagne', 'equipe', 'club', 'athlete'));

-- `is_platform_admin()` vit dans le schéma `private` depuis la migration
-- 0022 (« optimize_rls_and_harden_grants » -- durcissement des fonctions RLS
-- SECURITY DEFINER, déplacées hors de `public` pour ne plus être exposées à
-- l'API REST). `public.is_platform_admin()` (nom d'origine, migration 0003)
-- n'existe donc plus au moment où cette migration s'exécute -- piège détecté
-- par le test d'intégration (`platform-parameters-rls.test.ts`), qui rejoue
-- réellement toutes les migrations plutôt que de les relire visuellement.
DROP POLICY IF EXISTS derogations_parametres_select_admin ON derogations_parametres;
CREATE POLICY derogations_parametres_select_admin ON derogations_parametres FOR SELECT
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS derogations_parametres_insert_admin ON derogations_parametres;
CREATE POLICY derogations_parametres_insert_admin ON derogations_parametres FOR INSERT
  WITH CHECK (private.is_platform_admin());
