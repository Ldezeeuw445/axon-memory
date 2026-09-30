-- Memory that knows which project it belongs to.
--
-- Everything was flat: one account, one heap. That held while a person had one
-- codebase. With four, the largest simply wins — 296 of 476 commits on this
-- account come from one repo, so a recall while working on a different app
-- returns mostly the loud one. Not wrong, and not useful, which is worse:
-- the assistant knows more and answers less well.
--
-- ## What a scope means here
--
-- A memory belongs to exactly one project, or to none. None is not "unknown" —
-- it is "everywhere". That the user works in TypeScript, lives in Julianadorp,
-- and has a bug open in Linear is true whichever app they have open, and a
-- mailbox is not about one repo. Those stay global on purpose.
--
-- Commits are the opposite: a commit is always about one thing. So repositories
-- are never global. A repo the user has not placed does not become universal
-- background noise; it is simply not synced, which is also the honest answer to
-- "I have forty repos and care about four".

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null,
  name        text not null,
  -- Optional accent for the landscape. Null lets the terrain derive one, the
  -- same way an unmapped source gets a hue from its key.
  colour      text,
  created_at  timestamptz not null default now(),
  constraint projects_key_format check (key ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  constraint projects_key_unique unique (user_id, key)
);

comment on table public.projects is
  'A thing the user is building. Memories are scoped to one, or to none — none meaning it applies across all of them rather than that nobody knows.';

alter table public.projects enable row level security;

create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);
create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

-- Which repositories are synced, and what each one is about.
--
-- Doubles as the sync allowlist. Before this the GitHub sync took whichever ten
-- repositories had been pushed to most recently, which is a reasonable guess
-- and never the answer — it picked up experiments and abandoned branches and
-- left out the repo somebody had not touched this week but cares about most.
create table if not exists public.project_repos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- owner/name exactly as GitHub reports it, which is what the sync already
  -- stores in memory_items.metadata->>'repo'.
  full_name   text not null,
  created_at  timestamptz not null default now(),
  constraint project_repos_unique unique (user_id, full_name)
);

comment on table public.project_repos is
  'The repositories this account syncs, and which project each belongs to. A repo absent from this table is not synced at all.';

alter table public.project_repos enable row level security;

create policy project_repos_select_own on public.project_repos
  for select using (auth.uid() = user_id);
create policy project_repos_insert_own on public.project_repos
  for insert with check (auth.uid() = user_id);
create policy project_repos_update_own on public.project_repos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy project_repos_delete_own on public.project_repos
  for delete using (auth.uid() = user_id);

-- Nullable on purpose, and null carries meaning: this memory is not about one
-- project. Set null on delete rather than cascading — removing a project should
-- not remove the memories that were filed under it, it should let them go back
-- to being general.
alter table public.memory_items
  add column if not exists project_id uuid references public.projects (id) on delete set null;

comment on column public.memory_items.project_id is
  'The project this memory is about, or null when it applies across all of them (mail, identity, a conclusion about how the person works).';

-- Recall filters on it for every read, so it is worth an index; partial, because
-- the global rows are found by IS NULL and do not need to be in the tree.
create index if not exists memory_items_user_project_idx
  on public.memory_items (user_id, project_id)
  where project_id is not null;
