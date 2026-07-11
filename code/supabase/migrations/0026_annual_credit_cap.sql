-- P.5 (SPEC-PARAMETRES-PLATEFORME.md, R8) : plafond annuel de crédit par
-- athlète (`parametres_plateforme.athlete_credit_annuel_max`). Spec R8 :
-- « dans le moteur de crédits, si credits_annee_civile + credit_calcule >
-- athlete_credit_annuel_max, attribuer la portion sous plafond normalement
-- et basculer l'excédent en credit_en_attente avec motif plafond_annuel ».
--
-- `order_credits.status` (credit_status : pending/active/expired/cancelled/
-- refunded) sait déjà distinguer « en attente », mais ne dit jamais POURQUOI
-- une ligne est en attente -- jusqu'ici la seule raison possible était
-- « campagne pas encore active » (lib/credits/persist.ts#decideCreditStatus).
-- R8 introduit une DEUXIÈME raison (plafond annuel atteint), qu'il faut
-- pouvoir distinguer explicitement :
--   1. Pour ne jamais re-appliquer R8 à un crédit déjà en attente pour
--      l'autre raison (lib/credits/annual-cap.ts ne touche que les lignes
--      `status = 'active'`, jamais un `'pending'` préexistant).
--   2. Pour calculer `credits_annee_civile` correctement : seuls les
--      crédits déjà RÉELLEMENT attribués (actifs, ou en attente seulement
--      parce que la campagne n'est pas encore active) comptent dans le
--      total de l'année -- un excédent déjà mis en attente pour plafond
--      annuel n'a PAS été « attribué » (spec : « attribuer la portion sous
--      plafond ») et ne doit donc jamais s'auto-additionner dans un calcul
--      futur.
CREATE TYPE credit_pending_reason AS ENUM ('campagne_inactive', 'plafond_annuel');

ALTER TABLE order_credits ADD COLUMN pending_reason credit_pending_reason;

-- Défense en profondeur : un motif n'a de sens que pour un crédit en
-- attente. N'exige PAS `pending_reason IS NOT NULL` quand `status='pending'`
-- (les lignes créées AVANT cette migration restent `NULL` -- leur motif
-- historique n'est pas reconstituable, et ce n'est pas grave : R8 ne
-- regarde que les 12 derniers mois glissants... non, l'année civile en
-- cours -- toute ligne antérieure à cette migration sera de toute façon
-- hors de l'année civile courante dès le prochain 1er janvier).
ALTER TABLE order_credits
  ADD CONSTRAINT order_credits_pending_reason_requires_pending
  CHECK (pending_reason IS NULL OR status = 'pending');

COMMENT ON COLUMN order_credits.pending_reason IS
  'Pourquoi ce crédit est en attente (NULL si status != ''pending'', ou si créé avant la migration 0026). ''campagne_inactive'' = campagne pas encore active ; ''plafond_annuel'' = R8, excédent au-delà de athlete_credit_annuel_max, à libérer manuellement par un admin.';

-- -----------------------------------------------------------------------------
-- create_paid_order (migration 0006) : ajoute pending_reason à l'écriture de
-- chaque ligne order_credits. Signature INCHANGÉE (p_credits reste un jsonb
-- flexible) -- CREATE OR REPLACE suffit, pas de DROP nécessaire (contrairement
-- à create_campaign_with_details, migration 0024, dont la signature
-- positionnelle avait changé).
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
        status, applied_rule_id, computation_note, pending_reason
      ) VALUES (
        v_order.id,
        (v_credit->>'beneficiary_type')::beneficiary_type,
        (v_credit->>'beneficiary_id')::uuid,
        NULLIF(v_credit->>'campaign_id', '')::uuid,
        (v_credit->>'amount_cents')::integer,
        (v_credit->>'status')::credit_status,
        NULLIF(v_credit->>'applied_rule_id', '')::uuid,
        v_credit->>'computation_note',
        NULLIF(v_credit->>'pending_reason', '')::credit_pending_reason
      ) RETURNING id INTO v_order_credit_id;

      INSERT INTO public.credit_audit_log (order_credit_id, actor_id, action, old_value, new_value)
      VALUES (
        v_order_credit_id, NULL, 'created', NULL,
        jsonb_build_object(
          'amount_cents', (v_credit->>'amount_cents')::integer,
          'status', v_credit->>'status',
          'pending_reason', v_credit->>'pending_reason'
        )
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

-- Signature de fonction inchangée, mais GRANT/search_path déjà posés par la
-- migration 0006 restent valides pour un CREATE OR REPLACE (même OID) -- pas
-- besoin de les reposer. Documenté ici pour éviter qu'une future migration ne
-- les recrée par erreur en pensant qu'ils ont été perdus.
