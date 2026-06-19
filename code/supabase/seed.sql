-- =============================================================================
-- SEED — Données de démonstration / développement
-- Tâche 0.2 : club, équipe, athlètes, packs, taxes QC, campagne active.
-- Tous les montants sont en CENTIMES (integer), conformément à la règle d'or
-- du projet (jamais de float pour de l'argent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profils "guardian" (parents) — nécessitent un stub auth.users en local.
-- En Supabase réel, ces lignes seraient créées par Supabase Auth puis un
-- trigger/route applicatif insérerait la ligne profiles correspondante.
-- -----------------------------------------------------------------------------

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-1111-1111-111111111101'),
  ('11111111-1111-1111-1111-111111111102'),
  ('11111111-1111-1111-1111-111111111103');

INSERT INTO profiles (id, email, full_name, role, consent_email, consent_sms) VALUES
  ('11111111-1111-1111-1111-111111111101', 'parent1.corsaires@example.com', 'Parent Un Tremblay', 'client', TRUE, FALSE),
  ('11111111-1111-1111-1111-111111111102', 'parent2.corsaires@example.com', 'Parent Deux Gagnon',  'client', TRUE, FALSE),
  ('11111111-1111-1111-1111-111111111103', 'parent3.corsaires@example.com', 'Parent Trois Roy',    'client', TRUE, FALSE);

-- -----------------------------------------------------------------------------
-- Club
-- -----------------------------------------------------------------------------

INSERT INTO clubs (id, name, slug, description, city, province, is_active, approved_at) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Corsaires', 'corsaires',
   'Club de hockey mineur Les Corsaires.', 'Lévis', 'QC', TRUE, now());

-- -----------------------------------------------------------------------------
-- Équipe
-- -----------------------------------------------------------------------------

INSERT INTO teams (id, club_id, name, slug, sport, category, city, province, is_active) VALUES
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201',
   'U11 Hockey', 'u11-hockey', 'hockey', 'U11', 'Lévis', 'QC', TRUE);

-- -----------------------------------------------------------------------------
-- Athlètes (3, rattachés à l'équipe U11 Hockey, tous mineurs avec tuteur).
-- Exactement 1 athlète a hide_last_name = TRUE (confidentialité, section 5/48).
-- -----------------------------------------------------------------------------

INSERT INTO athletes (
  id, team_id, guardian_id, first_name, last_name, slug, sport, city,
  is_minor, hide_last_name, hide_photo, hide_city, hide_amounts, show_team_only,
  parental_consent_at, is_active
) VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301',
   '11111111-1111-1111-1111-111111111101', 'Thomas', 'Tremblay', 'thomas-u11',
   'hockey', 'Lévis', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, now(), TRUE),

  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301',
   '11111111-1111-1111-1111-111111111102', 'Emma', 'Gagnon', 'emma-u11',
   'hockey', 'Lévis', TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, now(), TRUE),

  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333301',
   '11111111-1111-1111-1111-111111111103', 'Olivier', 'Roy', 'olivier-u11',
   'hockey', 'Lévis', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, now(), TRUE);

-- -----------------------------------------------------------------------------
-- Packs (kind = 'pack'), avec crédit FIXE (fixed_credit_cents).
-- -----------------------------------------------------------------------------

INSERT INTO products (
  id, kind, name, slug, description, price_cents, fixed_credit_cents,
  is_taxable, stock_quantity, is_active
) VALUES
  ('55555555-5555-5555-5555-555555555501', 'pack', 'Pack Maison', 'pack-maison',
   'Pack de base pour soutenir un athlète, une équipe ou un club.',
   3500, 500, TRUE, 1000, TRUE),

  ('55555555-5555-5555-5555-555555555502', 'pack', 'Pack Famille', 'pack-famille',
   'Pack familial avec un crédit de financement plus élevé.',
   6000, 900, TRUE, 1000, TRUE),

  ('55555555-5555-5555-5555-555555555503', 'pack', 'Pack Saison', 'pack-saison',
   'Pack saison complète, crédit de financement maximal.',
   12000, 1800, TRUE, 1000, TRUE),

  ('55555555-5555-5555-5555-555555555504', 'pack', 'Pack Sport Propre', 'pack-sport-propre',
   'Pack thématique sport propre.',
   4500, 600, TRUE, 1000, TRUE);

-- -----------------------------------------------------------------------------
-- Taux de taxe QC : TPS (fédéral) + TVQ (provincial).
-- La table tax_rates stocke UN taux COMBINÉ par (province, effective_at)
-- (contrainte UNIQUE (province, effective_at) du schéma) ; le détail réel des
-- deux composantes est donc consigné dans le `label`, explicite, plutôt que
-- dans des lignes séparées.
--   TPS (fédéral)     : 5%
--   TVQ (Québec)      : 9.975%
--   Combiné           : 5% + 9.975% = 14.975% -> 1498 points de base (bps)
--                        (1 bps = 0.01% ; 14.975% = 1497.5 bps, arrondi au bps
--                        le plus proche = 1498)
-- -----------------------------------------------------------------------------

INSERT INTO tax_rates (province, rate_bps, label, effective_at) VALUES
  ('QC', 1498, 'TPS 5% + TVQ 9.975% (taux combiné Québec)', '2026-01-01T00:00:00Z');

-- -----------------------------------------------------------------------------
-- Campagne active de type 'team', bénéficiaire = équipe U11 Hockey.
-- Objectif : 500000 cents = 5000 $. Dates : débutée récemment, se termine dans
-- le futur.
-- -----------------------------------------------------------------------------

INSERT INTO campaigns (
  id, type, status, name, slug, public_message,
  beneficiary_type, beneficiary_id, club_id, team_id,
  goal_cents, starts_at, ends_at, approved_at
) VALUES (
  '66666666-6666-6666-6666-666666666601', 'team', 'active',
  'Campagne U11 Hockey 2026', 'campagne-u11-hockey-2026',
  'Aidez l''équipe U11 Hockey des Corsaires à financer sa saison !',
  'team', '33333333-3333-3333-3333-333333333301',
  '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
  500000, '2026-06-01T00:00:00Z', '2026-12-31T23:59:59Z', '2026-06-01T00:00:00Z'
);
