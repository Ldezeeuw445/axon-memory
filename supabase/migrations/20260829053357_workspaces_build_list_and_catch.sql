-- A workspace is the thing a team stands in: projects, agents, one build list,
-- one catch box, and the three documents that tell an assistant how this place
-- works. Everything here belongs to exactly one account and is unreadable to
-- anybody else.

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  name        text not null,
  colour      text not null default '#ffb733',
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);
comment on table public.workspaces is
  'A place a team works. Carries its own build list, catch box and instruction documents, so an assistant that connects knows where it is without being told.';

-- A phase is a letter and a colour. The letter is what an agent types when it
-- reports work; the colour is what a person recognises at a glance.
create table if not exists public.workspace_phases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  code         text not null check (code ~ '^[A-Z]{1,2}$'),
  title        text not null,
  note         text,
  colour       text not null default '#8d8a83',
  position     int  not null default 0,
  unique (workspace_id, code)
);

create table if not exists public.workspace_tasks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  phase_code   text not null,
  number       int  not null,
  code         text generated always as (phase_code || number::text) stored,
  title        text not null,
  body         text,
  tag          text check (tag in ('broken','yours','later','done')),
  value        int  not null default 2 check (value between 1 and 3),
  effort       int  not null default 2 check (effort between 1 and 3),
  blocked_by   text,
  built        boolean not null default false,
  tested       boolean not null default false,
  built_at     timestamptz,
  built_by     text,
  tested_at    timestamptz,
  tested_by    text,
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, phase_code, number)
);
comment on column public.workspace_tasks.tested is
  'Measured, not merely built. A green build is not a test — whoever ticks this saw it work.';

-- The catch box. Everything said, including what looks like nothing: an idea
-- that lives only in a conversation is an idea its owner has already lost.
create table if not exists public.workspace_catch (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  body         text,
  said         text,
  state        text not null default 'open' check (state in ('open','half','done')),
  task_code    text,
  source       text,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);

create table if not exists public.workspace_docs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (name in ('AGENTS.md','ECOSYSTEM.md','ARTIFACT.md')),
  content      text not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, name)
);

-- One row per thing worth telling somebody about. Written by a trigger rather
-- than by whoever ticked the box, so an agent working over MCP produces the
-- same notification a person does.
create table if not exists public.workspace_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('built','tested','complete','unbuilt','untested','catch','task')),
  task_code    text,
  title        text,
  actor        text,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);

create index if not exists workspace_tasks_ws_idx  on public.workspace_tasks (workspace_id, phase_code, number);
create index if not exists workspace_catch_ws_idx  on public.workspace_catch (workspace_id, created_at desc);
create index if not exists workspace_events_ws_idx on public.workspace_events (workspace_id, created_at desc);
create index if not exists workspace_events_unseen on public.workspace_events (user_id, created_at desc) where seen_at is null;

-- ── Row level security ──────────────────────────────────────────────────────
alter table public.workspaces        enable row level security;
alter table public.workspace_phases  enable row level security;
alter table public.workspace_tasks   enable row level security;
alter table public.workspace_catch   enable row level security;
alter table public.workspace_docs    enable row level security;
alter table public.workspace_events  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_phases','workspace_tasks',
                           'workspace_catch','workspace_docs','workspace_events']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;
end $$;

-- ── Notifications come from the data, not from the caller ───────────────────
create or replace function public.workspace_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.workspace_events (workspace_id, user_id, kind, task_code, title, actor)
    values (new.workspace_id, new.user_id, 'task', new.code, new.title, coalesce(new.built_by, 'you'));
    return new;
  end if;

  if new.built and not old.built then
    new.built_at := now();
    insert into public.workspace_events (workspace_id, user_id, kind, task_code, title, actor)
    values (new.workspace_id, new.user_id,
            case when new.tested then 'complete' else 'built' end,
            new.code, new.title, coalesce(new.built_by, 'you'));
  elsif old.built and not new.built then
    new.built_at := null;
    insert into public.workspace_events (workspace_id, user_id, kind, task_code, title, actor)
    values (new.workspace_id, new.user_id, 'unbuilt', new.code, new.title, coalesce(new.built_by, 'you'));
  end if;

  if new.tested and not old.tested then
    new.tested_at := now();
    insert into public.workspace_events (workspace_id, user_id, kind, task_code, title, actor)
    values (new.workspace_id, new.user_id,
            case when new.built then 'complete' else 'tested' end,
            new.code, new.title, coalesce(new.tested_by, 'you'));
  elsif old.tested and not new.tested then
    new.tested_at := null;
    insert into public.workspace_events (workspace_id, user_id, kind, task_code, title, actor)
    values (new.workspace_id, new.user_id, 'untested', new.code, new.title, coalesce(new.tested_by, 'you'));
  end if;

  return new;
end $$;

drop trigger if exists workspace_task_event on public.workspace_tasks;
create trigger workspace_task_event
  before insert or update of built, tested on public.workspace_tasks
  for each row execute function public.workspace_task_event();

create or replace function public.workspace_catch_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_events (workspace_id, user_id, kind, title, actor)
  values (new.workspace_id, new.user_id, 'catch', new.title, coalesce(new.source, 'you'));
  return new;
end $$;

drop trigger if exists workspace_catch_event on public.workspace_catch;
create trigger workspace_catch_event
  after insert on public.workspace_catch
  for each row execute function public.workspace_catch_event();

-- ── Progress, as two percentages ────────────────────────────────────────────
create or replace view public.workspace_progress
with (security_invoker = true) as
select
  w.id as workspace_id,
  w.user_id,
  coalesce(t.total, 0)                                        as tasks,
  coalesce(t.built, 0)                                        as tasks_built,
  coalesce(t.tested, 0)                                       as tasks_tested,
  case when coalesce(t.total,0) = 0 then 0
       else round((t.built + t.tested)::numeric / (t.total * 2) * 100) end as build_pct,
  coalesce(c.total, 0)                                        as catch_total,
  coalesce(c.done, 0)                                         as catch_done,
  case when coalesce(c.total,0) = 0 then 0
       else round(c.done::numeric / c.total * 100) end        as catch_pct
from public.workspaces w
left join (
  select workspace_id,
         count(*)                          as total,
         count(*) filter (where built)     as built,
         count(*) filter (where tested)    as tested
  from public.workspace_tasks group by workspace_id
) t on t.workspace_id = w.id
left join (
  select workspace_id,
         count(*)                                             as total,
         count(*) filter (where state = 'done')               as done
  from public.workspace_catch group by workspace_id
) c on c.workspace_id = w.id;
