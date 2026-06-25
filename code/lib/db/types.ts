/**
 * Types TypeScript représentant le schéma de base de données.
 *
 * IMPORTANT — PROVENANCE DE CE FICHIER :
 * Ces types ont été écrits MANUELLEMENT en lisant `supabase/migrations/
 * 0001_initial_schema.sql`. Ils ne proviennent PAS d'une génération
 * automatique : nous n'avons pas encore de projet Supabase réel lié (les
 * identifiants seront fournis plus tard pour le déploiement).
 *
 * DÈS QUE le projet Supabase réel est connecté, ce fichier DOIT être
 * régénéré (et remplacé) avec la commande officielle, qui fait foi :
 *
 *   supabase gen types typescript --linked > lib/db/types.ts
 *
 * Jusqu'à cette régénération, traite ce fichier comme une approximation
 * fidèle mais non garantie bit-à-bit identique à la sortie de l'outil
 * officiel (notamment pour les vues, dont les colonnes "nullable" peuvent
 * différer légèrement selon l'inférence de Postgres/Supabase).
 */

// =============================================================================
// ENUMS
// =============================================================================

export type UserRole =
  | 'client'
  | 'athlete'
  | 'team_manager'
  | 'club_admin'
  | 'platform_admin'
  | 'support'
  | 'logistics'
  | 'accounting';

export type BeneficiaryType = 'athlete' | 'team' | 'club';

export type CampaignType = 'team' | 'club' | 'athlete' | 'event' | 'annual' | 'reorder';

export type CampaignStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'active'
  | 'ended'
  | 'closed'
  | 'paid'
  | 'cancelled'
  | 'archived';

export type OrderStatus =
  | 'payment_pending'
  | 'paid'
  | 'preparing'
  | 'ready'
  | 'delivered_to_team'
  | 'distributed'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'error';

export type CreditStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'refunded';

export type PayoutStatus =
  | 'calculated'
  | 'in_validation'
  | 'approved'
  | 'paid'
  | 'adjusted'
  | 'disputed'
  | 'closed';

export type ProductKind = 'product' | 'pack' | 'subscription';

// =============================================================================
// TABLES
// =============================================================================

