-- =============================================================================
-- Migration 0006 — Tâche 1.5 : idempotence webhook Stripe + écriture
-- atomique commande/lignes/crédits.
-- =============================================================================
-- Contexte (voir docs/DECISIONS.md) :
--   - Le schéma fourni (01-schema-base-de-donnees.sql) ne contient aucune table
--     de suivi des évènements Stripe déjà traités. CLAUDE.md section 4 exige
--     « Idempotence des webhooks : un même évènement Stripe reçu deux fois ne
--     doit créer qu'un seul crédit. Utilise l'id d'évènement Stripe comme
--     clé. » -- on ajoute donc `stripe_events` (clé = id d'évènement Stripe),
--     conformément au principe « ajoute, ne modifie pas en silence le schéma
--     fourni » de CLAUDE.md section 9.
--   - CLAUDE.md section 4 exige aussi que le calcul de crédit et la création
--     de commande soient ATOMIQUES (une seule transaction, rollback complet si
--     une étape échoue). supabase-js (PostgREST) ne permet pas de transaction
--     multi-instructions côté client : l'unique mécanisme d'atomicité
--     disponible est une fonction Postgres unique, appelée via supabase.rpc().
--     Une fonction = un bloc transactionnel implicite : toute exception non
--     interceptée provoque un ROLLBACK complet de tout ce que la fonction a
--     écrit. D'où `create_paid_order` ci-dessous.
--   - Toute la LOGIQUE MÉTIER testable (calcul de crédit, statut actif/pending,
--     taxes, numéro de commande lisible mis à part) reste en TypeScript dans
--     lib/ (CLAUDE.md section 6 + section 8 : la logique doit être testable en
--     Vitest, ce qu'une fonction plpgsql ne permet pas). Cette fonction SQL
--     n'est qu'une primitive d'écriture mécanique : elle reçoit des valeurs
--     DÉJÀ calculées (montants, statut de crédit par bénéficiaire, etc.) et se
--     limite à : vérifier l'idempotence, insérer commande + lignes + crédits +
--     journal d'audit, décrémenter le stock -- tout dans une seule transaction.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table d'idempotence des évènements Stripe.
-- RLS activée, AUCUNE policy : accès exclusivement réservé à service_role
-- (BYPASSRLS), même convention que orders/order_credits/credit_audit_log dans
-- la migration 0003 (cf. commentaire en tête de ce fichier-là).
-- -----------------------------------------------------------------------------

CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,        -- id d'évènement Stripe (evt_...), clé d'idempotence
  type        TEXT NOT NULL,           -- ex: 'checkout.session.completed'
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  payload     JSONB,                   -- évènement brut, pour audit/litige (jamais de secret dedans)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_stripe_events_order ON stripe_events(order_id);

-- -----------------------------------------------------------------------------
-- 2. Séquence pour le numéro de commande lisible (ex: CMD-2026-000123).
-- Une séquence Postgres est intrinsèquement atomique (pas de collision même
-- en cas d'appels concurrents) -- contrairement à un calcul fait côté
-- TypeScript, qui devrait relire puis écrire (fenêtre de course).
-- -----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;

-- -----------------------------------------------------------------------------
-- 3. Fonction d'écriture atomique commande + lignes + crédits.
--
-- Idempotence : la clé d'idempotence est l'id d'évènement Stripe. On l'insère
-- en PREMIER dans stripe_events avec ON CONFLICT DO NOTHING -- si une autre
-- transaction a déjà gagné (évènement rejoué, ou deux livraisons concurrentes
-- du même évènement par Stripe), RETURNING ne renvoie aucune ligne et on sait
-- immédiatement, sans fenêtre de course, qu'il ne faut RIEN recréer : on
-- retourne simplement la commande déjà créée par le premier appel.
--
-- Gestion du stock épuisé (CLAUDE.md section 7, « cas limites ») : le
-- paiement a déjà été encaissé par Stripe au moment où ce webhook s'exécute
-- -- on ne doit donc JAMAIS faire échouer (rollback) la création de la
-- commande pour une question de stock, ce qui laisserait le client payé sans
-- commande. Le stock est décrémenté avec un plancher à 0 (jamais négatif) et,
-- si la quantité demandée dépassait le stock disponible, une note interne est
-- posée sur la commande pour qu'un admin la traite manuellement (réappro,
-- contact client, remboursement partiel...). Verrouillage `FOR UPDATE` sur la
-- ligne produit pour éviter qu'une vraie vente concurrente (deux commandes
-- différentes payées en même temps) ne décrémente le stock de façon
-- incohérente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_paid_order(
  p_stripe_event_id text,
  p_stripe_event_type text,
  p_stripe_payment_intent_id text,
  p_user_id uuid,
  p_guest_email text,
  p_subtotal_cents integer,
  p_tax_cents integer,
  p_shipping_cents integer,
  p_total_cents integer,
  p_shipping_address_id uuid,
  p_primary_campaign_id uuid,
  p_team_id uuid,
  p_items jsonb,
  p_credits jsonb,
  p_event_payload jsonb DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted_event_id text;
  v_order public.orders;
  v_credit_total_cents integer := 0;
  v_order_number text;
  v_item jsonb;
  v_credit jsonb;
  v_order_credit_id uuid;
  v_product_id uuid;
  v_qty integer;
  v_prior_stock integer;
  v_any_oversold boolean := false;
BEGIN
  INSERT INTO public.stripe_events (id, type, payload)
  VALUES (p_stripe_event_id, p_stripe_event_type, p_event_payload)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_event_id;

  IF v_inserted_event_id IS NULL THEN
    -- Évènement déjà traité : on retourne la commande existante sans rien
    -- recréer (idempotence exigée par CLAUDE.md section 4).
    SELECT * INTO v_order FROM public.orders
      WHERE stripe_payment_intent_id = p_stripe_payment_intent_id
      ORDER BY created_at DESC
      LIMIT 1;
    RETURN v_order;
  END IF;

  IF p_credits IS NOT NULL AND jsonb_array_length(p_credits) > 0 THEN
    SELECT COALESCE(SUM((c->>'amount_cents')::integer), 0) INTO v_credit_total_cents
    FROM jsonb_array_elements(p_credits) c;
  END IF;

  v_order_number := 'CMD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');

  INSERT INTO public.orders (
    order_number, user_id, guest_email, status,
    subtotal_cents, tax_cents, shipping_cents, total_cents, credit_total_cents,
    shipping_address_id, primary_campaign_id, team_id,
    stripe_payment_intent_id, paid_at
  ) VALUES (
    v_order_number, p_user_id, p_guest_email, 'paid',
    p_subtotal_cents, p_tax_cents, p_shipping_cents, p_total_cents, v_credit_total_cents,
    p_shipping_address_id, p_primary_campaign_id, p_team_id,
    p_stripe_payment_intent_id, now()
  ) RETURNING * INTO v_order;

  UPDATE public.stripe_events SET order_id = v_order.id WHERE id = p_stripe_event_id;

  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty := (v_item->>'quantity')::integer;

      INSERT INTO public.order_items (
        order_id, product_id, product_name, quantity, unit_price_cents, line_total_cents
      ) VALUES (
        v_order.id, v_product_id, v_item->>'product_name', v_qty,
        (v_item->>'unit_price_cents')::integer, (v_item->>'line_total_cents')::integer
      );

      SELECT stock_quantity INTO v_prior_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
      IF v_prior_stock IS NOT NULL THEN
        IF v_prior_stock < v_qty THEN
          v_any_oversold := true;
        END IF;
        UPDATE public.products
          SET stock_quantity = GREATEST(v_prior_stock - v_qty, 0), updated_at = now()
          WHERE id = v_product_id;
      END IF;
    END LOOP;
  END IF;

  IF p_credits IS NOT NULL THEN
    FOR v_credit IN SELECT * FROM jsonb_array_elements(p_credits) LOOP
      INSERT INTO public.order_credits (
        order_id, beneficiary_type, beneficiary_id, campaign_id, amount_cents,
        status, applied_rule_id, computation_note
      ) VALUES (
        v_order.id,
        (v_credit->>'beneficiary_type')::beneficiary_type,
        (v_credit->>'beneficiary_id')::uuid,
        NULLIF(v_credit->>'campaign_id', '')::uuid,
        (v_credit->>'amount_cents')::integer,
        (v_credit->>'status')::credit_status,
        NULLIF(v_credit->>'applied_rule_id', '')::uuid,
        v_credit->>'computation_note'
      ) RETURNING id INTO v_order_credit_id;

      INSERT INTO public.credit_audit_log (order_credit_id, actor_id, action, old_value, new_value)
      VALUES (
        v_order_credit_id, NULL, 'created', NULL,
        jsonb_build_object('amount_cents', (v_credit->>'amount_cents')::integer, 'status', v_credit->>'status')
      );
    END LOOP;
  END IF;

  IF v_any_oversold THEN
    UPDATE public.orders
      SET notes_internal = 'Stock insuffisant détecté à la confirmation du paiement pour au moins un produit (vente déjà conclue) — vérifier le réapprovisionnement.'
      WHERE id = v_order.id
      RETURNING * INTO v_order;
  END IF;

  RETURN v_order;
END;
$$;

-- Durcissement immédiat (leçon de la migration 0004/0005, voir docs/DECISIONS.md) :
-- Supabase accorde EXECUTE à anon ET authenticated par défaut sur toute
-- fonction créée dans le schéma public. Cette fonction n'est JAMAIS appelée
-- depuis une policy RLS (contrairement aux fonctions d'aide de 0003/0005) --
-- elle n'est invoquée que par le serveur via le client service_role (webhook
-- Stripe). On peut donc révoquer sans risque de casser RLS pour anon.
REVOKE ALL ON FUNCTION public.create_paid_order(
  text, text, text, uuid, text, integer, integer, integer, integer, uuid, uuid, uuid, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_paid_order(
  text, text, text, uuid, text, integer, integer, integer, integer, uuid, uuid, uuid, jsonb, jsonb, jsonb
) TO service_role;

REVOKE ALL ON SEQUENCE order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE order_number_seq TO service_role;

-- Durcissement (advisor sécurité function_search_path_mutable, même classe de
-- bug que les fonctions d'aide RLS) : fixe le search_path pour empêcher un
-- attaquant ayant créé un objet de même nom dans un autre schéma de détourner
-- la résolution de noms lors de l'exécution (service_role uniquement, mais on
-- applique le même standard que le reste du projet).
ALTER FUNCTION public.create_paid_order(
  text, text, text, uuid, text, integer, integer, integer, integer, uuid, uuid, uuid, jsonb, jsonb, jsonb
) SET search_path = public, pg_temp;
