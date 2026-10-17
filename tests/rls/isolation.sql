-- AXON Memory — adversarial tenant-isolation suite (spec §17, task A5-1).
--
-- Proves user A cannot read (or write into) user B's data through direct rows,
-- views, joins, RPC/functions, semantic recall, Threads, relationships
-- (entities/entity_links), storage, and — as the anonymous role — anything.
--
-- SAFE TO RUN AGAINST PRODUCTION: everything happens inside ONE transaction that
-- ends in ROLLBACK. Two throwaway auth users are created inside it, every
-- fixture row belongs to them, and nothing survives the run. No real user row is
-- read into the results (only counts of rows that match the fixtures' ids).
--
-- Run:  node scripts/rls-isolation.mjs        (needs SUPABASE_DB_URL)
--   or  paste into the Supabase SQL editor / MCP execute_sql as one script.
--
-- Output: one row per check: area, check_name, pass, severity, detail.
--   severity 'leak'      → a tenant-isolation failure. RELEASE BLOCKER.
--   severity 'integrity' → A can write rows pointing at B's objects (no read).
--   severity 'hygiene'   → privilege hygiene (e.g. anon EXECUTE on SECDEF fns).
--   severity 'control'   → positive control; proves the suite is not vacuous.

begin;

create temp table rls_results (
  id serial primary key, area text, check_name text, pass boolean, severity text, detail text
) on commit drop;
create temp table rls_fx (k text primary key, v text) on commit drop;
grant all on rls_results to anon, authenticated;
grant usage on sequence rls_results_id_seq to anon, authenticated;
grant select on rls_fx to anon, authenticated;

-- ───────────────────────────── fixtures (as postgres) ─────────────────────────────
do $seed$
declare
  u uuid; t text; who text;
  v_proj uuid; v_conn uuid; v_item1 uuid; v_item2 uuid; v_key uuid; v_ws uuid; v_ent uuid;
  v_vec text;
begin
  insert into public.oauth_clients (client_id, client_name, created_via)
  values ('rls-test-client-' || substr(md5(random()::text), 1, 8), 'RLS test client', 'manual')
  returning client_id into t;
  insert into rls_fx values ('client', t);

  foreach who in array array['a','b'] loop
    u := gen_random_uuid();
    t := 'rlscanary' || who || substr(md5(u::text), 1, 12);   -- one tsquery-friendly token
    insert into rls_fx values (who, u::text), ('t' || who, t);

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
            t || '@rls-test.invalid', '', now(), '{"provider":"email"}', '{}', now(), now());

    update public.profiles set full_name = t where id = u;

    insert into public.projects (user_id, key, name) values (u, 'rls-' || who || substr(t, 11, 8), t)
      returning id into v_proj;
    insert into public.source_connections (user_id, provider, status, external_account_label, access_token_encrypted)
      values (u, 'github', 'connected', t, 'enc-' || t) returning id into v_conn;
    insert into public.memory_items (user_id, source_type, content_type, title, content, entities, project_id, source_connection_id, external_id)
      values (u, 'github', 'commit', 'Title ' || t, 'secret content ' || t, jsonb_build_array('Ent ' || t, 'Common Topic'), v_proj, v_conn, 'ext1-' || t)
      returning id into v_item1;
    insert into public.memory_items (user_id, source_type, content_type, title, content, entities, origin_key)
      values (u, 'manual', 'note', 'Note ' || t, 'note body ' || t, jsonb_build_array('Ent ' || t, 'Common Topic'), 'notes')
      returning id into v_item2;
    select '[' || string_agg(round(random()::numeric, 5)::text, ',') || ']' into v_vec from generate_series(1, 1536);
    insert into public.memory_embeddings (memory_item_id, embedding) values (v_item1, v_vec::vector);
    insert into rls_fx values (who || '_vec', v_vec);
    insert into public.memory_facts (user_id, statement, category, source_item_ids, project_id)
      values (u, 'fact ' || t, 'decision', array[v_item1], v_proj);
    insert into public.memory_recalls (user_id, memory_item_id, client_key, client_label)
      values (u, v_item1, 'claude', t);
    insert into public.api_keys (user_id, name, key_prefix, key_hash)
      values (u, t, 'axon_rlstest', md5(t)) returning id into v_key;
    insert into public.context_pack_logs (user_id, api_key_id, query) values (u, v_key, t);
    insert into public.project_threads (user_id, project_id, state) values (u, v_proj, 'thread ' || t);
    insert into public.project_repos (user_id, project_id, full_name) values (u, v_proj, 'rls/' || t);
    insert into public.recall_rules (user_id, adapter_key, source_type) values (u, 'cursor-' || t, 'gmail');
    insert into public.subscriptions (user_id, status, plan, stripe_customer_id) values (u, 'active', 'standard', 'cus_' || t);
    insert into public.embedding_usage_daily_user (day, user_id) values (current_date, u);
    insert into public.oauth_authorization_codes (code_hash, client_id, user_id, redirect_uri, expires_at)
      values (md5('code' || t), (select v from rls_fx where k = 'client'), u, 'https://example.invalid/' || t, now() + interval '5 min');
    insert into public.rate_limit_buckets (api_key_id, window_start) values (v_key, now());

    -- Workspaces go through the real RPC, as that user, so the seeding triggers run.
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    select id into v_ws from public.create_workspace('rls' || who || substr(t, 11, 6), 'WS ' || t, '#ffb733');
    perform set_config('request.jwt.claims', '', true);
    insert into public.workspace_catch (workspace_id, user_id, title) values (v_ws, u, 'catch ' || t);
    insert into public.workspace_links (workspace_id, user_id, kind, ref) values (v_ws, u, 'project', 'rls-' || t);
    insert into public.workspace_team (workspace_id, user_id, agent_key) values (v_ws, u, 'agent-' || t);
    insert into public.workspace_work (workspace_id, user_id, title) values (v_ws, u, 'work ' || t);

    select id into v_ent from public.entities where user_id = u and name = 'Ent ' || t;

    begin
      insert into storage.objects (bucket_id, name, owner) values ('note-files', u::text || '/' || t || '.txt', u);
      insert into rls_fx values (who || '_storage', 'yes');
    exception when others then
      insert into rls_fx values (who || '_storage', 'no: ' || sqlerrm);
    end;

    insert into rls_fx values
      (who || '_proj', v_proj), (who || '_conn', v_conn), (who || '_item1', v_item1),
      (who || '_item2', v_item2), (who || '_key', v_key), (who || '_ws', v_ws), (who || '_ent', v_ent);
  end loop;
