-- Cost ceiling / circuit breaker for embedding generation (Gemini API calls).
-- Tracks estimated spend per day (global + per-user) and per month (global),
-- so a bug, a runaway sync loop, or a single abusive account can't run up an
-- unbounded bill. Enforcement happens in the embeddings edge function code
-- (_shared/embeddings.ts); this migration just provides the atomic counters
-- it reads/writes and a place to log a one-time alert when a cap trips.

create table if not exists embedding_usage_daily (
  day date primary key default current_date,
  total_chars bigint not null default 0,
  total_calls integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  alerted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists embedding_usage_daily_user (
  day date not null default current_date,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_chars bigint not null default 0,
  total_calls integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  alerted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);

create table if not exists embedding_usage_monthly (
  month date primary key default date_trunc('month', current_date)::date,
  total_chars bigint not null default 0,
  total_calls integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  alerted boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table embedding_usage_daily enable row level security;
alter table embedding_usage_daily_user enable row level security;
alter table embedding_usage_monthly enable row level security;
alter table system_alerts enable row level security;

revoke all on embedding_usage_daily from public, anon, authenticated;
revoke all on embedding_usage_daily_user from public, anon, authenticated;
revoke all on embedding_usage_monthly from public, anon, authenticated;
revoke all on system_alerts from public, anon, authenticated;
grant all on embedding_usage_daily to service_role;
grant all on embedding_usage_daily_user to service_role;
grant all on embedding_usage_monthly to service_role;
grant all on system_alerts to service_role;

-- Cheap read used before an embedding call: returns today's / this month's
-- running totals so the caller can decide whether to proceed. Upserts a
-- zero row first so callers never have to special-case "no row yet".
create or replace function get_embedding_usage_today(p_user_id uuid)
returns table (
  global_cost_usd numeric,
  global_alerted boolean,
  user_cost_usd numeric,
  user_alerted boolean,
  month_cost_usd numeric,
  month_alerted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into embedding_usage_daily (day) values (current_date)
  on conflict (day) do nothing;

  insert into embedding_usage_daily_user (day, user_id) values (current_date, p_user_id)
  on conflict (day, user_id) do nothing;

  insert into embedding_usage_monthly (month) values (date_trunc('month', current_date)::date)
  on conflict (month) do nothing;

  return query
  select d.estimated_cost_usd, d.alerted,
         u.estimated_cost_usd, u.alerted,
         m.estimated_cost_usd, m.alerted
  from embedding_usage_daily d
  join embedding_usage_daily_user u on u.day = d.day and u.user_id = p_user_id
  join embedding_usage_monthly m on m.month = date_trunc('month', current_date)::date
  where d.day = current_date;
end;
$$;

revoke all on function get_embedding_usage_today(uuid) from public, anon, authenticated;
grant execute on function get_embedding_usage_today(uuid) to service_role;

-- Called after a successful embedding call to record the spend.
create or replace function record_embedding_usage(p_user_id uuid, p_chars integer, p_cost_usd numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into embedding_usage_daily (day, total_chars, total_calls, estimated_cost_usd)
  values (current_date, p_chars, 1, p_cost_usd)
  on conflict (day) do update set
    total_chars = embedding_usage_daily.total_chars + p_chars,
    total_calls = embedding_usage_daily.total_calls + 1,
    estimated_cost_usd = embedding_usage_daily.estimated_cost_usd + p_cost_usd,
    updated_at = now();

  insert into embedding_usage_daily_user (day, user_id, total_chars, total_calls, estimated_cost_usd)
  values (current_date, p_user_id, p_chars, 1, p_cost_usd)
  on conflict (day, user_id) do update set
    total_chars = embedding_usage_daily_user.total_chars + p_chars,
    total_calls = embedding_usage_daily_user.total_calls + 1,
    estimated_cost_usd = embedding_usage_daily_user.estimated_cost_usd + p_cost_usd,
    updated_at = now();

  insert into embedding_usage_monthly (month, total_chars, total_calls, estimated_cost_usd)
  values (date_trunc('month', current_date)::date, p_chars, 1, p_cost_usd)
  on conflict (month) do update set
    total_chars = embedding_usage_monthly.total_chars + p_chars,
    total_calls = embedding_usage_monthly.total_calls + 1,
    estimated_cost_usd = embedding_usage_monthly.estimated_cost_usd + p_cost_usd,
    updated_at = now();
end;
$$;

revoke all on function record_embedding_usage(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function record_embedding_usage(uuid, integer, numeric) to service_role;

-- Marks a cap as alerted-on (so we log one alert per scope per day/month,
-- not one per skipped call) and inserts the alert row.
create or replace function trip_embedding_alert(p_scope text, p_user_id uuid, p_message text, p_metadata jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_scope = 'global' then
    update embedding_usage_daily set alerted = true where day = current_date and alerted = false;
  elsif p_scope = 'user' then
    update embedding_usage_daily_user set alerted = true where day = current_date and user_id = p_user_id and alerted = false;
  elsif p_scope = 'month' then
    update embedding_usage_monthly set alerted = true where month = date_trunc('month', current_date)::date and alerted = false;
  end if;

  if found then
    insert into system_alerts (alert_type, message, metadata)
    values ('embedding_cost_cap_' || p_scope, p_message, p_metadata);
  end if;
end;
$$;

revoke all on function trip_embedding_alert(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function trip_embedding_alert(text, uuid, text, jsonb) to service_role;
