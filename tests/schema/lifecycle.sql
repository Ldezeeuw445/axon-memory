-- A4-1 lifecycle tests: supersede / retire / restore / delete, delete propagation
-- to embeddings, entity links, orphan entities, facts, recalls, relations and
-- every recall path; tenant boundary of the lifecycle functions.
-- One transaction, throwaway fixtures, ROLLBACK — safe against production.
begin;
create temp table t_results (id serial primary key, area text, check_name text, pass boolean, detail text) on commit drop;
create temp table t_fx (k text primary key, v text) on commit drop;
grant all on t_results to authenticated, anon; grant usage on sequence t_results_id_seq to authenticated, anon;
grant select on t_fx to authenticated, anon;

do $seed$
declare u uuid := gen_random_uuid(); o uuid := gen_random_uuid(); tok text := 'lifecyc' || substr(md5(random()::text), 1, 10);
        n1 uuid; n2 uuid; o3 uuid; n4 uuid; x1 uuid; vec text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', tok || 'u@rls-test.invalid', '', now(), '{}', '{}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', o, 'authenticated', 'authenticated', tok || 'o@rls-test.invalid', '', now(), '{}', '{}', now(), now());
  insert into public.memory_items (user_id, source_type, content_type, content, entities)
    values (u, 'manual', 'note', 'first ' || tok || 'one', jsonb_build_array('Unique Ent ' || tok, 'Shared Ent ' || tok)) returning id into n1;
  insert into public.memory_items (user_id, source_type, content_type, content, entities)
    values (u, 'manual', 'note', 'second ' || tok || 'two', jsonb_build_array('Shared Ent ' || tok)) returning id into n2;
  insert into public.memory_items (user_id, source_type, content_type, content) values (u, 'manual', 'note', 'we use MySQL ' || tok || 'old') returning id into o3;
  insert into public.memory_items (user_id, source_type, content_type, content) values (u, 'manual', 'note', 'we use Postgres ' || tok || 'new') returning id into n4;
  insert into public.memory_items (user_id, source_type, content_type, content, entities) values (o, 'manual', 'note', 'other ' || tok, '["Other Ent"]') returning id into x1;
  select '[' || string_agg(round(random()::numeric, 4)::text, ',') || ']' into vec from generate_series(1, 1536);
  insert into public.memory_embeddings (memory_item_id, embedding) values (n1, vec::vector);
  insert into public.memory_recalls (user_id, memory_item_id, client_key) values (u, n1, 'claude');
  insert into public.memory_relations (user_id, from_memory_id, to_memory_id, kind) values (u, n2, n1, 'relates');
  insert into public.memory_facts (user_id, statement, category, source_item_ids) values
    (u, 'f1 ' || tok, 'decision', array[n1]), (u, 'f2 ' || tok, 'decision', array[n1, n2]), (u, 'f3 ' || tok, 'tool', array[o3]),
    (o, 'fo ' || tok, 'tool', array[x1]);
  insert into t_fx values ('u', u), ('o', o), ('tok', tok), ('n1', n1), ('n2', n2), ('o3', o3), ('n4', n4), ('x1', x1), ('vec', vec);
end
$seed$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select v from t_fx where k = 'u'), 'role', 'authenticated')::text, true);
do $as_u$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); u uuid := (fx->>'u')::uuid; tok text := fx->>'tok';
        n1 uuid := (fx->>'n1')::uuid; n2 uuid := (fx->>'n2')::uuid; o3 uuid := (fx->>'o3')::uuid; n4 uuid := (fx->>'n4')::uuid; x1 uuid := (fx->>'x1')::uuid;
        r jsonb; m record; n bigint; ok boolean;
