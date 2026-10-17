-- A2-1 capture pipeline schema tests: capture_events shape + RLS, idempotency,
-- payload retention, provenance guard, capture_health, prune, delete paths.
-- One transaction, throwaway fixtures, ROLLBACK — safe against production.
begin;
create temp table t_results (id serial primary key, area text, check_name text, pass boolean, detail text) on commit drop;
create temp table t_fx (k text primary key, v text) on commit drop;
grant all on t_results to authenticated, anon; grant usage on sequence t_results_id_seq to authenticated, anon;
grant select on t_fx to authenticated, anon;

do $seed$
declare u uuid := gen_random_uuid(); o uuid := gen_random_uuid(); tok text := 'capt' || substr(md5(random()::text), 1, 10); m uuid; m2 uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', tok || 'u@rls-test.invalid', '', now(), '{}', '{}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', o, 'authenticated', 'authenticated', tok || 'o@rls-test.invalid', '', now(), '{}', '{}', now(), now());
  -- provenance guard: a writer that leaves origin_key empty gets it filled from source_type
  insert into public.memory_items (user_id, source_type, content_type, content) values (u, 'manual', 'note', 'cap ' || tok) returning id into m;
  insert into public.memory_items (user_id, source_type, content_type, content, origin_key) values (u, 'github', 'commit', 'gh ' || tok, '  ') returning id into m2;
  insert into public.capture_events (user_id, memory_id, idempotency_key, channel, status, stage, timings) values
    (u, m, tok || '-k1', 'mcp', 'indexed', 'done', '{"total_ms": 400}'),
    (u, m2, tok || '-k2', 'rest', 'stored', 'index', '{"total_ms": 900}'),
    (u, null, tok || '-k3', 'offline', 'failed', 'store', '{}'),
    (u, null, null, 'rest', 'failed', 'normalize', '{}'),
    (u, m, null, 'mcp', 'duplicate', 'done', '{}'),
    (o, null, tok || '-k1', 'mcp', 'failed', 'store', '{}');
  update public.capture_events set payload = '{"content":"retry me"}', retryable = true where user_id = u and idempotency_key = tok || '-k3';
  insert into t_fx values ('u', u), ('o', o), ('tok', tok), ('m', m), ('m2', m2);
end
$seed$;

do $as_postgres$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); u uuid := (fx->>'u')::uuid; o uuid := (fx->>'o')::uuid; tok text := fx->>'tok';
        h jsonb; n int; ok boolean; s text;
begin
  select origin_key into s from public.memory_items where id = (fx->>'m')::uuid;
  insert into t_results values (default, 'provenance', 'missing origin_key filled from source_type', s = 'manual', s);
  select origin_key into s from public.memory_items where id = (fx->>'m2')::uuid;
  insert into t_results values (default, 'provenance', 'blank origin_key filled from source_type', s = 'github', s);
  select convalidated into ok from pg_constraint where conname = 'memory_items_provenance_required';
  insert into t_results values (default, 'provenance', 'provenance constraint is validated for every row', ok, ok::text);
  select capture_channel into s from public.memories where id = (fx->>'m')::uuid;
  insert into t_results values (default, 'provenance', 'a direct capture reads as channel direct', s = 'direct', s);

  begin insert into public.capture_events (user_id, idempotency_key, channel) values (u, tok || '-k1', 'mcp');
    insert into t_results values (default, 'idempotency', 'same key twice for one owner refused', false, 'accepted');
  exception when unique_violation then insert into t_results values (default, 'idempotency', 'same key twice for one owner refused', true, '23505'); end;
  select count(*) into n from public.capture_events where idempotency_key = tok || '-k1';
  insert into t_results values (default, 'idempotency', 'same key allowed for a different owner', n = 2, n::text);

  begin insert into public.capture_events (user_id, channel, status, payload) values (u, 'mcp', 'indexed', '{"content":"x"}');
    insert into t_results values (default, 'retention', 'successful capture cannot keep a payload copy', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'retention', 'successful capture cannot keep a payload copy', true, '23514'); end;
  begin insert into public.capture_events (user_id, channel) values (u, 'carrier-pigeon');
    insert into t_results values (default, 'provenance', 'unknown capture channel refused', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'provenance', 'unknown capture channel refused', true, '23514'); end;
  begin insert into public.capture_events (user_id, channel, status) values (null, 'mcp', 'received');
    insert into t_results values (default, 'owner', 'capture without owner refused', false, 'accepted');
  exception when not_null_violation then insert into t_results values (default, 'owner', 'capture without owner refused', true, '23502'); end;

  h := public.capture_health(24, u);
  insert into t_results values (default, 'health', 'counts by status', (h->>'attempts')::int = 5 and (h->>'stored')::int = 2 and (h->>'indexed')::int = 1
    and (h->>'failed')::int = 2 and (h->>'duplicates')::int = 1, h::text);
  insert into t_results values (default, 'health', 'success rate excludes duplicates', (h->>'success_rate')::numeric = 0.5, h->>'success_rate');
  insert into t_results values (default, 'health', 'failures by stage + index backlog', (h->'failures_by_stage'->>'store')::int = 1
    and (h->'failures_by_stage'->>'normalize')::int = 1 and (h->>'index_backlog')::int = 1, h::text);
  insert into t_results values (default, 'health', 'latency percentiles from timings', (h->'latency_ms'->>'p50')::numeric = 650, h->>'latency_ms');

  update public.capture_events set updated_at = now() - interval '31 days' where user_id = u and idempotency_key = tok || '-k3';
  n := public.capture_events_prune();
  select count(*) into n from public.capture_events where user_id = u and payload is not null;
  insert into t_results values (default, 'retention', 'failed payloads older than 30 days are pruned', n = 0, n::text);
  select count(*) into n from cron.job where jobname = 'capture-events-prune';
  insert into t_results values (default, 'retention', 'daily prune job scheduled', n = 1, n::text);
