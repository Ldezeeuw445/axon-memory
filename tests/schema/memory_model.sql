-- A1-1 schema tests: the canonical Memory model (migration 20261017101016) and
-- the TS contract in supabase/functions/_shared/domain.ts agree.
-- One transaction, throwaway fixtures, ROLLBACK — safe against production.
-- Output rows: area, check_name, pass, detail.  Run: node scripts/sql-suite.mjs tests/schema/memory_model.sql
begin;
create temp table t_results (id serial primary key, area text, check_name text, pass boolean, detail text) on commit drop;
create temp table t_fx (k text primary key, v text) on commit drop;
grant all on t_results to authenticated, anon; grant usage on sequence t_results_id_seq to authenticated, anon;
grant select on t_fx to authenticated, anon;

-- 1. Contract shape: view columns == MEMORY_VIEW_COLUMNS / THREAD_VIEW_COLUMNS (domain.ts)
insert into t_results (area, check_name, pass, detail)
select 'shape', 'memories columns match domain.ts', got = want, got
from (select string_agg(column_name, ',' order by ordinal_position) got from information_schema.columns
      where table_schema = 'public' and table_name = 'memories') g,
     (select 'id,owner_id,title,content,normalized_content,content_type,source_type,source_id,source_application,source_connection_id,api_key_id,capture_channel,source_at,created_at,updated_at,thread_id,facets,entities,confidence,lifecycle_state,retired_at,retired_reason,superseded_by,anchored_weight,recall_clients,recall_count,link_count,weight,depth,has_embedding'::text want) w;
insert into t_results (area, check_name, pass, detail)
select 'shape', 'threads columns match domain.ts', got = 'id,owner_id,key,name,colour,created_at,state,state_updated_by,state_updated_at,active_memories', got
from (select string_agg(column_name, ',' order by ordinal_position) got from information_schema.columns
      where table_schema = 'public' and table_name = 'threads') g;
insert into t_results (area, check_name, pass, detail)
select 'shape', 'views are security_invoker', bool_and(coalesce(reloptions::text, '') ~ 'security_invoker=(on|true)'), string_agg(relname || ':' || coalesce(reloptions::text, '-'), ' ')
from pg_class where relnamespace = 'public'::regnamespace and relname in ('memories', 'threads');
insert into t_results (area, check_name, pass, detail)
select 'shape', 'new tables have RLS', bool_and(relrowsecurity), string_agg(relname, ',')
from pg_class where relnamespace = 'public'::regnamespace and relname in ('memory_relations', 'memory_lifecycle_events');
insert into t_results (area, check_name, pass, detail)
select 'shape', 'anon has no access to new surfaces',
  not (has_table_privilege('anon', 'public.memories', 'select') or has_table_privilege('anon', 'public.threads', 'select')
       or has_table_privilege('anon', 'public.memory_relations', 'select') or has_table_privilege('anon', 'public.memory_lifecycle_events', 'select')
       or has_function_privilege('anon', 'public.core_summary(uuid)', 'execute')), '';

-- 2. Weight / Depth parity with domain.test.ts WEIGHT_CASES / DEPTH_CASES
insert into t_results (area, check_name, pass, detail)
select 'rules', format('memory_weight(%s,%s,%s,%s) = %s', a, c, l, s, want), public.memory_weight(a::smallint, c, l, s) = want,
       public.memory_weight(a::smallint, c, l, s)::text
from (values (null::int,0,0,'github',1),(null,0,0,'manual',2),(null,1,0,'github',2),(null,5,0,'github',3),
             (null,2,3,'manual',5),(null,9,9,'manual',5),(4,0,0,'github',4),(1,9,9,'manual',1)) v(a,c,l,s,want);
insert into t_results (area, check_name, pass, detail)
select 'rules', format('memory_depth(%s days, retired=%s) = %s', d, r, want),
       public.memory_depth(now() - make_interval(days => d), case when r then now() end, now()) = want,
       public.memory_depth(now() - make_interval(days => d), case when r then now() end, now())::text
from (values (0,false,0),(6,false,0),(8,false,1),(40,false,2),(400,false,3),(1,true,3)) v(d,r,want);

