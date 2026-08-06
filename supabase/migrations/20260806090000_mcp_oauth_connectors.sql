-- Axon Memory: MCP / OAuth connector layer
--
-- This is what lets Claude, ChatGPT, Gemini, Cursor, etc. attach to a user's
-- memory through a real OAuth handshake (login + one-click approve) instead
-- of copy-pasting a raw API key into each tool. Every issued token still
-- lands in `api_keys` (the same table context-pack already trusts), just
-- tagged with which OAuth client issued it — so all existing auth/read/write
-- paths keep working unchanged, and every connected AI reads/writes the
-- exact same `memory_items` for that user.

-- =========================================================
-- oauth_clients — registered MCP/OAuth clients (Claude, ChatGPT, Cursor, ...)
-- =========================================================
create table if not exists public.oauth_clients (
  id uuid primary key default extensions.uuid_generate_v4(),
  client_id text not null unique,             -- public identifier, safe to expose
  client_secret_hash text,                     -- null for public/PKCE-only clients
  client_name text not null,                   -- shown on the consent screen
  client_uri text,
  logo_uri text,
  redirect_uris text[] not null default '{}',
  is_public boolean not null default true,     -- true = PKCE required, no secret
  created_via text not null default 'dcr' check (created_via in ('dcr', 'manual')),
  created_at timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;
-- No public policies: only Edge Functions (service role) touch this table.

create index if not exists idx_oauth_clients_client_id on public.oauth_clients(client_id);

-- =========================================================
-- oauth_authorization_codes — short-lived codes from the /authorize step
-- =========================================================
create table if not exists public.oauth_authorization_codes (
  id uuid primary key default extensions.uuid_generate_v4(),
  code_hash text not null unique,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text,
  code_challenge_method text default 'S256',
  scope text not null default 'memory.read memory.write',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.oauth_authorization_codes enable row level security;
-- No public policies: only Edge Functions (service role) touch this table.

create index if not exists idx_oauth_codes_hash on public.oauth_authorization_codes(code_hash) where used_at is null;

-- =========================================================
-- api_keys: tag tokens issued via OAuth with their client, so the AI
-- Adapters page can show "Claude — connected via OAuth" instead of a
-- generic key row, and so mcp-server can enforce scopes per connection.
-- =========================================================
alter table public.api_keys
  add column if not exists oauth_client_id text references public.oauth_clients(client_id) on delete set null,
  add column if not exists scope text;

create index if not exists idx_api_keys_oauth_client on public.api_keys(oauth_client_id);

-- =========================================================
-- memory_items: allow a null occurred_at default write path used by the
-- `remember` tool/action (already supported — content_type 'note' and
-- source_type 'manual' both existed since 0001_init.sql). Nothing to alter;
-- this comment documents the write path the OAuth/MCP layer relies on.
-- =========================================================