end
$seed$;

-- ─────────────────────────── as user A (authenticated) ───────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from rls_fx where k = 'a'), 'role', 'authenticated')::text, true);

do $as_a$
declare
  fx jsonb := (select jsonb_object_agg(k, v) from rls_fx);
  a uuid := (fx->>'a')::uuid;
  b uuid := (fx->>'b')::uuid;
  needle_b text := concat_ws('|', fx->>'b', fx->>'tb', fx->>'b_item1', fx->>'b_item2', fx->>'b_proj',
                             fx->>'b_conn', fx->>'b_key', fx->>'b_ws', fx->>'b_ent');
  r record; n bigint; ok boolean; msg text;
begin
  -- 1. Direct rows + views: scan EVERY relation in public for anything of B's.
  for r in select c.relname, c.relkind from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r','v','m') order by 1 loop
    begin
      execute format('select count(*) from public.%I x where x::text ~* %L', r.relname, needle_b) into n;
      insert into rls_results(area, check_name, pass, severity, detail)
        values (case when r.relkind = 'v' then 'view' else 'row' end, r.relname || ': B rows visible to A', n = 0, 'leak', n || ' rows');
    exception when insufficient_privilege then
      insert into rls_results(area, check_name, pass, severity, detail)
        values ('row', r.relname || ': B rows visible to A', true, 'leak', 'no SELECT grant (denied)');
    end;
  end loop;

  -- Positive controls: A sees its own fixtures, so the zero counts above mean something.
  insert into rls_results(area, check_name, pass, severity, detail) select 'control', 'A sees own memory_items', count(*) = 2, 'control', count(*)::text from public.memory_items where user_id = a;
  insert into rls_results(area, check_name, pass, severity, detail) select 'control', 'A sees own embeddings', count(*) = 1, 'control', count(*)::text from public.memory_embeddings where memory_item_id = (fx->>'a_item1')::uuid;
  insert into rls_results(area, check_name, pass, severity, detail) select 'control', 'A sees own workspace tasks', count(*) > 0, 'control', count(*)::text from public.workspace_tasks where workspace_id = (fx->>'a_ws')::uuid;
  insert into rls_results(area, check_name, pass, severity, detail) select 'control', 'A sees own thread', count(*) = 1, 'control', count(*)::text from public.project_threads where user_id = a;
  insert into rls_results(area, check_name, pass, severity, detail) select 'control', 'A sees own entities', count(*) >= 2, 'control', count(*)::text from public.entities where user_id = a;

  -- 2. Joins across tables, aimed straight at B's ids.
  select count(*) into n from public.memory_embeddings e join public.memory_items m on m.id = e.memory_item_id where m.user_id = b or e.memory_item_id = (fx->>'b_item1')::uuid;
  insert into rls_results(area, check_name, pass, severity, detail) values ('join', 'embeddings ⋈ items for B', n = 0, 'leak', n::text);
  select count(*) into n from public.entity_links l join public.entities en on en.id = l.entity_id join public.memory_items m on m.id = l.memory_item_id where en.user_id = b or l.user_id = b or m.user_id = b;
  insert into rls_results(area, check_name, pass, severity, detail) values ('relationships', 'entity_links ⋈ entities ⋈ items for B', n = 0, 'leak', n::text);
  select count(*) into n from public.memory_facts f join public.memory_items m on m.id = any(f.source_item_ids) where f.user_id = b or m.user_id = b;
  insert into rls_results(area, check_name, pass, severity, detail) values ('join', 'facts ⋈ source items for B', n = 0, 'leak', n::text);
  select count(*) into n from public.workspace_tasks t join public.workspaces w on w.id = t.workspace_id where w.user_id = b or t.workspace_id = (fx->>'b_ws')::uuid;
  insert into rls_results(area, check_name, pass, severity, detail) values ('join', 'workspace_tasks ⋈ workspaces for B', n = 0, 'leak', n::text);
  select count(*) into n from public.project_threads th join public.projects p on p.id = th.project_id where p.user_id = b or th.project_id = (fx->>'b_proj')::uuid;
  insert into rls_results(area, check_name, pass, severity, detail) values ('threads', 'project_threads ⋈ projects for B', n = 0, 'leak', n::text);
  select count(*) into n from storage.objects o where o.bucket_id = 'note-files' and o.name like (fx->>'b') || '/%';
  insert into rls_results(area, check_name, pass, severity, detail) values ('storage', 'note-files objects in B folder', n = 0, 'leak', n || ' (fixture inserted: ' || (fx->>'b_storage') || ')');

  -- 3. RPC / functions callable by a signed-in user, pointed at B.
  select count(*) into n from public.memory_breakdown(b);                insert into rls_results values (default, 'rpc', 'memory_breakdown(B)', n = 0, 'leak', n::text);
  select count(*) into n from public.memory_source_breakdown(b);         insert into rls_results values (default, 'rpc', 'memory_source_breakdown(B)', n = 0, 'leak', n::text);
  select count(*) into n from public.memory_reach_summary(b);            insert into rls_results values (default, 'rpc', 'memory_reach_summary(B)', n = 0, 'leak', n::text);
  select count(*) into n from public.top_entities(b, 100);               insert into rls_results values (default, 'relationships', 'top_entities(B)', n = 0, 'leak', n::text);
  select count(*) into n from public.related_memories(b, (fx->>'b_item1')::uuid, 1, 50); insert into rls_results values (default, 'relationships', 'related_memories(B, B item)', n = 0, 'leak', n::text);
  select count(*) into n from public.related_memories(a, (fx->>'a_item1')::uuid, 1, 50) x where x.memory_item_id::text ~* needle_b; insert into rls_results values (default, 'relationships', 'related_memories(A) via shared entity name returns no B item', n = 0, 'leak', n::text);
  select count(*) into n from public.search_memory_items(b, fx->>'tb', 60, null);  insert into rls_results values (default, 'rpc', 'search_memory_items(B, B token)', n = 0, 'leak', n::text);
  select count(*) into n from public.search_memory_items(a, fx->>'tb', 60, null);  insert into rls_results values (default, 'rpc', 'search_memory_items(A, B token)', n = 0, 'leak', n::text);
  select count(*) into n from public.search_memory_items(a, 'common topic', 60, (fx->>'b_proj')::uuid) x where x.user_id = b; insert into rls_results values (default, 'rpc', 'search_memory_items(A, shared word, B project)', n = 0, 'leak', n::text);
  select count(*) into n from public.search_memory_items(a, fx->>'ta', 60, null);  insert into rls_results values (default, 'control', 'search_memory_items(A, A token) finds own', n = 2, 'control', n::text);
  select count(*) into n from public.workspace_progress x where x.workspace_id = (fx->>'b_ws')::uuid; insert into rls_results values (default, 'view', 'workspace_progress for B workspace', n = 0, 'leak', n::text);

  -- Backend-only SECURITY DEFINER functions must refuse a signed-in caller outright.
  begin
    execute 'select count(*) from public.match_memory_items($1, $2::vector, 50, null)' into n using b, fx->>'b_vec';
    insert into rls_results values (default, 'semantic', 'match_memory_items(B) callable by authenticated', false, 'leak', n || ' rows returned');
  exception when insufficient_privilege then
    insert into rls_results values (default, 'semantic', 'match_memory_items(B) callable by authenticated', true, 'leak', 'permission denied');
  end;
  begin
    perform public.record_memory_recalls(b, array[(fx->>'b_item1')::uuid], 'x', 'x', null);
    insert into rls_results values (default, 'rpc', 'record_memory_recalls(B) callable by authenticated', false, 'leak', 'executed');
  exception when insufficient_privilege then
    insert into rls_results values (default, 'rpc', 'record_memory_recalls(B) callable by authenticated', true, 'leak', 'permission denied');
  end;
  begin
    perform public.tick_starter_tasks(b);
    insert into rls_results values (default, 'rpc', 'tick_starter_tasks(B) callable by authenticated', false, 'leak', 'executed');
  exception when insufficient_privilege then
    insert into rls_results values (default, 'rpc', 'tick_starter_tasks(B) callable by authenticated', true, 'leak', 'permission denied');
  end;
  begin
    perform * from public.get_embedding_usage_today(b);
    insert into rls_results values (default, 'rpc', 'get_embedding_usage_today(B) callable by authenticated', false, 'leak', 'executed');
  exception when insufficient_privilege then
    insert into rls_results values (default, 'rpc', 'get_embedding_usage_today(B) callable by authenticated', true, 'leak', 'permission denied');
  end;

  -- 4. Write attacks on B's rows. Every user-owned table, UPDATE and DELETE aimed at B.
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           join pg_attribute at on at.attrelid = c.oid and at.attname = 'user_id' and not at.attisdropped
           where s.nspname = 'public' and c.relkind = 'r' order by 1 loop
    begin
      execute format('with u as (update public.%I set user_id = user_id where user_id = %L returning 1) select count(*) from u', r.relname, b) into n;
      ok := n = 0; msg := n || ' rows updated';
    exception when insufficient_privilege then ok := true; msg := 'denied';
    end;
    insert into rls_results values (default, 'write', r.relname || ': A updates B rows', ok, 'leak', msg);
    begin
      execute format('with d as (delete from public.%I where user_id = %L returning 1) select count(*) from d', r.relname, b) into n;
      ok := n = 0; msg := n || ' rows deleted';
    exception when insufficient_privilege then ok := true; msg := 'denied';
    end;
    insert into rls_results values (default, 'write', r.relname || ': A deletes B rows', ok, 'leak', msg);
  end loop;
  begin
    with u as (update public.profiles set full_name = 'pwned' where id = b returning 1) select count(*) into n from u;
    insert into rls_results values (default, 'write', 'profiles: A updates B profile', n = 0, 'leak', n || ' rows');
  exception when insufficient_privilege then
    insert into rls_results values (default, 'write', 'profiles: A updates B profile', true, 'leak', 'denied');
  end;

  -- Impersonation: inserting rows that claim to be B's.
  begin
    insert into public.memory_items (user_id, source_type, content, title) values (b, 'manual', 'planted', 'planted');
    insert into rls_results values (default, 'write', 'insert memory_items as B', false, 'leak', 'accepted');
  exception when insufficient_privilege or check_violation then
    insert into rls_results values (default, 'write', 'insert memory_items as B', true, 'leak', sqlstate);
  end;
  begin
    insert into public.projects (user_id, key, name) values (b, 'planted-x', 'planted');
    insert into rls_results values (default, 'write', 'insert projects as B', false, 'leak', 'accepted');
  exception when insufficient_privilege or check_violation then
    insert into rls_results values (default, 'write', 'insert projects as B', true, 'leak', sqlstate);
  end;
  begin
    insert into public.workspace_tasks (workspace_id, user_id, phase_code, number, title) values ((fx->>'b_ws')::uuid, b, 'B', 99, 'planted');
    insert into rls_results values (default, 'write', 'insert workspace_tasks as B', false, 'leak', 'accepted');
  exception when insufficient_privilege or check_violation then
    insert into rls_results values (default, 'write', 'insert workspace_tasks as B', true, 'leak', sqlstate);
  end;
  begin
    insert into public.api_keys (user_id, key_prefix, key_hash) values (b, 'axon_x', md5(random()::text));
    insert into rls_results values (default, 'write', 'insert api_keys as B (mint key for B)', false, 'leak', 'accepted');
  exception when insufficient_privilege or check_violation then
    insert into rls_results values (default, 'write', 'insert api_keys as B (mint key for B)', true, 'leak', sqlstate);
  end;
  begin
    update public.memory_items set user_id = b where id = (fx->>'a_item2')::uuid;
    insert into rls_results values (default, 'write', 'hand own memory to B (user_id swap)', false, 'leak', 'accepted');
  exception when insufficient_privilege or check_violation then
    insert into rls_results values (default, 'write', 'hand own memory to B (user_id swap)', true, 'leak', sqlstate);
  end;

  -- 5. Cross-tenant references: A's own rows pointing at B's objects (needs B's uuid, which A
  --    cannot read; but anything the service role later reads by parent id would surface it).
  begin
    insert into public.workspace_tasks (workspace_id, user_id, phase_code, number, title) values ((fx->>'b_ws')::uuid, a, 'B', 98, 'injected into B');
    insert into rls_results values (default, 'integrity', 'A plants a task inside B''s workspace', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A plants a task inside B''s workspace', true, 'integrity', sqlstate);
  end;
  begin
    insert into public.workspace_catch (workspace_id, user_id, title) values ((fx->>'b_ws')::uuid, a, 'injected into B');
    insert into rls_results values (default, 'integrity', 'A plants a catch inside B''s workspace', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A plants a catch inside B''s workspace', true, 'integrity', sqlstate);
  end;
  begin
    insert into public.workspace_work (workspace_id, user_id, title) values ((fx->>'b_ws')::uuid, a, 'injected into B');
    insert into rls_results values (default, 'integrity', 'A plants work inside B''s workspace', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A plants work inside B''s workspace', true, 'integrity', sqlstate);
  end;
  begin
    insert into public.memory_items (user_id, source_type, content, project_id) values (a, 'manual', 'in B project', (fx->>'b_proj')::uuid);
    insert into rls_results values (default, 'integrity', 'A files a memory under B''s project', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A files a memory under B''s project', true, 'integrity', sqlstate);
  end;
  begin
    insert into public.project_threads (user_id, project_id, state) values (a, (fx->>'b_proj')::uuid, 'in B project');
    insert into rls_results values (default, 'integrity', 'A writes a thread on B''s project', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A writes a thread on B''s project', true, 'integrity', sqlstate);
  end;
  begin
    insert into public.entity_links (entity_id, memory_item_id, user_id) values ((fx->>'b_ent')::uuid, (fx->>'a_item1')::uuid, a);
    insert into rls_results values (default, 'integrity', 'A links own memory to B''s entity', false, 'integrity', 'accepted');
  exception when others then
    insert into rls_results values (default, 'integrity', 'A links own memory to B''s entity', true, 'integrity', sqlstate);
  end;

  -- 6. Legit flows still work for a normal signed-in user (guards A5-2 revokes).
  begin
    perform public.create_workspace('rlsaextra', 'extra', '#000000');
    insert into public.projects (user_id, key, name) values (a, 'rls-legit-' || substr(fx->>'ta', 11, 6), 'legit');
    insert into public.memory_items (user_id, source_type, content_type, content, entities) values (a, 'manual', 'note', 'legit note', '["Legit Entity"]');
    update public.memory_items set retired_at = now() where id = (fx->>'a_item1')::uuid;   -- fires resync_facts_for_item
    update public.memory_items set retired_at = null where id = (fx->>'a_item1')::uuid;
    insert into public.workspace_catch (workspace_id, user_id, title) values ((fx->>'a_ws')::uuid, a, 'legit catch');
    insert into rls_results values (default, 'control', 'legit writes by signed-in user (workspace, project, note, retire, catch)', true, 'control', 'ok');
  exception when others then
    insert into rls_results values (default, 'control', 'legit writes by signed-in user (workspace, project, note, retire, catch)', false, 'control', sqlstate || ' ' || sqlerrm);
  end;
end
$as_a$;

-- ──────────────────────── as B: injected rows stay invisible ────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select v from rls_fx where k = 'b'), 'role', 'authenticated')::text, true);
do $as_b$
declare fx jsonb := (select jsonb_object_agg(k, v) from rls_fx); n bigint;
begin
  select count(*) into n from public.workspace_tasks where workspace_id = (fx->>'b_ws')::uuid and user_id <> (fx->>'b')::uuid;
  insert into rls_results values (default, 'row', 'B (RLS) does not see A rows planted in B workspace', n = 0, 'leak', n::text);
  select count(*) into n from public.memory_items where user_id = (fx->>'a')::uuid;
  insert into rls_results values (default, 'row', 'B sees none of A''s memory_items', n = 0, 'leak', n::text);
  select count(*) into n from public.memory_items where user_id = (fx->>'b')::uuid;
  insert into rls_results values (default, 'control', 'B sees own memory_items', n = 2, 'control', n::text);
end
$as_b$;

-- ─────────────────────────────── as anon (no session) ───────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $as_anon$
declare
  fx jsonb := (select jsonb_object_agg(k, v) from rls_fx);
  needle text := concat_ws('|', fx->>'a', fx->>'b', fx->>'ta', fx->>'tb', fx->>'a_item1', fx->>'b_item1', fx->>'a_ws', fx->>'b_ws');
  r record; n bigint;
begin
  for r in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind in ('r','v','m') order by 1 loop
    begin
      execute format('select count(*) from public.%I x where x::text ~* %L', r.relname, needle) into n;
      insert into rls_results values (default, 'anon', r.relname || ': fixture rows visible to anon', n = 0, 'leak', n || ' rows');
    exception when insufficient_privilege then
      insert into rls_results values (default, 'anon', r.relname || ': fixture rows visible to anon', true, 'leak', 'denied');
    end;
  end loop;
  begin
    select count(*) into n from public.search_memory_items((fx->>'b')::uuid, fx->>'tb', 60, null);
    insert into rls_results values (default, 'anon', 'search_memory_items(B) as anon', n = 0, 'leak', n::text);
  exception when insufficient_privilege then
    insert into rls_results values (default, 'anon', 'search_memory_items(B) as anon', true, 'leak', 'denied');
  end;
end
$as_anon$;

-- ───────────── backend path (service role / SECDEF), semantic recall scoping ─────────────
reset role;
do $backend$
declare fx jsonb := (select jsonb_object_agg(k, v) from rls_fx); n bigint;
begin
  -- Query with B's exact embedding on A's behalf: the nearest vector in the DB is B's; it must not come back.
  execute 'select count(*) from public.match_memory_items($1, $2::vector, 200, null) m where m.id in ($3, $4)'
    into n using (fx->>'a')::uuid, fx->>'b_vec', (fx->>'b_item1')::uuid, (fx->>'b_item2')::uuid;
  insert into rls_results values (default, 'semantic', 'match_memory_items(A, B''s exact vector) returns B item', n = 0, 'leak', n::text);
  execute 'select count(*) from public.match_memory_items($1, $2::vector, 200, $3) m where m.id in ($4, $5)'
    into n using (fx->>'a')::uuid, fx->>'b_vec', (fx->>'b_proj')::uuid, (fx->>'b_item1')::uuid, (fx->>'b_item2')::uuid;
  insert into rls_results values (default, 'semantic', 'match_memory_items(A, B vector, B project) returns B item', n = 0, 'leak', n::text);
  execute 'select count(*) from public.match_memory_items($1, $2::vector, 200, null) m where m.id = $3'
    into n using (fx->>'a')::uuid, fx->>'a_vec', (fx->>'a_item1')::uuid;
  insert into rls_results values (default, 'control', 'match_memory_items(A, A vector) finds own', n = 1, 'control', n::text);
end
$backend$;

-- ───────────────────── privilege hygiene on SECURITY DEFINER functions ─────────────────────
insert into rls_results (area, check_name, pass, severity, detail)
select 'hygiene', 'SECDEF ' || p.proname || '(): anon EXECUTE', not has_function_privilege('anon', p.oid, 'execute'), 'hygiene',
       case when has_function_privilege('anon', p.oid, 'execute') then 'anon can execute' else 'revoked' end
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
insert into rls_results (area, check_name, pass, severity, detail)
select 'hygiene', 'SECDEF ' || p.proname || '(): authenticated EXECUTE', not has_function_privilege('authenticated', p.oid, 'execute'), 'hygiene',
       case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated can execute' else 'revoked' end
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.prosecdef
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

select area, check_name, pass, severity, detail from rls_results order by pass, id;

rollback;
