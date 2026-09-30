-- What a workspace is allowed to see and work with.
--
-- Until now a workspace was a build list and a team and nothing else: projects,
-- repositories, connected apps and assistants all hung straight off the user,
-- and nothing said which of them belonged to which workspace. So "show me only
-- what this workspace uses" could not be asked, and neither could the rule the
-- product is built on — that a workspace declares which apps, which repositories,
-- which database and which agents may be used inside it.
--
-- One row per coupling. The reference is text rather than a foreign key because
-- the four kinds point at four different things and no single column can carry
-- them all: a project by its key (the same key recall scopes on), a repository by
-- its full_name, an app or assistant by its provider id, a database by its
-- project ref. `kind` says how to read `ref`.
create table if not exists public.workspace_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('project','repo','app','assistant','database')),
  ref          text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, kind, ref)
);
comment on table public.workspace_links is
  'Which projects, repositories, apps, assistants and databases a workspace may use. The scope of everything inside it.';
comment on column public.workspace_links.ref is
  'Read according to kind: project=projects.key, repo=project_repos.full_name, app/assistant=provider id, database=supabase project ref.';
create index if not exists workspace_links_ws_idx
  on public.workspace_links (workspace_id, kind, position);
-- Deliberately the same ownership rule as its sibling tables, so the whole set
-- changes together rather than half of it. Moving these from ownership to
-- workspace membership — so a second person in workspace_team can actually read
-- what the workspace holds — is one change across workspace_links, _phases,
-- _tasks, _catch and _team, and it is already on the list.
alter table public.workspace_links enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_links'
      and policyname = 'workspace_links_own'
  ) then
    create policy workspace_links_own on public.workspace_links
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
