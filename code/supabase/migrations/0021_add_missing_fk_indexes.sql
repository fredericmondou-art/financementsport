-- 0021_add_missing_fk_indexes.sql
-- Ajoute un index sur chaque colonne de clé étrangère signalée sans index
-- couvrant par l'advisor performance Supabase (lint "unindexed_foreign_keys").
-- Purement additif : aucun changement de comportement, aucune donnée touchée.
-- Voir docs/DECISIONS.md (2026-06-25, section "Recommandations du point 7").

CREATE INDEX IF NOT EXISTS idx_addresses_user_id            ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_athletes_user_id              ON public.athletes(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_club_id           ON public.memberships(club_id);
CREATE INDEX IF NOT EXISTS idx_memberships_team_id           ON public.memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id          ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_credit_rules_product_id       ON public.credit_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_club_id             ON public.campaigns(club_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by          ON public.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_team_id             ON public.campaigns(team_id);
CREATE INDEX IF NOT EXISTS idx_campaign_participants_athlete_id ON public.campaign_participants(athlete_id);
CREATE INDEX IF NOT EXISTS idx_campaign_products_product_id  ON public.campaign_products(product_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id                 ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id             ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id          ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_beneficiaries_campaign_id ON public.cart_beneficiaries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cart_beneficiaries_cart_id     ON public.cart_beneficiaries(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id     ON public.orders(shipping_address_id);
CREATE INDEX IF NOT EXISTS idx_orders_team_id                 ON public.orders(team_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id          ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_credits_applied_rule_id   ON public.order_credits(applied_rule_id);
CREATE INDEX IF NOT EXISTS idx_credit_audit_log_actor_id       ON public.credit_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_credit_audit_log_order_credit_id ON public.credit_audit_log(order_credit_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lists_campaign_id  ON public.distribution_lists(campaign_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lists_team_id      ON public.distribution_lists(team_id);
CREATE INDEX IF NOT EXISTS idx_payouts_approved_by             ON public.payouts(approved_by);
CREATE INDEX IF NOT EXISTS idx_payouts_campaign_id             ON public.payouts(campaign_id);
