-- A8-1: connector runtime contract.
--
-- Additive only. New nullable/defaulted columns on source_connections so the
-- product can tell "last tried" from "last worked", count a run of failures,
-- and say what the last run actually brought in. No existing column is
-- rewritten: last_synced_at keeps its meaning (set only on a successful run,
-- and the GitHub sync reads it as its forward cursor), so the contract exposes
-- it as last_success_at instead of introducing a second copy.
alter table public.source_connections
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_fetched_count integer,
  add column if not exists last_stored_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_connections_consecutive_failures_nonneg'
      and conrelid = 'public.source_connections'::regclass
  ) then
    alter table public.source_connections
      add constraint source_connections_consecutive_failures_nonneg check (consecutive_failures >= 0);
  end if;
end $$;

comment on column public.source_connections.last_synced_at is
  'Last SUCCESSFUL sync (exposed as last_success_at). Also the GitHub forward cursor. Never set on failure.';
comment on column public.source_connections.last_attempt_at is
  'When a sync last started, whatever its outcome.';
comment on column public.source_connections.last_error_at is
  'When last_error was recorded. Cleared on the next successful run.';
comment on column public.source_connections.consecutive_failures is
  'Failed runs since the last success. Reset to 0 on success or reconnect.';
comment on column public.source_connections.last_fetched_count is
  'Items the provider returned on the last successful run.';
comment on column public.source_connections.last_stored_count is
  'Items newly stored on the last successful run (duplicates excluded).';
