-- Who does what, and on which model.
--
-- Roles are the orchestration: an assistant told it is reviewing behaves
-- differently from one told it is building, and that difference is the whole
-- reason to have more than one. The model is per app because they are not
-- interchangeable — the one you want reading a diff is not the one you want
-- drafting a spec, and the choice belongs to the person, not to us.
--
-- Deliberately no list of valid models. Naming other companies' model ids in a
-- constraint means being wrong within a month, and a dropdown that offers a
-- model that no longer exists is worse than a field somebody fills in once.

create table if not exists public.workspace_team (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  agent_key    text not null,
  role         text check (role in ('architect','builder','reviewer','researcher','qa')),
  model        text,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, agent_key)
);
comment on table public.workspace_team is
  'The assistants in a workspace, what each one is for, and which model it should run. Read by the chat when it writes a brief, and by any agent that asks what its job here is.';
comment on column public.workspace_team.model is
  'Free text on purpose. A checked list of other companies'' model ids is wrong within a month.';
create index if not exists workspace_team_ws_idx on public.workspace_team (workspace_id, position);
alter table public.workspace_team enable row level security;
create policy workspace_team_own on public.workspace_team
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