begin
  -- Supersede
  r := public.memory_supersede(o3, n4, 'switched database', 'test');
  select * into m from public.memories where id = o3;
  insert into t_results values (default, 'supersede', 'old becomes superseded, points at new', m.lifecycle_state = 'superseded' and m.superseded_by = n4, m.lifecycle_state);
  insert into t_results values (default, 'supersede', 'previous state kept verbatim', m.content = 'we use MySQL ' || tok || 'old', m.content);
  select count(*) into n from public.memory_relations where from_memory_id = n4 and to_memory_id = o3 and kind = 'supersedes';
  insert into t_results values (default, 'supersede', 'supersedes relation recorded', n = 1, n::text);
  select count(*) into n from public.memory_facts where statement = 'f3 ' || tok and superseded_reason = 'source-retired';
  insert into t_results values (default, 'supersede', 'facts derived only from old are withdrawn', n = 1 and (r->>'facts_withdrawn')::int = 1, r::text);
  select count(*) into n from public.search_memory_items(u, tok || 'old', 60, null);
  insert into t_results values (default, 'supersede', 'old absent from keyword recall', n = 0, n::text);
  select count(*) into n from public.search_memory_items(u, tok || 'new', 60, null);
  insert into t_results values (default, 'supersede', 'new present in keyword recall', n = 1, n::text);
  r := public.memory_supersede(o3, n4, null, 'test');
  insert into t_results values (default, 'supersede', 'idempotent', (r->>'changed')::boolean = false, r::text);
  begin perform public.memory_supersede(n4, n4); insert into t_results values (default, 'supersede', 'self-supersession refused', false, 'accepted');
  exception when others then insert into t_results values (default, 'supersede', 'self-supersession refused', true, sqlstate); end;
  begin perform public.memory_supersede(n4, o3); insert into t_results values (default, 'supersede', 'superseding with a non-active memory refused', false, 'accepted');
  exception when others then insert into t_results values (default, 'supersede', 'superseding with a non-active memory refused', true, sqlstate); end;

  -- Restore
  r := public.memory_restore(o3, 'test');
  select * into m from public.memories where id = o3;
  insert into t_results values (default, 'restore', 'restored to active, superseded_by cleared', m.lifecycle_state = 'active' and m.superseded_by is null, m.lifecycle_state);
  select count(*) into n from public.memory_facts where statement = 'f3 ' || tok and superseded_at is null;
  insert into t_results values (default, 'restore', 'withdrawn fact regains footing', n = 1, n::text);
  select count(*) into n from public.memory_relations where from_memory_id = n4 and to_memory_id = o3;
  insert into t_results values (default, 'restore', 'supersession history kept', n = 1, n::text);

  -- Retire
  r := public.memory_retire(n2, 'no longer true', 'test');
  select * into m from public.memories where id = n2;
  insert into t_results values (default, 'retire', 'retired with reason', m.lifecycle_state = 'retired' and m.retired_reason = 'no longer true' and m.depth = 3, m.lifecycle_state);
  select count(*) into n from public.search_memory_items(u, tok || 'two', 60, null);
  insert into t_results values (default, 'retire', 'retired absent from keyword recall', n = 0, n::text);
  select count(*) into n from public.top_entities(u, 100) where name = 'Shared Ent ' || tok and mention_count = 1;
  insert into t_results values (default, 'retire', 'retired memory no longer counts toward entities', n = 1, n::text);
  r := public.memory_retire(n2);
  insert into t_results values (default, 'retire', 'idempotent', (r->>'changed')::boolean = false, r::text);
  begin perform public.memory_retire(n4, 'superseded'); insert into t_results values (default, 'retire', 'reason "superseded" reserved for supersede', false, 'accepted');
  exception when invalid_parameter_value then insert into t_results values (default, 'retire', 'reason "superseded" reserved for supersede', true, sqlstate); end;

  -- Delete n1 (embedding, 2 entity links (1 orphan), 1 recall, 1 relation, f1 only-source, f2 shared with retired n2)
  r := public.memory_delete(n1, 'test');
  insert into t_results values (default, 'delete', 'reported counts',
    (r->>'embeddings')::int = 1 and (r->>'entity_links')::int = 2 and (r->>'entities_orphaned')::int = 1 and (r->>'recalls')::int = 1
    and (r->>'relations')::int = 1 and (r->>'facts_deleted')::int = 1 and (r->>'facts_updated')::int = 1, r::text);
  select count(*) into n from public.memory_items where id = n1;         insert into t_results values (default, 'delete', 'relational row gone', n = 0, n::text);
  select count(*) into n from public.memory_embeddings where memory_item_id = n1; insert into t_results values (default, 'delete', 'vector gone', n = 0, n::text);
  select count(*) into n from public.entity_links where memory_item_id = n1; insert into t_results values (default, 'delete', 'entity links gone', n = 0, n::text);
  select count(*) into n from public.entities where name = 'Unique Ent ' || tok; insert into t_results values (default, 'delete', 'entity only it mentioned gone', n = 0, n::text);
  select count(*) into n from public.entities where name = 'Shared Ent ' || tok; insert into t_results values (default, 'delete', 'shared entity kept', n = 1, n::text);
  select count(*) into n from public.memory_recalls where memory_item_id = n1; insert into t_results values (default, 'delete', 'recall log rows gone', n = 0, n::text);
  select count(*) into n from public.memory_relations where n1 in (from_memory_id, to_memory_id); insert into t_results values (default, 'delete', 'relations gone', n = 0, n::text);
  select count(*) into n from public.memory_facts where statement = 'f1 ' || tok; insert into t_results values (default, 'delete', 'fact derived only from it deleted', n = 0, n::text);
  select count(*) into n from public.memory_facts where statement = 'f2 ' || tok and source_item_ids = array[n2] and superseded_reason = 'source-retired';
  insert into t_results values (default, 'delete', 'shared fact loses the id; withdrawn as its other source is retired', n = 1, n::text);
  select count(*) into n from public.search_memory_items(u, tok || 'one', 60, null); insert into t_results values (default, 'delete', 'gone from keyword recall', n = 0, n::text);
  select count(*) into n from public.memories where id = n1; insert into t_results values (default, 'delete', 'gone from memories view', n = 0, n::text);
  select count(*) into n from public.related_memories(u, n2, 1, 50) where memory_item_id = n1; insert into t_results values (default, 'delete', 'gone from related memories', n = 0, n::text);
  select count(*) into n from public.memory_lifecycle_events where memory_item_id = n1 and op = 'delete' and detail::text not like '%' || tok || '%';
  insert into t_results values (default, 'delete', 'delete event logged without content', n = 1, n::text);
  begin perform public.memory_delete(n1); insert into t_results values (default, 'delete', 'second delete reports no such memory', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'delete', 'second delete reports no such memory', true, sqlstate); end;

  -- Tenant boundary
  begin perform public.memory_retire(x1); insert into t_results values (default, 'isolation', 'retire other user''s memory', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'isolation', 'retire other user''s memory', true, sqlstate); end;
  begin perform public.memory_delete(x1); insert into t_results values (default, 'isolation', 'delete other user''s memory', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'isolation', 'delete other user''s memory', true, sqlstate); end;
  begin perform public.memory_supersede(x1, n4); insert into t_results values (default, 'isolation', 'supersede other user''s memory', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'isolation', 'supersede other user''s memory', true, sqlstate); end;
  begin perform public.memory_supersede(n4, x1); insert into t_results values (default, 'isolation', 'supersede own with other user''s memory', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'isolation', 'supersede own with other user''s memory', true, sqlstate); end;
  begin perform public.memory_delete(n4, null, (fx->>'o')::uuid); insert into t_results values (default, 'isolation', 'naming another user via p_user_id', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'isolation', 'naming another user via p_user_id', true, sqlstate); end;
