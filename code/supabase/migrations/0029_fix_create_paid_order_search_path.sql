-- =============================================================================
-- Migration 0029 — Correctif sécurité : restaure le search_path verrouillé de
-- create_paid_order.
-- =============================================================================
-- La migration 0026 a recréé create_paid_order via CREATE OR REPLACE en
-- supposant (à tort) que le `SET search_path = public, pg_temp` posé par la
-- migration 0006 survivait au remplacement. Ce n'est pas le cas : un
-- CREATE OR REPLACE FUNCTION qui n'inclut pas de clause SET réinitialise
-- proconfig à NULL, rendant le search_path « mutable » (advisor Supabase
-- `function_search_path_mutable`, catégorie SECURITY). On le repose ici
-- explicitement. Aucune modification du corps ni de la logique de la fonction
-- de paiement — uniquement le durcissement du search_path.
-- =============================================================================

ALTER FUNCTION public.create_paid_order(
  text, text, text, uuid, text, integer, integer, integer, integer,
  uuid, uuid, uuid, jsonb, jsonb, jsonb
) SET search_path = public, pg_temp;
