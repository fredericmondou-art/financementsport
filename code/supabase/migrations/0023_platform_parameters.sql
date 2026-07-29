-- =============================================================================
-- Migration 0023 — Paramètres de plateforme et limites de campagne (P.1).
-- Réponse à SPEC-PARAMETRES-PLATEFORME.md (fichier reçu hors dépôt, voir
-- docs/PLAN-PARAMETRES-PLATEFORME.md pour le plan complet et les décisions
-- détaillées). Objectif : centraliser les limites opérationnelles (durées,
-- plafonds, seuils) dans une table de configuration plutôt qu'en dur dans le
-- code (CLAUDE.md section 9 : "note-le dans docs/DECISIONS.md" pour les choix
-- autonomes ci-dessous).
--
-- Contenu de cette migration :
--   1. `parametres_plateforme` — table de configuration, seedée avec les 12
--      valeurs V1 (spec §3).
--   2. `derogations_parametres` — journal d'audit des dérogations admin
--      (aucune écriture encore possible en V1 : le mécanisme de dérogation
--      est P.7, une tâche future distincte — cette table n'existe ici que
--      pour que le schéma soit prêt à l'avance, conformément à la spec §2).
--
-- RLS : les deux tables suivent le patron déjà établi par `stripe_events`
-- (migration 0006) — `ENABLE ROW LEVEL SECURITY` SANS AUCUNE POLICY. Un
-- client `anon`/`authenticated` ne peut donc rien lire ni écrire ; seul
-- `service_role` (attribut BYPASSRLS) y accède, exactement ce que demande la
-- spec §2 ("lecture par le serveur uniquement ; aucune lecture client
-- directe"). C'est la forme la plus stricte de "aucune table exposée sans
-- policy" (CLAUDE.md section 5) : zéro policy = zéro exposition.
--
-- Décision autonome (voir docs/DECISIONS.md) : `derogations_parametres` n'a
-- pas encore de policy `SELECT` pour `platform_admin` — aucun écran admin ne
-- lit cette table pour l'instant (spec §7, hors périmètre V1). Une policy
-- additive sera ajoutée en migration séparée au moment de P.7, quand une
-- vraie fonctionnalité l'exercera (même pratique que la migration 0016 pour
-- le dashboard équipe).
--
-- Note technique : les colonnes `description` ci-dessous utilisent le
-- dollar-quoting Postgres (`$desc$...$desc$`) plutôt que des apostrophes
-- classiques, pour éviter tout risque d'échappement manqué sur un texte
-- français plein d'apostrophes (d'une, l'intervalle, etc.).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. parametres_plateforme
-- -----------------------------------------------------------------------------

CREATE TABLE parametres_plateforme (
  cle          TEXT PRIMARY KEY,
  valeur       JSONB NOT NULL,
  type_limite  TEXT NOT NULL CHECK (type_limite IN ('souple', 'dure')),
  description  TEXT NOT NULL,
  modifie_le   TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_par  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE parametres_plateforme ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. derogations_parametres (audit des dérogations admin — écriture P.7)
--
-- Décision autonome (voir docs/DECISIONS.md) : `admin_id` est NULLABLE avec
-- `ON DELETE SET NULL`, même patron que `credit_audit_log.actor_id`
-- (migration 0001 : "NULL = système"). La spec ne précise pas la nullabilité ;
-- `ON DELETE SET NULL` exige une colonne nullable, et on ne veut jamais que
-- la suppression d'un compte admin soit bloquée par une ligne d'audit
-- historique (`ON DELETE RESTRICT` aurait eu cet effet avec `NOT NULL`).
-- -----------------------------------------------------------------------------

CREATE TABLE derogations_parametres (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle_parametre     TEXT NOT NULL REFERENCES parametres_plateforme(cle),
  entite_type       TEXT NOT NULL CHECK (entite_type IN ('campagne', 'equipe', 'athlete')),
  entite_id         UUID NOT NULL,
  valeur_appliquee  JSONB NOT NULL,
  justification     TEXT NOT NULL,
  admin_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE derogations_parametres ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_derogations_parametres_cle    ON derogations_parametres(cle_parametre);
CREATE INDEX idx_derogations_parametres_entite ON derogations_parametres(entite_type, entite_id);
CREATE INDEX idx_derogations_parametres_admin  ON derogations_parametres(admin_id);

-- -----------------------------------------------------------------------------
-- 3. Seed des 12 valeurs V1 (spec §3), en CENTIMES là où l'unité est monétaire
-- (CLAUDE.md section 4 : jamais de float pour de l'argent — les montants ici
-- sont stockés dans le JSONB en CENTIMES même si la spec les présente en $
-- pour la lecture humaine).
--
-- Décision autonome (voir docs/DECISIONS.md) : `campagne_duree_jours` est
-- listée dans la spec comme "DURE (max), SOUPLE (défaut)" — un type composite
-- qu'une seule colonne `type_limite` ne peut pas représenter. R1 (spec §4)
-- précise que le serveur rejette hors de TOUT l'intervalle [min, max], donc
-- la règle est bien bloquante dans son ensemble ; "defaut" ne sert qu'au
-- pré-remplissage de l'interface (une nuance UX, pas un second palier de
-- validation). On seed donc type_limite = 'dure' pour cette clé.
-- -----------------------------------------------------------------------------

INSERT INTO parametres_plateforme (cle, valeur, type_limite, description) VALUES
  ('campagne_duree_jours',
   '{"min": 7, "max": 21, "defaut": 14}',
   'dure',
   $desc$Durée d'une campagne, en jours (R1). Bloquant sur tout l'intervalle [min, max] ; "defaut" sert seulement au pré-remplissage de l'assistant.$desc$),

  ('campagne_delai_livraison_jours_max',
   '21',
   'dure',
   $desc$Délai maximum, en jours, entre la clôture d'une campagne et la date de livraison annoncée (R2).$desc$),

  ('campagne_date_livraison_obligatoire',
   'true',
   'dure',
   $desc$Une date de livraison doit être saisie et affichée publiquement (R2, obligation légale de contrat à distance).$desc$),

  ('campagne_athletes_max',
   '30',
   'dure',
   $desc$Nombre maximum d'athlètes par campagne d'équipe (R3).$desc$),

  ('campagne_commandes_max',
   '250',
   'dure',
   $desc$Nombre maximum de commandes payées par campagne avant bascule en état "complète" (R4). Valeur provisoire, à revalider après le pilote (spec §8).$desc$),

  ('campagne_produits_max',
   '6',
   'dure',
   $desc$Nombre maximum de produits/packs distincts par campagne (R5).$desc$),

  ('campagne_produits_recommande',
   '4',
   'souple',
   $desc$Nombre recommandé de produits par campagne ; avertissement (non bloquant) au-delà (R5).$desc$),

  ('campagne_objectif_athlete_suggere',
   '{"min": 10000, "max": 25000, "defaut": 15000}',
   'souple',
   $desc$Objectif suggéré par athlète, en CENTIMES CAD (R6). Pré-remplit le champ, ne bloque jamais.$desc$),

  ('campagne_objectif_athlete_avertissement',
   '40000',
   'souple',
   $desc$Seuil, en CENTIMES CAD, au-delà duquel un avertissement "objectif ambitieux" (non bloquant) est affiché (R6).$desc$),

  ('equipe_campagnes_par_an_max',
   '3',
   'dure',
   $desc$Nombre maximum de campagnes par équipe, par année glissante de 12 mois (R7).$desc$),

  ('athlete_credit_annuel_max',
   '200000',
   'dure',
   $desc$Plafond de crédit par athlète, par année civile, en CENTIMES CAD (R8). Soupape en attente de validation juridique (spec §3/§8) — ne pas relever sans décision explicite.$desc$),

  ('panier_multi_beneficiaires_max',
   '4',
   'dure',
   $desc$Nombre maximum de bénéficiaires par commande (R9).$desc$);
