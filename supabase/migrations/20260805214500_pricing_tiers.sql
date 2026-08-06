-- Axon Memory: 4-tier pricing model + feature flags
-- Tiers: starter (2.99/mo), pro (5.99/mo), ultra (9.99/mo), lifetime_founder (199 one-time)

create type public.plan_tier as enum ('starter', 'pro', 'ultra', 'lifetime_founder');

-- Extend profiles with plan + Stripe linkage (idempotent)
alter table public.profiles
  add column if not exists plan_tier public.plan_tier not null default 'starter',
  add column if not exists plan_started_at timestamptz not null default now(),
  add column if not exists plan_expires_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text;

create index if not exists profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);
create index if not exists profiles_stripe_subscription_id_idx on public.profiles (stripe_subscription_id);

-- Feature flag catalogue
create table if not exists public.plan_features (
  tier public.plan_tier not null,
  feature_key text not null,
  enabled boolean not null default true,
  primary key (tier, feature_key)
);

-- Seed the feature matrix (idempotent upsert)
insert into public.plan_features (tier, feature_key, enabled) values
  ('starter',          'connections',      true),
  ('starter',          'axon_ai',          false),
  ('starter',          'advanced_search',  false),
  ('starter',          'semantic_search',  false),
  ('starter',          'api_access',       false),

  ('pro',              'connections',      true),
  ('pro',              'axon_ai',          true),
  ('pro',              'advanced_search',  true),
  ('pro',              'semantic_search',  false),
  ('pro',              'api_access',       false),

  ('ultra',            'connections',      true),
  ('ultra',            'axon_ai',          true),
  ('ultra',            'advanced_search',  true),
  ('ultra',            'semantic_search',  true),
  ('ultra',            'api_access',       true),

  ('lifetime_founder', 'connections',      true),
  ('lifetime_founder', 'axon_ai',          true),
  ('lifetime_founder', 'advanced_search',  true),
  ('lifetime_founder', 'semantic_search',  true),
  ('lifetime_founder', 'api_access',       true)
on conflict (tier, feature_key) do update set enabled = excluded.enabled;

-- Per-user resolved plan status, pivoted into named boolean columns for easy frontend gating
create or replace view public.user_plan_status as
select
  p.id as user_id,
  p.plan_tier,
  p.plan_started_at,
  p.plan_expires_at,
  p.stripe_customer_id,
  p.stripe_subscription_id,
  p.stripe_price_id,
  coalesce(max(case when pf.feature_key = 'connections'     then pf.enabled::int end), 0)::boolean as has_connections,
  coalesce(max(case when pf.feature_key = 'axon_ai'         then pf.enabled::int end), 0)::boolean as has_axon_ai,
  coalesce(max(case when pf.feature_key = 'advanced_search' then pf.enabled::int end), 0)::boolean as has_advanced_search,
  coalesce(max(case when pf.feature_key = 'semantic_search' then pf.enabled::int end), 0)::boolean as has_semantic_search,
  coalesce(max(case when pf.feature_key = 'api_access'      then pf.enabled::int end), 0)::boolean as has_api_access
from public.profiles p
left join public.plan_features pf on pf.tier = p.plan_tier
group by p.id, p.plan_tier, p.plan_started_at, p.plan_expires_at,
         p.stripe_customer_id, p.stripe_subscription_id, p.stripe_price_id;

-- RLS: users can read their own plan status row via the base table policies already on profiles.
-- plan_features is a public read-only catalogue.
alter table public.plan_features enable row level security;

drop policy if exists "plan_features_read_all" on public.plan_features;
create policy "plan_features_read_all" on public.plan_features
  for select using (true);

grant select on public.user_plan_status to authenticated, anon;
grant select on public.plan_features to authenticated, anon;
