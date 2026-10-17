-- §35 observability (A12-3). Additive: one telemetry table and one read-only
-- snapshot function behind the owner-only ops view (/admin/alerts).
--
-- recall_events: one row per recall (latency, outcome, result count). No
-- question text, no memory ids, no user id: it measures the service, not the
-- person. Written by api-v1, mcp-server and context-pack; service role only.
create table if not exists public.recall_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  surface text not null check (surface in ('api', 'mcp', 'context_pack')),
  ms integer not null check (ms >= 0),
  embed_ms integer check (embed_ms >= 0),
  ok boolean not null,
  results integer,
  semantic boolean,
  error_code text
);
create index if not exists recall_events_at_idx on public.recall_events (at desc);
alter table public.recall_events enable row level security;
revoke all on public.recall_events from public, anon, authenticated;
comment on table public.recall_events is 'Recall telemetry (A12-3): latency/outcome per call, nothing personal. Service role only; kept 30 days.';

-- ops_health_snapshot: every §35 signal the database can see, as one jsonb.
-- Counts and timings only, never content.
create or replace function public.ops_health_snapshot()
returns jsonb
language sql
stable
security definer  -- reads auth.users for the orphan check; executable by service_role only
set search_path = public, pg_catalog
as $$
with
cap as (
  select status, created_at, (timings->>'total_ms')::numeric as ms
  from capture_events where created_at > now() - interval '7 days'
),
cap_win as (
  select w.label,
         count(c.*) as total,
         count(c.*) filter (where c.status in ('stored', 'indexed', 'duplicate')) as ok,
         count(c.*) filter (where c.status = 'failed') as failed,
         count(c.*) filter (where c.status = 'duplicate') as duplicate,
         percentile_cont(0.5) within group (order by c.ms) as p50,
         percentile_cont(0.95) within group (order by c.ms) as p95
  from (values ('24h', interval '24 hours'), ('7d', interval '7 days')) w(label, span)
  left join cap c on c.created_at > now() - w.span
  group by w.label
),
rec_win as (
  select w.label,
         count(r.*) as total,
         count(r.*) filter (where not r.ok) as errors,
         count(r.*) filter (where r.ok and r.results = 0) as empty,
         percentile_cont(0.5) within group (order by r.ms) as p50,
         percentile_cont(0.95) within group (order by r.ms) as p95,
         percentile_cont(0.5) within group (order by r.embed_ms) as embed_p50
  from (values ('24h', interval '24 hours'), ('7d', interval '7 days')) w(label, span)
  left join recall_events r on r.at > now() - w.span
  group by w.label
)
select jsonb_build_object(
  'generated_at', now(),
  'capture', (select jsonb_object_agg(label, jsonb_build_object(
      'total', total, 'ok', ok, 'failed', failed, 'duplicate', duplicate,
      'success_rate', case when total > 0 then round(ok::numeric / total, 4) end,
      'p50_ms', round(p50), 'p95_ms', round(p95))) from cap_win),
  'capture_recent_failures', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
      select jsonb_build_object('at', created_at, 'stage', stage, 'code', error_code, 'channel', channel, 'retryable', retryable) x
      from capture_events where status = 'failed' order by created_at desc limit 5) f),
  'recall', (select jsonb_object_agg(label, jsonb_build_object(
      'total', total, 'errors', errors, 'empty', empty,
      'error_rate', case when total > 0 then round(errors::numeric / total, 4) end,
      'p50_ms', round(p50), 'p95_ms', round(p95), 'embed_p50_ms', round(embed_p50))) from rec_win),
  'recall_by_surface_24h', (select coalesce(jsonb_object_agg(surface, n), '{}') from (
      select surface, count(*) n from recall_events where at > now() - interval '24 hours' group by surface) s),
  'queues', jsonb_build_object(
      'capture_stuck', (select count(*) from capture_events where status in ('received', 'in_progress') and updated_at < now() - interval '10 minutes'),
      'indexing_backlog', (select count(*) from memory_items m where m.retired_at is null and m.created_at < now() - interval '15 minutes'
                             and not exists (select 1 from memory_embeddings e where e.memory_item_id = m.id)),
      'alerts_undelivered', (select count(*) from system_alerts where not notified),
      'outbound_http_pending', (select count(*) from net.http_request_queue)),
  'connectors', (select jsonb_build_object(
      'total', count(*),
      'connected', count(*) filter (where status = 'connected'),
      'failing', count(*) filter (where consecutive_failures > 0),
      'stale_24h', count(*) filter (where status = 'connected' and (last_synced_at is null or last_synced_at < now() - interval '24 hours')))
    from source_connections),
  'deletion', jsonb_build_object(
      'lifecycle_ops_7d', (select coalesce(jsonb_object_agg(op, n), '{}') from (
          select op, count(*) n from memory_lifecycle_events where created_at > now() - interval '7 days' group by op) o),
      -- Rows whose owner no longer exists: a delete that did not finish. Must be 0.
      'orphans', jsonb_build_object(
          'memory_items', (select count(*) from memory_items m where not exists (select 1 from auth.users u where u.id = m.user_id)),
          'api_keys', (select count(*) from api_keys k where not exists (select 1 from auth.users u where u.id = k.user_id)),
          'source_connections', (select count(*) from source_connections s where not exists (select 1 from auth.users u where u.id = s.user_id)),
          'profiles', (select count(*) from profiles p where not exists (select 1 from auth.users u where u.id = p.id)))),
  'billing', jsonb_build_object(
      'events_30d', (select coalesce(jsonb_object_agg(coalesce(outcome, 'claimed'), n), '{}') from (
          select outcome, count(*) n from stripe_events where processed_at > now() - interval '30 days' group by outcome) b),
      'last_event_at', (select max(processed_at) from stripe_events),
      'attention_open', (select count(*) from system_alerts where alert_type = 'billing_attention' and not notified)),
  'alerts_24h', (select coalesce(jsonb_object_agg(alert_type, n), '{}') from (
      select alert_type, count(*) n from system_alerts where created_at > now() - interval '24 hours' group by alert_type) a),
  'embedding_spend_today_usd', (select round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4) from embedding_usage_daily where day = current_date)
);
$$;
revoke all on function public.ops_health_snapshot() from public, anon, authenticated;
grant execute on function public.ops_health_snapshot() to service_role;
comment on function public.ops_health_snapshot() is '§35 ops snapshot (A12-3): counts and timings only. Service role only; served to the owner by ops-health.';