-- 3. Fixtures
do $seed$
declare u uuid; o uuid; i1 uuid; i2 uuid; i3 uuid; i4 uuid; p uuid; k uuid; c uuid;
begin
  foreach u in array array[gen_random_uuid(), gen_random_uuid()] loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'schema' || substr(md5(u::text),1,10) || '@rls-test.invalid', '', now(), '{}', '{}', now(), now());
  end loop;
  select id into u from auth.users where email like 'schema%@rls-test.invalid' order by id limit 1;
  select id into o from auth.users where email like 'schema%@rls-test.invalid' and id <> u limit 1;
  insert into public.projects (user_id, key, name) values (u, 'schema-thread', 'Schema thread') returning id into p;
  insert into public.project_threads (user_id, project_id, state) values (u, p, 'mid-way through A1');
  insert into public.api_keys (user_id, name, key_prefix, key_hash) values (u, 'Claude', 'axon_x', md5(random()::text)) returning id into k;
  insert into public.source_connections (user_id, provider, status) values (u, 'github', 'connected') returning id into c;
  -- i1: manual, agent-written, 3 entities, recalled by 2 clients, embedded, in thread → weight 5, depth 0
  insert into public.memory_items (user_id, source_type, content_type, title, content, entities, api_key_id, project_id, facets, origin_key)
    values (u, 'manual', 'note', 'Decision', E'Use   Postgres\nfor everything', '["Postgres","Supabase","AXON"]', k, p, '{development}', 'claude') returning id into i1;
  insert into public.memory_recalls (user_id, memory_item_id, client_key, recall_count) values (u, i1, 'claude', 3), (u, i1, 'cursor', 1);
  insert into public.memory_embeddings (memory_item_id, embedding) values (i1, array_fill(0.1::real, array[1536])::vector);
  -- i2: connector commit, 400 days old → weight 1, depth 3
  insert into public.memory_items (user_id, source_type, content_type, title, content, source_connection_id, external_id, occurred_at)
    values (u, 'github', 'commit', 'fix', 'fix bug', c, 'sha1', now() - interval '400 days') returning id into i2;
  -- i3: retired by user, anchored 4
  insert into public.memory_items (user_id, source_type, content, retired_at, retired_reason, anchored_weight)
    values (u, 'manual', 'old preference', now(), 'user', 4) returning id into i3;
  -- i4: superseded by i1
  insert into public.memory_items (user_id, source_type, content, retired_at, retired_reason, superseded_by)
    values (u, 'manual', 'use MySQL', now(), 'superseded', i1) returning id into i4;
  insert into public.memory_relations (user_id, from_memory_id, to_memory_id, kind, reason) values (u, i1, i4, 'supersedes', 'switched DB');
  insert into public.memory_lifecycle_events (user_id, memory_item_id, op, actor) values (u, i4, 'supersede', 'test');
  insert into public.memory_items (user_id, source_type, content) values (o, 'manual', 'other user secret');
  insert into t_fx values ('u', u), ('o', o), ('i1', i1), ('i2', i2), ('i3', i3), ('i4', i4), ('p', p);
end
$seed$;

