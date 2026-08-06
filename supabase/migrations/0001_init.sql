-- Axon Memory — core schema
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists vector;

-- =========================================================
-- profiles
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text,              -- e.g. "founder", "engineer", "pm" — from onboarding
  use_case text,          -- free-text goal captured at onboarding
  plan text not null default 'free' check (plan in ('free','standard','enterprise')),
  stripe_customer_id text unique,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- generic updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================
-- source_connections  (Gmail / GitHub / Notion / Slack, extensible)
-- =========================================================
create table if not exists public.source_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','github','notion','slack')),
  status text not null default 'connected' check (status in ('connected','syncing','error','disconnected')),
  external_account_label text,          -- e.g. the connected email / workspace name
  access_token_encrypted text,          -- pgp_sym_encrypt'd with app secret
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[],
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.source_connections enable row level security;

create policy "source_connections_all_own" on public.source_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger source_connections_set_updated_at
  before update on public.source_connections
  for each row execute function public.set_updated_at();

create index if not exists idx_source_connections_user on public.source_connections(user_id);

-- =========================================================
-- memory_items — the atomic unit of "memory"
-- =========================================================
create table if not exists public.memory_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_connection_id uuid references public.source_connections(id) on delete set null,
  source_type text not null check (source_type in ('gmail','github','notion','slack','manual')),
  content_type text not null default 'note' check (content_type in ('email','commit','pull_request','issue','page','message','note')),
  external_id text,                      -- id from the source system, for de-dup
  title text,
  content text not null,
  entities jsonb not null default '[]',  -- extracted people/projects/topics
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, source_connection_id, external_id)
);

alter table public.memory_items enable row level security;

create policy "memory_items_all_own" on public.memory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_memory_items_user on public.memory_items(user_id, occurred_at desc);
create index if not exists idx_memory_items_search on public.memory_items
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || content));

-- Optional embeddings table (populated once an embedding provider key is configured)
create table if not exists public.memory_embeddings (
  memory_item_id uuid primary key references public.memory_items(id) on delete cascade,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
alter table public.memory_embeddings enable row level security;
create policy "memory_embeddings_all_own" on public.memory_embeddings
  for all using (
    exists (select 1 from public.memory_items m where m.id = memory_item_id and m.user_id = auth.uid())
  );

-- =========================================================
-- api_keys — how external tools (ChatGPT/Claude/Cursor/etc.) pull context
-- =========================================================
create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default key',
  key_prefix text not null,     -- first 12 chars shown in UI, e.g. axon_live_ab12
  key_hash text not null,       -- sha256 of full key, never store plaintext
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.api_keys enable row level security;
create policy "api_keys_all_own" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_api_keys_hash on public.api_keys(key_hash) where revoked_at is null;

-- =========================================================
-- subscriptions — mirrors Stripe state (written only by the webhook function)
-- =========================================================
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text not null default 'standard' check (plan in ('standard','enterprise')),
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
-- inserts/updates happen only via the service-role key inside stripe-webhook

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- =========================================================
-- context_pack_logs — usage analytics, powers Dashboard stats honestly
-- =========================================================
create table if not exists public.context_pack_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  query text,
  token_budget int,
  items_returned int not null default 0,
  approx_tokens_saved int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.context_pack_logs enable row level security;
create policy "context_pack_logs_select_own" on public.context_pack_logs
  for select using (auth.uid() = user_id);

create index if not exists idx_context_pack_logs_user on public.context_pack_logs(user_id, created_at desc);
