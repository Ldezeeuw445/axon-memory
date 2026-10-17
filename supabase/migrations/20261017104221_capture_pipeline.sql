-- A2-1: observable capture pipeline.
-- Additive only. New table capture_events (one row per capture attempt, with
-- the stage it reached), a provenance guard on memory_items (fills origin_key
-- from source_type when a writer leaves it empty, then requires it; prod has
-- 0 rows without it, so validation changes no data), a health function and a
-- daily payload prune.

create table if not exists public.capture_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  memory_id        uuid references public.memory_items(id) on delete set null,
  idempotency_key  text,
  channel          text not null,
  client_label     text,
  api_key_id       uuid references public.api_keys(id) on delete set null,
  status           text not null default 'received',
  stage            text not null default 'receive',
  error            text,
  error_code       text,
  retryable        boolean not null default false,
  attempts         integer not null default 1,
  payload          jsonb,
  timings          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint capture_events_channel check (channel in ('mcp', 'rest', 'app', 'offline', 'api', 'connector')),
  constraint capture_events_status  check (status in ('received', 'stored', 'indexed', 'failed', 'duplicate')),
  constraint capture_events_stage   check (stage in ('receive', 'normalize', 'classify', 'dedupe', 'store', 'link', 'index', 'done')),
  constraint capture_events_key_len check (idempotency_key is null or char_length(idempotency_key) between 8 and 200),
  constraint capture_events_err_len check (error is null or char_length(error) <= 1000),
  constraint capture_events_attempts check (attempts between 1 and 100),
  -- A failed attempt keeps its payload so it can be retried; a successful one does not keep a second copy of the memory.
  constraint capture_events_payload_only_when_failed check (payload is null or status in ('failed', 'received'))
);
comment on table public.capture_events is
  'A2-1: one row per capture attempt (capture -> normalize -> classify -> dedupe -> store -> link -> index). Failed rows keep the normalized payload for retry until pruned after 30 days.';

create unique index if not exists capture_events_idem on public.capture_events (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists capture_events_user_time on public.capture_events (user_id, created_at desc);
create index if not exists capture_events_open on public.capture_events (user_id, status) where status in ('failed', 'received');
create index if not exists capture_events_memory on public.capture_events (memory_id) where memory_id is not null;

alter table public.capture_events enable row level security;
-- Owners can see their own captures (incl. failures). All writes go through the service role.
drop policy if exists capture_events_owner_read on public.capture_events;
create policy capture_events_owner_read on public.capture_events for select to authenticated using (user_id = auth.uid());
revoke all on public.capture_events from anon;
revoke insert, update, delete, truncate on public.capture_events from authenticated;
grant select on public.capture_events to authenticated;
grant all on public.capture_events to service_role;

-- ── Provenance is mandatory ──────────────────────────────────────────────────
create or replace function public.memory_items_provenance_defaults()
  returns trigger language plpgsql set search_path = public as $$
begin
  if new.origin_key is null or btrim(new.origin_key) = '' then
    new.origin_key := new.source_type;
  end if;
  return new;
end $$;
revoke all on function public.memory_items_provenance_defaults() from public, anon, authenticated;

drop trigger if exists memory_items_provenance_defaults on public.memory_items;
create trigger memory_items_provenance_defaults before insert or update of origin_key, source_type on public.memory_items
  for each row execute function public.memory_items_provenance_defaults();

alter table public.memory_items drop constraint if exists memory_items_provenance_required;
alter table public.memory_items add constraint memory_items_provenance_required
  check (origin_key is not null and char_length(origin_key) between 1 and 64) not valid;
alter table public.memory_items validate constraint memory_items_provenance_required;

-- ── Health: success rate, failures by stage, index backlog, latency ─────────
-- service_role: whole system (or one user); authenticated: own rows via RLS.
create or replace function public.capture_health(p_hours integer default 24, p_user_id uuid default null)
  returns jsonb language sql stable security invoker set search_path = public as $$
  with ev as (
    select * from public.capture_events
    where created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 90)))
      and (p_user_id is null or user_id = p_user_id)
  ), lat as (
    select (timings->>'total_ms')::numeric as ms from ev where timings ? 'total_ms' and status in ('stored', 'indexed')
  )
  select jsonb_build_object(
    'window_hours', greatest(1, least(coalesce(p_hours, 24), 24 * 90)),
    'attempts',  (select count(*) from ev),
    'stored',    (select count(*) from ev where status in ('stored', 'indexed')),
    'indexed',   (select count(*) from ev where status = 'indexed'),
    'duplicates',(select count(*) from ev where status = 'duplicate'),
    'failed',    (select count(*) from ev where status = 'failed'),
    'stuck',     (select count(*) from ev where status = 'received' and updated_at < now() - interval '5 minutes'),
    'success_rate', (select case when count(*) filter (where status <> 'duplicate') = 0 then null
                            else round(count(*) filter (where status in ('stored', 'indexed'))::numeric
                                       / count(*) filter (where status <> 'duplicate'), 4) end from ev),
    'index_backlog', (select count(*) from public.capture_events c
                       where c.status = 'stored' and c.memory_id is not null and (p_user_id is null or c.user_id = p_user_id)),
    'failures_by_stage', coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from ev where status = 'failed' group by stage) s), '{}'::jsonb),
    'latency_ms', jsonb_build_object(
      'p50', (select round(percentile_cont(0.5) within group (order by ms)) from lat),
      'p95', (select round(percentile_cont(0.95) within group (order by ms)) from lat))
  )
$$;
revoke all on function public.capture_health(integer, uuid) from public, anon;
grant execute on function public.capture_health(integer, uuid) to authenticated, service_role;

-- ── Retention: failed payloads are kept 30 days for retry, then dropped ─────
create or replace function public.capture_events_prune()
  returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.capture_events set payload = null, retryable = false, updated_at = now()
    where payload is not null and updated_at < now() - interval '30 days'
    returning 1)
  select count(*)::int from u
$$;
revoke all on function public.capture_events_prune() from public, anon, authenticated;
grant execute on function public.capture_events_prune() to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'capture-events-prune';
    perform cron.schedule('capture-events-prune', '17 3 * * *', 'select public.capture_events_prune()');
  end if;
end
$cron$;