end
$as_postgres$;

-- As user u (authenticated)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from t_fx where k = 'u'), 'role', 'authenticated')::text, true);
do $as_u$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); u uuid := (fx->>'u')::uuid; o uuid := (fx->>'o')::uuid; n int; h jsonb;
begin
  select count(*) into n from public.capture_events where user_id = u;
  insert into t_results values (default, 'rls', 'owner reads own captures (incl. failures)', n = 5, n::text);
  select count(*) into n from public.capture_events where user_id = o;
  insert into t_results values (default, 'rls', 'owner cannot read another account''s captures', n = 0, n::text);
  h := public.capture_health(24, o);
  insert into t_results values (default, 'rls', 'capture_health for another account shows nothing', (h->>'attempts')::int = 0, h->>'attempts');
  h := public.capture_health(24, null);
  insert into t_results values (default, 'rls', 'capture_health unscoped = own only', (h->>'attempts')::int = 5, h->>'attempts');
  begin insert into public.capture_events (user_id, channel) values (u, 'app');
    insert into t_results values (default, 'rls', 'owner cannot forge capture events', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'rls', 'owner cannot forge capture events', true, '42501'); end;
  begin update public.capture_events set status = 'indexed' where user_id = u;
    get diagnostics n = row_count;
    insert into t_results values (default, 'rls', 'owner cannot rewrite capture history', n = 0, n::text);
  exception when insufficient_privilege then insert into t_results values (default, 'rls', 'owner cannot rewrite capture history', true, '42501'); end;
  begin perform public.capture_events_prune();
    insert into t_results values (default, 'privileges', 'prune not callable by users', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'privileges', 'prune not callable by users', true, '42501'); end;
end
$as_u$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $as_anon$
declare n int;
begin
  begin select count(*) into n from public.capture_events;
    insert into t_results values (default, 'rls', 'anon reads no captures', n = 0, n::text);
  exception when insufficient_privilege then insert into t_results values (default, 'rls', 'anon reads no captures', true, '42501'); end;
  begin perform public.capture_health(24, null);
    insert into t_results values (default, 'privileges', 'capture_health not callable by anon', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'privileges', 'capture_health not callable by anon', true, '42501'); end;
end
$as_anon$;
reset role;

-- Delete paths: deleting a memory unlinks its captures; deleting the account removes them.
do $deletes$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); u uuid := (fx->>'u')::uuid; n int;
begin
  perform public.memory_delete((fx->>'m')::uuid, 'test', u);
  select count(*) into n from public.capture_events where memory_id = (fx->>'m')::uuid;
  insert into t_results values (default, 'delete', 'deleting a memory unlinks its capture events', n = 0, n::text);
  delete from auth.users where id = u;
  select count(*) into n from public.capture_events where user_id = u;
  insert into t_results values (default, 'delete', 'account deletion removes its capture events', n = 0, n::text);
end
$deletes$;

select area, check_name, pass, 'schema' as severity, detail from t_results order by id;
rollback;
