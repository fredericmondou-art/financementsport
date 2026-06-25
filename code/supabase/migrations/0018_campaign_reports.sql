-- Tâche 1.5.9 — Rapport de campagne : table de figeage (snapshot) du
-- rapport financier d'une campagne clôturée.
--
-- Pourquoi une table plutôt qu'un calcul toujours en direct ?
-- Le cahier (docs/prompts/phase-1-5.md, Tâche 1.5.9) exige : « Le rapport
-- d'une campagne `closed` est figé (les chiffres ne doivent plus bouger). »
-- Sans figeage, un évènement après clôture (ex. un remboursement créant un
-- statut `partially_refunded`, déjà compté comme "vente" par `isOrderPaid`)
-- changerait silencieusement les chiffres déjà montrés à un responsable.
--
-- Pourquoi clé `(campaign_id, closed_at)` et pas `campaign_id` seul ?
-- `campaigns.closed_at` (migration 0017) est mis à une nouvelle valeur à
-- chaque clôture et remis à NULL à chaque réouverture par `close_campaign`/
-- `reopen_campaign` -- déjà livrées, NE PAS MODIFIER. En clé composite, un
-- cycle réouverture → nouvelle clôture invalide donc NATURELLEMENT l'ancien
-- figeage (nouvelle valeur de `closed_at` = nouvelle ligne) sans qu'aucune
-- ligne existante ne soit jamais modifiée ni supprimée, et sans toucher au
-- code déjà livré de la Tâche 1.5.8.
--
-- Pourquoi une table RLS ordinaire et pas une fonction SECURITY DEFINER
-- (comme `close_campaign`/`reopen_campaign`) ?
-- Décision documentée dans docs/DECISIONS.md (Tâche 1.5.9). En résumé :
-- cette table n'est PAS la source de vérité financière (CLAUDE.md section 4 :
-- « les soldes... se calculent depuis order_credits ») -- seulement un cache
-- d'affichage/export généré par du TypeScript déjà testé unitairement
-- (lib/reports/campaign.ts). Dupliquer ce calcul en SQL aurait risqué une
-- divergence entre les deux implémentations pour aucun gain de confiance
-- réel, alors que `team_manager` a déjà, ailleurs dans le schéma, un accès
-- en lecture comparable aux données financières de ses propres campagnes
-- (migrations 0014, 0016). Insertion permise (génération du figeage),
-- AUCUNE mise à jour ni suppression : une fois écrite, une ligne ne change
-- plus (immuabilité = le figeage lui-même).

create table if not exists public.campaign_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  closed_at timestamptz not null,
  order_count integer not null,
  gross_sales_cents integer not null,
  tax_total_cents integer not null,
  tps_cents integer not null,
  tvq_cents integer not null,
  net_sales_cents integer not null,
  product_cost_cents integer,
  payment_fees_cents integer not null,
  shipping_cents integer not null,
  credit_total_cents integer not null,
  profit_estimate_cents integer not null,
  profit_estimate_excludes_cost boolean not null default true,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id) on delete set null,
  unique (campaign_id, closed_at)
);

comment on table public.campaign_reports is
  'Figeage (snapshot) du rapport financier d''une campagne clôturée. '
  'Clé (campaign_id, closed_at) : voir commentaire de tête de cette '
  'migration pour la justification du self-invalidation au réouvre/reclôture.';

alter table public.campaign_reports enable row level security;

create policy campaign_reports_select on public.campaign_reports
  for select
  to authenticated
  using (
    private.is_platform_admin()
    or private.manages_campaign(campaign_id)
  );

create policy campaign_reports_insert on public.campaign_reports
  for insert
  to authenticated
  with check (
    private.is_platform_admin()
    or private.manages_campaign(campaign_id)
  );

-- Aucune policy UPDATE ni DELETE : une ligne, une fois insérée, est
-- immuable (c'est précisément le sens du figeage exigé par le cahier).
