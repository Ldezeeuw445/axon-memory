-- AXON Database Schema
-- Run this in your Supabase SQL Editor: https://app.supabase.com → SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- memory_nodes: stores individual knowledge/memory entries per user
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.memory_nodes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  content     text,
  type        text default 'document' check (type in ('document','goal','research','technical','interview','conversation','other')),
  source_id   text,              -- which data source this came from
  metadata    jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists memory_nodes_user_id_idx on public.memory_nodes(user_id);
create index if not exists memory_nodes_created_at_idx on public.memory_nodes(created_at desc);

-- ─────────────────────────────────────────────────────────────────
-- memory_edges: relationships between memory nodes
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.memory_edges (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  source_node_id uuid not null references public.memory_nodes(id) on delete cascade,
  target_node_id uuid not null references public.memory_nodes(id) on delete cascade,
  relationship   text default 'related',
  weight         float default 1.0,
  created_at     timestamptz default now()
);

create index if not exists memory_edges_user_id_idx on public.memory_edges(user_id);

-- ─────────────────────────────────────────────────────────────────
-- ai_adapter_connections: encrypted API keys per AI provider per user
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.ai_adapter_connections (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  provider         text not null check (provider in ('openai','anthropic','gemini','perplexity','cursor')),
  encrypted_api_key text not null default '',
  status           text default 'disconnected' check (status in ('connected','disconnected','error')),
  last_used        timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (user_id, provider)
);

create index if not exists ai_adapter_connections_user_id_idx on public.ai_adapter_connections(user_id);

-- ─────────────────────────────────────────────────────────────────
-- data_sources: connected data source integrations
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.data_sources (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   text not null,    -- e.g. 'notion', 'github', 'slack'
  name        text not null,
  status      text default 'connected' check (status in ('connected','disconnected','error','syncing')),
  node_count  integer default 0,
  last_synced timestamptz,
  config      jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, source_id)
);

create index if not exists data_sources_user_id_idx on public.data_sources(user_id);

-- ─────────────────────────────────────────────────────────────────
-- subscriptions: Stripe subscription tracking
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text default 'free' check (plan in ('free','pro')),
  status                 text default 'inactive',
  current_period_end     timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (user_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Row Level Security — CRITICAL: ensures users only see their own data
-- ─────────────────────────────────────────────────────────────────
alter table public.memory_nodes           enable row level security;
alter table public.memory_edges           enable row level security;
alter table public.ai_adapter_connections enable row level security;
alter table public.data_sources           enable row level security;
alter table public.subscriptions          enable row level security;

-- memory_nodes policies
create policy "Users can manage own memory_nodes" on public.memory_nodes
  for all using (auth.uid() = user_id);

-- memory_edges policies
create policy "Users can manage own memory_edges" on public.memory_edges
  for all using (auth.uid() = user_id);

-- ai_adapter_connections policies
create policy "Users can manage own ai_adapter_connections" on public.ai_adapter_connections
  for all using (auth.uid() = user_id);

-- data_sources policies
create policy "Users can manage own data_sources" on public.data_sources
  for all using (auth.uid() = user_id);

-- subscriptions policies
create policy "Users can view own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "Service can update subscriptions" on public.subscriptions
  for all using (true);  -- Updated by Stripe webhook via service role

-- ─────────────────────────────────────────────────────────────────
-- Auto-update updated_at timestamps
-- ─────────────────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_updated_at before update on public.memory_nodes           for each row execute procedure public.update_updated_at();
create trigger set_updated_at before update on public.ai_adapter_connections for each row execute procedure public.update_updated_at();
create trigger set_updated_at before update on public.data_sources           for each row execute procedure public.update_updated_at();
create trigger set_updated_at before update on public.subscriptions          for each row execute procedure public.update_updated_at();