export interface ProfilesTable {
  Row: {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: UserRole;
    consent_email: boolean;
    consent_sms: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id: string;
    email: string;
    full_name?: string | null;
    phone?: string | null;
    role?: UserRole;
    consent_email?: boolean;
    consent_sms?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<ProfilesTable['Insert']>;
}

export interface AddressesTable {
  Row: {
    id: string;
    user_id: string;
    label: string | null;
    line1: string;
    line2: string | null;
    city: string;
    province: string;
    postal_code: string;
    country: string;
    is_default: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    label?: string | null;
    line1: string;
    line2?: string | null;
    city: string;
    province: string;
    postal_code: string;
    country?: string;
    is_default?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<AddressesTable['Insert']>;
}

export interface ClubsTable {
  Row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    city: string | null;
    province: string | null;
    is_active: boolean;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    name: string;
    slug: string;
    description?: string | null;
    logo_url?: string | null;
    city?: string | null;
    province?: string | null;
    is_active?: boolean;
    approved_at?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<ClubsTable['Insert']>;
}

export interface TeamsTable {
  Row: {
    id: string;
    club_id: string | null;
    name: string;
    slug: string;
    sport: string | null;
    category: string | null;
    logo_url: string | null;
    city: string | null;
    province: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    club_id?: string | null;
    name: string;
    slug: string;
    sport?: string | null;
    category?: string | null;
    logo_url?: string | null;
    city?: string | null;
    province?: string | null;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<TeamsTable['Insert']>;
}

export interface AthletesTable {
  Row: {
    id: string;
    team_id: string | null;
    guardian_id: string | null;
    user_id: string | null;
    first_name: string;
    last_name: string;
    slug: string;
    sport: string | null;
    city: string | null;
    photo_url: string | null;
    personal_message: string | null;
    is_minor: boolean;
    hide_last_name: boolean;
    hide_photo: boolean;
    hide_city: boolean;
    hide_amounts: boolean;
    show_team_only: boolean;
    parental_consent_at: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    team_id?: string | null;
    guardian_id?: string | null;
    user_id?: string | null;
    first_name: string;
    last_name: string;
    slug: string;
    sport?: string | null;
    city?: string | null;
    photo_url?: string | null;
    personal_message?: string | null;
    is_minor?: boolean;
    hide_last_name?: boolean;
    hide_photo?: boolean;
    hide_city?: boolean;
    hide_amounts?: boolean;
    show_team_only?: boolean;
    parental_consent_at?: string | null;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<AthletesTable['Insert']>;
}

export interface MembershipsTable {
  Row: {
    id: string;
    user_id: string;
    role: UserRole;
    club_id: string | null;
    team_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    role: UserRole;
    club_id?: string | null;
    team_id?: string | null;
    created_at?: string;
  };
  Update: Partial<MembershipsTable['Insert']>;
}

export interface ProductCategoriesTable {
  Row: {
    id: string;
    name: string;
    slug: string;
  };
  Insert: {
    id?: string;
    name: string;
    slug: string;
  };
  Update: Partial<ProductCategoriesTable['Insert']>;
}

export interface ProductsTable {
  Row: {
    id: string;
    kind: ProductKind;
    category_id: string | null;
    name: string;
    slug: string;
    description: string | null;
    image_url: string | null;
    price_cents: number;
    fixed_credit_cents: number | null;
    is_taxable: boolean;
    stock_quantity: number;
    lead_time_days: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    kind?: ProductKind;
    category_id?: string | null;
    name: string;
    slug: string;
    description?: string | null;
    image_url?: string | null;
    price_cents: number;
    fixed_credit_cents?: number | null;
    is_taxable?: boolean;
    stock_quantity?: number;
    lead_time_days?: number | null;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<ProductsTable['Insert']>;
}

export interface CreditRulesTable {
  Row: {
    id: string;
    campaign_id: string | null;
    product_id: string | null;
    scope: string;
    percent_bps: number | null;
    flat_cents: number | null;
    min_basket_cents: number | null;
    bonus_percent_bps: number | null;
    priority: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    campaign_id?: string | null;
    product_id?: string | null;
    scope?: string;
    percent_bps?: number | null;
    flat_cents?: number | null;
    min_basket_cents?: number | null;
    bonus_percent_bps?: number | null;
    priority?: number;
    is_active?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<CreditRulesTable['Insert']>;
}

export interface CampaignsTable {
  Row: {
    id: string;
    type: CampaignType;
    status: CampaignStatus;
    name: string;
    slug: string;
    public_message: string | null;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    club_id: string | null;
    team_id: string | null;
    goal_cents: number | null;
    starts_at: string | null;
    ends_at: string | null;
    created_by: string | null;
    approved_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    type: CampaignType;
    status?: CampaignStatus;
    name: string;
    slug: string;
    public_message?: string | null;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    club_id?: string | null;
    team_id?: string | null;
    goal_cents?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    created_by?: string | null;
    approved_at?: string | null;
    closed_at?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<CampaignsTable['Insert']>;
}

export interface CampaignParticipantsTable {
  Row: {
    id: string;
    campaign_id: string;
    athlete_id: string;
    goal_cents: number | null;
    joined_at: string;
    approved_at: string | null;
  };
  Insert: {
    id?: string;
    campaign_id: string;
    athlete_id: string;
    goal_cents?: number | null;
    joined_at?: string;
    approved_at?: string | null;
  };
  Update: Partial<CampaignParticipantsTable['Insert']>;
}

export interface CampaignProductsTable {
  Row: {
    campaign_id: string;
    product_id: string;
  };
  Insert: {
    campaign_id: string;
    product_id: string;
  };
  Update: Partial<CampaignProductsTable['Insert']>;
}

export interface QrCodesTable {
  Row: {
    id: string;
    target_type: string;
    target_id: string;
    code: string;
    is_dynamic: boolean;
    redirect_url: string | null;
    expires_at: string | null;
    scan_count: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    target_type: string;
    target_id: string;
    code: string;
    is_dynamic?: boolean;
    redirect_url?: string | null;
    expires_at?: string | null;
    scan_count?: number;
    created_at?: string;
  };
  Update: Partial<QrCodesTable['Insert']>;
}

export interface CartsTable {
  Row: {
    id: string;
    user_id: string | null;
    session_token: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id?: string | null;
    session_token?: string | null;
    status?: string;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<CartsTable['Insert']>;
}

export interface CartItemsTable {
  Row: {
    id: string;
    cart_id: string;
    product_id: string;
    quantity: number;
    unit_price_cents: number;
    created_at: string;
  };
  Insert: {
    id?: string;
    cart_id: string;
    product_id: string;
    quantity: number;
    unit_price_cents: number;
    created_at?: string;
  };
  Update: Partial<CartItemsTable['Insert']>;
}

export interface CartBeneficiariesTable {
  Row: {
    id: string;
    cart_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id: string | null;
    share_bps: number;
  };
  Insert: {
    id?: string;
    cart_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id?: string | null;
    share_bps: number;
  };
  Update: Partial<CartBeneficiariesTable['Insert']>;
}

export interface OrdersTable {
  Row: {
    id: string;
    order_number: string;
    user_id: string | null;
    guest_email: string | null;
    status: OrderStatus;
    subtotal_cents: number;
    tax_cents: number;
    shipping_cents: number;
    total_cents: number;
    credit_total_cents: number;
    shipping_address_id: string | null;
    primary_campaign_id: string | null;
    team_id: string | null;
    stripe_payment_intent_id: string | null;
    notes_internal: string | null;
    created_at: string;
    paid_at: string | null;
    updated_at: string;
  };
  Insert: {
    id?: string;
    order_number: string;
    user_id?: string | null;
    guest_email?: string | null;
    status?: OrderStatus;
    subtotal_cents: number;
    tax_cents?: number;
    shipping_cents?: number;
    total_cents: number;
    credit_total_cents?: number;
    shipping_address_id?: string | null;
    primary_campaign_id?: string | null;
    team_id?: string | null;
    stripe_payment_intent_id?: string | null;
    notes_internal?: string | null;
    created_at?: string;
    paid_at?: string | null;
    updated_at?: string;
  };
  Update: Partial<OrdersTable['Insert']>;
}

export interface OrderItemsTable {
  Row: {
    id: string;
    order_id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  };
  Insert: {
    id?: string;
    order_id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  };
  Update: Partial<OrderItemsTable['Insert']>;
}

export interface OrderCreditsTable {
  Row: {
    id: string;
    order_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id: string | null;
    amount_cents: number;
    status: CreditStatus;
    applied_rule_id: string | null;
    computation_note: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    order_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id?: string | null;
    amount_cents: number;
    status?: CreditStatus;
    applied_rule_id?: string | null;
    computation_note?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<OrderCreditsTable['Insert']>;
}

export interface CreditAuditLogTable {
  Row: {
    id: string;
    order_credit_id: string;
    actor_id: string | null;
    action: string;
    old_value: unknown | null;
    new_value: unknown | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    order_credit_id: string;
    actor_id?: string | null;
    action: string;
    old_value?: unknown | null;
    new_value?: unknown | null;
    created_at?: string;
  };
  Update: Partial<CreditAuditLogTable['Insert']>;
}

export interface TaxRatesTable {
  Row: {
    id: string;
    province: string;
    rate_bps: number;
    label: string | null;
    effective_at: string;
  };
  Insert: {
    id?: string;
    province: string;
    rate_bps: number;
    label?: string | null;
    effective_at?: string;
  };
  Update: Partial<TaxRatesTable['Insert']>;
}

export interface DistributionListsTable {
  Row: {
    id: string;
    campaign_id: string;
    team_id: string | null;
    generated_at: string;
    status: string;
  };
  Insert: {
    id?: string;
    campaign_id: string;
    team_id?: string | null;
    generated_at?: string;
    status?: string;
  };
  Update: Partial<DistributionListsTable['Insert']>;
}

export interface PayoutsTable {
  Row: {
    id: string;
    campaign_id: string | null;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    amount_cents: number;
    fee_held_cents: number;
    status: PayoutStatus;
    approved_by: string | null;
    paid_at: string | null;
    proof_url: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    campaign_id?: string | null;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    amount_cents: number;
    fee_held_cents?: number;
    status?: PayoutStatus;
    approved_by?: string | null;
    paid_at?: string | null;
    proof_url?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<PayoutsTable['Insert']>;
}

/**
 * Ajoutée par la migration 0015 (Tâche 1.5.5) : traçabilité horodatée des
 * changements de statut de commande. Écrite UNIQUEMENT par la fonction
 * Postgres `advance_order_status` -- aucun `Insert`/`Update` direct depuis ce
 * module (pas de policy RLS d'écriture pour anon/authenticated).
 */
export interface OrderStatusLogTable {
  Row: {
    id: string;
    order_id: string;
    from_status: OrderStatus;
    to_status: OrderStatus;
    changed_by: string | null;
    changed_at: string;
  };
  Insert: never;
  Update: never;
}

/**
 * Ajoutée par la migration 0019 (Tâche 1.5.10) : traçabilité horodatée des
 * changements de statut de versement. Écrite UNIQUEMENT par la fonction
 * Postgres `advance_payout_status` -- aucun `Insert`/`Update` direct depuis
 * ce module (pas de policy RLS d'écriture pour anon/authenticated), même
 * convention que `OrderStatusLogTable`.
 */
export interface PayoutStatusLogTable {
  Row: {
    id: string;
    payout_id: string;
    from_status: PayoutStatus;
    to_status: PayoutStatus;
    changed_by: string | null;
    note: string | null;
    changed_at: string;
  };
  Insert: never;
  Update: never;
}

export interface EmailLogTable {
  Row: {
    id: string;
    recipient: string;
    template: string;
    related_type: string | null;
    related_id: string | null;
    sent_at: string | null;
    status: string;
    provider_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    recipient: string;
    template: string;
    related_type?: string | null;
    related_id?: string | null;
    sent_at?: string | null;
    status?: string;
    provider_id?: string | null;
    created_at?: string;
  };
  Update: Partial<EmailLogTable['Insert']>;
}

/**
 * Ajoutée par la migration 0006 (Tâche 1.5) : table d'idempotence des
 * évènements Stripe, absente du schéma fourni (docs/schema-reference.sql)
 * -- voir le commentaire en tête de cette migration et docs/DECISIONS.md.
 */
export interface StripeEventsTable {
  Row: {
    id: string;
    type: string;
    order_id: string | null;
    payload: unknown | null;
    created_at: string;
  };
  Insert: {
    id: string;
    type: string;
    order_id?: string | null;
    payload?: unknown | null;
    created_at?: string;
  };
  Update: Partial<StripeEventsTable['Insert']>;
}

/**
 * Ajoutée par la migration 0010 (Tâche 1.6.B1) : un brouillon par
 * gestionnaire pour l'assistant de création de campagne en étapes — voir
 * `lib/campaigns/draft.ts`. `draft_data` est un objet libre (validé par étape
 * en TypeScript, jamais en base) tant que la campagne réelle n'a pas été
 * créée.
 */
export interface CampaignDraftsTable {
  Row: {
    id: string;
    user_id: string;
    current_step: string;
    draft_data: unknown;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    current_step?: string;
    draft_data?: unknown;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<CampaignDraftsTable['Insert']>;
}

/** Tâche 1.5.3 (migration 0013) : répartition favorite nommée. */
export interface SavedSplitsTable {
  Row: {
    id: string;
    user_id: string;
    name: string;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
  };
  Update: Partial<SavedSplitsTable['Insert']>;
}

/** Tâche 1.5.3 (migration 0013) : une ligne bénéficiaire d'une `SavedSplitsTable`. */
export interface SavedSplitItemsTable {
  Row: {
    id: string;
    saved_split_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id: string | null;
    share_bps: number;
  };
  Insert: {
    id?: string;
    saved_split_id: string;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    campaign_id?: string | null;
    share_bps: number;
  };
  Update: Partial<SavedSplitItemsTable['Insert']>;
}

/**
 * Ajoutée par la migration 0018 (Tâche 1.5.9) : cache/figeage du rapport
 * financier d'une campagne. Écrite par l'application (pas une fonction
 * SECURITY DEFINER -- voir docs/DECISIONS.md, Tâche 1.5.9, sur le choix de
 * confiance) au PREMIER accès au rapport d'une campagne `closed`, jamais pour
 * une campagne active (toujours recalculée en direct dans ce cas). Clé
 * `(campaign_id, closed_at)` plutôt que `campaign_id` seul : `closed_at`
 * change de valeur à chaque nouvelle clôture (NULL pendant qu'active) --
 * une réouverture (migration 0017) invalide donc NATURELLEMENT l'ancien
 * figeage sans qu'aucune ligne ne soit supprimée ni qu'aucun code de la
 * Tâche 1.5.8 (déjà livrée) n'ait besoin d'être modifié. AUCUNE ligne n'est
 * jamais modifiée après insertion -- seule une INSERT, pas d'UPDATE/DELETE
 * (RLS, voir la migration).
 */
export interface CampaignReportsTable {
  Row: {
    id: string;
    campaign_id: string;
    closed_at: string;
    order_count: number;
    gross_sales_cents: number;
    tax_total_cents: number;
    tps_cents: number;
    tvq_cents: number;
    net_sales_cents: number;
    product_cost_cents: number | null;
    payment_fees_cents: number;
    shipping_cents: number;
    credit_total_cents: number;
    profit_estimate_cents: number;
    profit_estimate_excludes_cost: boolean;
    generated_at: string;
    generated_by: string | null;
  };
  Insert: {
    id?: string;
    campaign_id: string;
    closed_at: string;
    order_count: number;
    gross_sales_cents: number;
    tax_total_cents: number;
    tps_cents: number;
    tvq_cents: number;
    net_sales_cents: number;
    product_cost_cents?: number | null;
    payment_fees_cents: number;
    shipping_cents: number;
    credit_total_cents: number;
    profit_estimate_cents: number;
    profit_estimate_excludes_cost?: boolean;
    generated_at?: string;
    generated_by?: string | null;
  };
  Update: never;
}

// =============================================================================
// VIEWS
// =============================================================================

export interface VBeneficiaryCreditTotalsView {
  Row: {
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    total_active_cents: number;
  };
}

export interface VCampaignProgressView {
  Row: {
    campaign_id: string;
    goal_cents: number | null;
    raised_cents: number;
  };
}

/**
 * Ajoutée par la migration 0011 (Tâche 1.6.C2) : nombre de commandes
 * distinctes ayant généré un crédit actif/en attente pour une campagne --
 * voir le commentaire de la migration pour pourquoi cette vue existe plutôt
 * qu'une lecture directe de `order_credits` (lacune RLS pour le tuteur d'un
 * bénéficiaire qui n'est pas l'acheteur).
 */
export interface VCampaignSupporterCountView {
  Row: {
    campaign_id: string;
    supporter_count: number;
  };
}

export interface VPublicAthleteView {
  Row: {
    id: string;
    team_id: string | null;
    first_name: string;
    last_name: string;
    display_name: string;
    slug: string;
    sport: string | null;
    city: string | null;
    photo_url: string | null;
    personal_message: string | null;
    hide_amounts: boolean;
    show_team_only: boolean;
  };
}

export interface VPublicTeamView {
  Row: {
    id: string;
    club_id: string | null;
    name: string;
    slug: string;
    sport: string | null;
    category: string | null;
    logo_url: string | null;
    city: string | null;
    province: string | null;
  };
}

export interface VPublicClubView {
  Row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    city: string | null;
    province: string | null;
  };
}

/**
 * Ajoutée par la migration 0007 (Tâche 1.6) : variante publique de
 * `campaigns`, filtrée sur `status = 'active'` -- les pages publiques ne
 * doivent jamais lire la table `campaigns` directement (RLS + CLAUDE.md
 * section 5 : passer par une vue qui respecte les `hide_*`).
 */
export interface VPublicCampaignView {
  Row: {
    id: string;
    type: CampaignType;
    name: string;
    slug: string;
    public_message: string | null;
    beneficiary_type: BeneficiaryType;
    beneficiary_id: string;
    goal_cents: number | null;
    starts_at: string | null;
    ends_at: string | null;
  };
}

export interface VPublicCampaignProductsView {
  Row: {
    campaign_id: string;
    product_id: string;
  };
}

// =============================================================================
// DATABASE
// =============================================================================

export interface Database {
  public: {
    Tables: {
      profiles: ProfilesTable;
      addresses: AddressesTable;
      clubs: ClubsTable;
      teams: TeamsTable;
      athletes: AthletesTable;
      memberships: MembershipsTable;
      product_categories: ProductCategoriesTable;
      products: ProductsTable;
      credit_rules: CreditRulesTable;
      campaigns: CampaignsTable;
      campaign_participants: CampaignParticipantsTable;
      campaign_products: CampaignProductsTable;
      qr_codes: QrCodesTable;
      carts: CartsTable;
      cart_items: CartItemsTable;
      cart_beneficiaries: CartBeneficiariesTable;
      orders: OrdersTable;
      order_items: OrderItemsTable;
      order_credits: OrderCreditsTable;
      credit_audit_log: CreditAuditLogTable;
      tax_rates: TaxRatesTable;
      distribution_lists: DistributionListsTable;
      payouts: PayoutsTable;
      email_log: EmailLogTable;
      stripe_events: StripeEventsTable;
      campaign_drafts: CampaignDraftsTable;
      saved_splits: SavedSplitsTable;
      saved_split_items: SavedSplitItemsTable;
      order_status_log: OrderStatusLogTable;
      campaign_reports: CampaignReportsTable;
      payout_status_log: PayoutStatusLogTable;
    };
    Views: {
      v_beneficiary_credit_totals: VBeneficiaryCreditTotalsView;
      v_campaign_progress: VCampaignProgressView;
      v_campaign_supporter_count: VCampaignSupporterCountView;
      v_public_athlete: VPublicAthleteView;
      v_public_team: VPublicTeamView;
      v_public_club: VPublicClubView;
      v_public_campaign: VPublicCampaignView;
      v_public_campaign_products: VPublicCampaignProductsView;
    };
    Enums: {
      user_role: UserRole;
      beneficiary_type: BeneficiaryType;
      campaign_type: CampaignType;
      campaign_status: CampaignStatus;
      order_status: OrderStatus;
      credit_status: CreditStatus;
      payout_status: PayoutStatus;
      product_kind: ProductKind;
    };
  };
}