end
$as_u$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $anon$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx);
begin
  begin perform public.memory_delete((fx->>'n4')::uuid, null, (fx->>'u')::uuid); insert into t_results values (default, 'isolation', 'anon cannot call memory_delete', false, 'accepted');
  exception when insufficient_privilege then insert into t_results values (default, 'isolation', 'anon cannot call memory_delete', true, sqlstate); end;
end
$anon$;

reset role;
select set_config('request.jwt.claims', '', true);
do $svc$
declare fx jsonb := (select jsonb_object_agg(k, v) from t_fx); r jsonb; n bigint;
begin
  -- Service path (edge functions): explicit p_user_id required and enforced.
  execute 'select count(*) from public.match_memory_items($1, $2::vector, 200, null) where id = $3' into n using (fx->>'u')::uuid, fx->>'vec', (fx->>'n1')::uuid;
  insert into t_results values (default, 'delete', 'gone from semantic recall (exact vector)', n = 0, n::text);
  r := public.memory_retire((fx->>'n4')::uuid, 'user', 'svc', (fx->>'u')::uuid);
  insert into t_results values (default, 'service', 'service role retires for named owner', (r->>'changed')::boolean, r::text);
  begin perform public.memory_retire((fx->>'n4')::uuid, 'user', 'svc', null); insert into t_results values (default, 'service', 'service call without p_user_id refused', false, 'accepted');
  exception when invalid_parameter_value then insert into t_results values (default, 'service', 'service call without p_user_id refused', true, sqlstate); end;
  begin perform public.memory_delete((fx->>'n4')::uuid, 'svc', (fx->>'o')::uuid); insert into t_results values (default, 'service', 'service call with wrong owner refused', false, 'accepted');
  exception when no_data_found then insert into t_results values (default, 'service', 'service call with wrong owner refused', true, sqlstate); end;
  select count(*) into n from public.memory_items where id = (fx->>'x1')::uuid;
  insert into t_results values (default, 'isolation', 'other user''s memory untouched', n = 1, n::text);
  -- Account deletion still cascades cleanly through the new trigger.
  delete from auth.users where id = (fx->>'o')::uuid;
  select count(*) into n from public.memory_items where user_id = (fx->>'o')::uuid;
  insert into t_results values (default, 'account', 'account deletion cascades through purge trigger', n = 0 and not exists (select 1 from public.memory_facts where user_id = (fx->>'o')::uuid)
    and not exists (select 1 from public.entities where user_id = (fx->>'o')::uuid), n::text);
end
$svc$;

select area, check_name, pass, 'schema' as severity, detail from t_results order by pass, id;
rollback;
