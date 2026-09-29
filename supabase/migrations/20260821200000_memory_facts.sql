-- Conclusions, not archive.
--
-- recall_context returns raw items: whole commit messages, email fragments. An
-- assistant asking "what does this person care about" gets twenty of those and
-- has to work it out again every session, inside its token budget. That is
-- searching, not remembering — and it is why "your taste in error handling"
-- could never be answered: nowhere does the system hold a conclusion.
--
-- A fact is a short durable statement derived from those items. It stays true
-- for months and costs fifty tokens instead of fifteen hundred.

create table if not exists public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- One statement, standalone, readable without its source.
  statement text not null,

  -- Broad buckets so recall can lead with identity and preference rather than
  -- whatever happens to be newest.
  category text not null check (category in (
    'identity',    -- who they are, what they do
    'project',     -- what they are building
    'preference',  -- how they like things done
    'relationship',-- who they work with
    'tool',        -- what they use
    'decision'     -- a choice made, and why
  )),

  -- What it was drawn from, so a fact is never unattributable.
  source_item_ids uuid[] not null default '{}',
  -- Which assistant or process derived it.
  derived_by text,

  -- Facts go stale. Re-derivation touches this instead of inserting a copy.
  first_seen_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  -- Set when a later fact contradicts this one, rather than deleting history.
  superseded_at timestamptz,

  created_at timestamptz not null default now()
);

-- Recall reads a user's live facts by category, newest confirmation first.
create index if not exists memory_facts_user_live_idx
  on public.memory_facts (user_id, category, last_confirmed_at desc)
  where superseded_at is null;

-- The same conclusion drawn twice is one fact confirmed twice. Case-insensitive
-- so a re-run that changes only capitalisation does not create a duplicate.
create unique index if not exists memory_facts_user_statement_idx
  on public.memory_facts (user_id, lower(statement));

alter table public.memory_facts enable row level security;

create policy "own facts readable" on public.memory_facts
  for select using (auth.uid() = user_id);

-- Writes come from the distiller running as service_role. A user editing their
-- own derived facts by hand would put them out of step with what they were
-- derived from, so there is deliberately no insert/update policy here.
create policy "own facts deletable" on public.memory_facts
  for delete using (auth.uid() = user_id);

grant select, delete on public.memory_facts to authenticated;
grant all on public.memory_facts to service_role;

-- Marks which items have already been through the distiller, so each run only
-- reads what is new. A column on memory_items rather than a join table: it is
-- one timestamp per row and it belongs to the row.
alter table public.memory_items
  add column if not exists distilled_at timestamptz;

create index if not exists memory_items_undistilled_idx
  on public.memory_items (user_id, occurred_at desc)
  where distilled_at is null;