-- 4. Constraints reject what the contract rejects
do $c$
declare u uuid := (select v::uuid from t_fx where k = 'u'); i uuid := (select v::uuid from t_fx where k = 'i2');
begin
  begin insert into public.memory_items (user_id, source_type, content, facets) values (u, 'manual', 'x', '{"Bad Facet"}');
    insert into t_results values (default, 'constraint', 'bad facet rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'bad facet rejected', true, sqlstate); end;
  begin insert into public.memory_items (user_id, source_type, content, anchored_weight) values (u, 'manual', 'x', 6);
    insert into t_results values (default, 'constraint', 'anchored_weight 6 rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'anchored_weight 6 rejected', true, sqlstate); end;
  begin insert into public.memory_items (user_id, source_type, content, confidence) values (u, 'manual', 'x', 1.5);
    insert into t_results values (default, 'constraint', 'confidence 1.5 rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'confidence 1.5 rejected', true, sqlstate); end;
  begin update public.memory_items set superseded_by = id, retired_reason = 'superseded', retired_at = now() where id = i;
    insert into t_results values (default, 'constraint', 'self-supersession rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'self-supersession rejected', true, sqlstate); end;
  begin update public.memory_items set superseded_by = (select v::uuid from t_fx where k = 'i1') where id = i;
    insert into t_results values (default, 'constraint', 'superseded_by without reason rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'superseded_by without reason rejected', true, sqlstate); end;
  begin insert into public.memory_relations (user_id, from_memory_id, to_memory_id, kind) values (u, i, i, 'relates');
    insert into t_results values (default, 'constraint', 'self-relation rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'self-relation rejected', true, sqlstate); end;
  begin insert into public.memory_lifecycle_events (user_id, memory_item_id, op) values (u, i, 'archive');
    insert into t_results values (default, 'constraint', 'unknown lifecycle op rejected', false, 'accepted');
  exception when check_violation then insert into t_results values (default, 'constraint', 'unknown lifecycle op rejected', true, sqlstate); end;
end
$c$;

-- 5. View values, as the owner (authenticated, RLS on)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from t_fx where k = 'u'), 'role', 'authenticated')::text, true);
do $v$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); r record; n bigint;
begin
  select * into r from public.memories where id = (fx->>'i1')::uuid;
  insert into t_results values (default, 'view', 'i1 weight=5 depth=0 (manual+2 clients+3 links)', r.weight = 5 and r.depth = 0, r.weight || '/' || r.depth);
  insert into t_results values (default, 'view', 'i1 provenance: agent via claude', r.capture_channel = 'agent' and r.source_application = 'claude', r.capture_channel || '/' || r.source_application);
  insert into t_results values (default, 'view', 'i1 recall signals', r.recall_clients = 2 and r.recall_count = 4 and r.link_count = 3, r.recall_clients || '/' || r.recall_count || '/' || r.link_count);
  insert into t_results values (default, 'view', 'i1 normalized_content', r.normalized_content = 'decision use postgres for everything', r.normalized_content);
  insert into t_results values (default, 'view', 'i1 has_embedding + thread + facets', r.has_embedding and r.thread_id = (fx->>'p')::uuid and r.facets = '{development}', '');
  insert into t_results values (default, 'view', 'i1 lifecycle active', r.lifecycle_state = 'active', r.lifecycle_state);
  select * into r from public.memories where id = (fx->>'i2')::uuid;
  insert into t_results values (default, 'view', 'i2 connector commit weight=1 depth=3', r.weight = 1 and r.depth = 3 and r.capture_channel = 'connector' and r.source_id = 'sha1', r.weight || '/' || r.depth || '/' || r.capture_channel);
  select * into r from public.memories where id = (fx->>'i3')::uuid;
  insert into t_results values (default, 'view', 'i3 retired, anchored weight 4, depth 3', r.lifecycle_state = 'retired' and r.weight = 4 and r.depth = 3, r.lifecycle_state || '/' || r.weight || '/' || r.depth);
  select * into r from public.memories where id = (fx->>'i4')::uuid;
  insert into t_results values (default, 'view', 'i4 superseded by i1, previous state kept', r.lifecycle_state = 'superseded' and r.superseded_by = (fx->>'i1')::uuid and r.content = 'use MySQL', r.lifecycle_state);
  select * into r from public.threads where id = (fx->>'p')::uuid;
  insert into t_results values (default, 'view', 'thread state + active count', r.state = 'mid-way through A1' and r.active_memories = 1, coalesce(r.state, '-') || '/' || r.active_memories);
  select * into r from public.core_summary();
  insert into t_results values (default, 'view', 'core_summary counts', r.memories = 4 and r.active = 2 and r.retired = 1 and r.superseded = 1 and r.threads = 1 and r.facets = '{development}', r.memories || '/' || r.active || '/' || r.retired || '/' || r.superseded || '/' || r.threads);
  select * into r from public.core_summary((fx->>'o')::uuid);
  insert into t_results values (default, 'isolation', 'core_summary(other) still answers for caller', r.owner_id = (fx->>'u')::uuid and r.memories = 4, r.owner_id::text);
  select count(*) into n from public.memories where owner_id = (fx->>'o')::uuid;
  insert into t_results values (default, 'isolation', 'memories view hides other user', n = 0, n::text);
  select count(*) into n from public.memory_relations; insert into t_results values (default, 'view', 'own relation visible', n = 1, n::text);
  select count(*) into n from public.memory_lifecycle_events; insert into t_results values (default, 'view', 'own event visible', n = 1, n::text);
end
$v$;
select set_config('request.jwt.claims', json_build_object('sub', (select v from t_fx where k = 'o'), 'role', 'authenticated')::text, true);
do $o$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); n bigint;
begin
  select count(*) into n from public.memory_relations; insert into t_results values (default, 'isolation', 'other user sees no relations', n = 0, n::text);
  select count(*) into n from public.memory_lifecycle_events; insert into t_results values (default, 'isolation', 'other user sees no events', n = 0, n::text);
  select count(*) into n from public.threads where owner_id = (fx->>'u')::uuid; insert into t_results values (default, 'isolation', 'other user sees no threads of u', n = 0, n::text);
  begin
    insert into public.memory_relations (user_id, from_memory_id, to_memory_id, kind) values ((fx->>'o')::uuid, (fx->>'i1')::uuid, (fx->>'i2')::uuid, 'relates');
    insert into t_results values (default, 'isolation', 'other user cannot relate u''s memories', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'isolation', 'other user cannot relate u''s memories', true, sqlstate); end;
end
$o$;
reset role;

select area, check_name, pass, 'schema' as severity, detail from t_results order by pass, id;
rollback;
