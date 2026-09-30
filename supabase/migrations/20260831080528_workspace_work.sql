-- Work a workspace has laid out, for whichever agent comes and takes it.
--
-- AXON cannot set an assistant going. An MCP client calls in; the server has no
-- way to call out to it and no way to wake it. So orchestration here can never
-- mean dispatching — it means putting work somewhere an agent will look, and
-- letting whichever one the person opens anyway pick it up. Pulled, never
-- pushed. That is a hard limit of the protocol, not a gap to close later.
--
-- Separate from workspace_tasks on purpose. That is the build list: what this
-- product still needs, kept by a person, ticked as it lands. This is work handed
-- to an agent — it has an assignee, a model, a claim and a result, and it is
-- finished the moment the agent says what it did.
create table if not exists public.workspace_work (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  body         text,

  -- What it is about, read the same way workspace_links reads: a kind, and a
  -- reference meant according to that kind.
  target_kind  text check (target_kind in ('project','repo','app','assistant','database')),
  target_ref   text,

  -- Who should do it, and how. A specific registration when it matters which
  -- one — Claude Code on the machine that can deploy is not the Claude on a
  -- phone — or a role when any of them will do, or neither for anyone.
  assignee_key_id uuid references public.api_keys(id) on delete set null,
  assignee_role   text check (assignee_role in ('architect','builder','reviewer','researcher','qa')),
  -- Free text, the same reasoning as workspace_team.model: a checked list of
  -- other companies' model ids is wrong within a month.
  model        text,

  state        text not null default 'open'
               check (state in ('open', 'claimed', 'done', 'dropped')),
  claimed_by   uuid references public.api_keys(id) on delete set null,
  claimed_at   timestamptz,
  done_at      timestamptz,
  -- What the agent says it actually did. Empty on a task nobody has finished,
  -- and the whole point of the row once somebody has: a queue that cannot
  -- report back is a list of intentions.
  result       text,

  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
comment on table public.workspace_work is
  'Work laid out for an agent to come and take. AXON cannot start anything — this is pulled by whichever assistant the person opens.';
create index if not exists workspace_work_open_idx
  on public.workspace_work (workspace_id, state, position);
alter table public.workspace_work enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workspace_work'
      and policyname = 'workspace_work_own'
  ) then
    create policy workspace_work_own on public.workspace_work
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
