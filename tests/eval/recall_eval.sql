-- A3-1 recall evaluation set. Repeatable: one transaction, throwaway users and
-- hand-built memories (incl. synthetic topic embeddings), ROLLBACK at the end.
-- Each case names the memory that must rank first and memories that must not
-- appear at all. Also scores the legacy keyword path (search_memory_items) on
-- the same cases as a baseline, and times hybrid recall over 5,000 rows.
-- Output: area, check_name, pass, severity, detail.
begin;
create temp table t_results (id serial primary key, area text, check_name text, pass boolean, severity text, detail text) on commit drop;
create temp table t_fx (k text primary key, id uuid) on commit drop;
create temp table t_cases (n serial, name text, query text, topic int, project text, facets text[], expect text, forbid text[], baseline_applicable boolean) on commit drop;

-- One-hot-ish topic vector: 1 on dimension t, a little noise elsewhere.
create function pg_temp.topic_vec(t int) returns vector language sql as $$
  select ('[' || string_agg(case when g = t then '1' else '0.01' end, ',' order by g) || ']')::vector
  from generate_series(1, 1536) g
$$;
create function pg_temp.mem(k text, u uuid, title text, content text, days int, topic int default null,
                            proj uuid default null, conn uuid default null, anchor smallint default null,
                            fac text[] default '{}', ents jsonb default '[]') returns uuid language plpgsql as $$
declare i uuid;
begin
  insert into public.memory_items (user_id, source_type, content_type, title, content, occurred_at, project_id,
                                   source_connection_id, anchored_weight, facets, entities)
  values (u, case when conn is null then 'manual' else 'gmail' end, case when conn is null then 'note' else 'email' end,
          title, content, now() - make_interval(days => days), proj, conn, anchor, fac, ents)
  returning id into i;
  if topic is not null then insert into public.memory_embeddings (memory_item_id, embedding) values (i, pg_temp.topic_vec(topic)); end if;
  insert into t_fx values (k, i);
  return i;
end $$;

do $seed$
declare u uuid := gen_random_uuid(); o uuid := gen_random_uuid(); big uuid := gen_random_uuid();
        tok text := 'receval' || substr(md5(random()::text), 1, 8);
        px uuid; py uuid; conn uuid; new_ledger uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', x, 'authenticated', 'authenticated', tok || n || '@rls-test.invalid', '', now(), '{}', '{}', now(), now()
  from (values (u, 'u'), (o, 'o'), (big, 'big')) v(x, n);
  insert into t_fx values ('u', u), ('o', o), ('big', big);
  insert into public.projects (user_id, key, name) values (u, 'proj-x', 'X') returning id into px;
  insert into public.projects (user_id, key, name) values (u, 'proj-y', 'Y') returning id into py;
  insert into t_fx values ('px', px), ('py', py);
  insert into public.source_connections (user_id, provider, status, external_account_label) values (u, 'gmail', 'connected', 'eval') returning id into conn;

  perform pg_temp.mem('pg_decision', u, 'Postgres over Mongo', 'Decided to keep Postgres; the Mongo migration is cancelled.', 20, 1);
  perform pg_temp.mem('pg_retired', u, 'Mongo move', 'Decided to move from Postgres to Mongo.', 60, 1);
  update public.memory_items set retired_at = now(), retired_reason = 'user' where id = (select id from t_fx where k = 'pg_retired');
  perform pg_temp.mem('o_pg', o, 'Postgres over Mongo', 'Decided to keep Postgres; the Mongo migration is cancelled.', 1, 1);

  perform pg_temp.mem('storage', u, 'Storage decision', 'We stay on the relational store we already run; nothing moves this year.', 15, 3);
  perform pg_temp.mem('backups', u, 'Backups', 'Database backups run nightly at three.', 5, 7);

  perform pg_temp.mem('k8s', u, 'Kubernetes rollout plan', 'Roll the cluster out region by region.', 30, 9);

  perform pg_temp.mem('rel_x', u, 'Release checklist', 'Release checklist: tag, changelog, deploy, announce.', 10, null, px);
  perform pg_temp.mem('rel_null', u, 'Release checklist', 'Release checklist: tag, changelog, deploy, announce.', 10);
  perform pg_temp.mem('rel_y', u, 'Release checklist', 'Release checklist: tag, changelog, deploy, announce.', 1, null, py);
  perform pg_temp.mem('rel_conn', u, 'Release checklist', 'Release checklist forwarded by email: tag, changelog, deploy.', 1, null, null, conn);

  perform pg_temp.mem('standup_new', u, 'Standup notes', 'Standup notes: unblock the importer, review billing.', 2);
  perform pg_temp.mem('standup_old', u, 'Standup notes', 'Standup notes: unblock the importer, review billing.', 200);

  perform pg_temp.mem('pricing_heavy', u, 'Pricing idea', 'Pricing idea: annual plan with two months free.', 40, null, null, null, 5::smallint);
  perform pg_temp.mem('pricing_light', u, 'Pricing idea', 'Pricing idea: annual plan with two months free.', 40);

  perform pg_temp.mem('vendor_direct', u, 'Vendor contract renewal', 'Vendor contract renewal is due in March; negotiate the price.', 25);
  perform pg_temp.mem('vendor_conn', u, 'Vendor contract renewal', 'Vendor contract renewal is due in March; negotiate the price.', 25, null, null, conn);

  perform pg_temp.mem('journal_trading', u, 'Trading journal', 'Trading journal: size down after two losses.', 12, null, null, null, null, '{trading}');
  perform pg_temp.mem('journal_personal', u, 'Trading journal', 'Trading journal: size down after two losses.', 12, null, null, null, null, '{personal}');

  perform pg_temp.mem('ledger_new', u, 'Ledger store', 'We use Postgres for the ledger.', 8);
  perform pg_temp.mem('ledger_old', u, 'Ledger store', 'We use MySQL for the ledger.', 90);
  update public.memory_items set retired_at = now(), retired_reason = 'superseded', superseded_by = (select id from t_fx where k = 'ledger_new')
   where id = (select id from t_fx where k = 'ledger_old');

  perform pg_temp.mem('incident_old', u, 'Postmortem', 'Postmortem: database outage incident caused by a full disk.', 300);
  perform pg_temp.mem('printer_new', u, 'Office', 'Outage window for the office printer on Friday.', 1);

  perform pg_temp.mem('lisa', u, null, 'Agreed to send the draft by Friday.', 6, null, null, null, null, '{}', '["Lisa van Dam"]');
  perform pg_temp.mem('fresh_top', u, 'Today', 'Just now: picked the new onboarding copy.', 0, null, null, null, 5::smallint);

  -- Scale fixture for latency: 5,000 rows on a separate throwaway user.
  insert into public.memory_items (user_id, source_type, content_type, title, content, occurred_at)
  select big, 'manual', 'note', 'Item ' || g, 'Filler memory number ' || g || ' about ' ||
         (array['billing','deploy','postgres','design','hiring','trading','travel','pricing'])[1 + g % 8] || ' and more words',
         now() - make_interval(hours => g)
  from generate_series(1, 5000) g;
end
$seed$;

insert into t_cases (name, query, topic, project, facets, expect, forbid, baseline_applicable) values
 ('lexical: exact terms',                     'postgres mongo decision', null, null, null, 'pg_decision', '{pg_retired,o_pg}', true),
 ('lexical: natural-language question',       'what did we finally decide about postgres and the mongo migration last quarter', null, null, null, 'pg_decision', '{pg_retired,o_pg}', true),
 ('semantic: no shared words',                'which database did we pick', 3, null, null, 'storage', '{}', true),
 ('fuzzy: typo in title',                     'Kubernetis', null, null, null, 'k8s', '{}', true),
 ('thread: project match ranks first',        'release checklist', null, 'px', null, 'rel_x', '{rel_y,rel_conn}', false),
 ('recency: newer of two equal matches',      'standup notes', null, null, null, 'standup_new', '{}', true),
 ('weight: anchored memory first',            'pricing idea', null, null, null, 'pricing_heavy', '{}', true),
 ('provenance: direct beats connector',       'vendor contract renewal', null, null, null, 'vendor_direct', '{}', true),
 ('facet: requested facet first',             'trading journal', null, null, '{trading}', 'journal_trading', '{}', false),
 ('supersession: current truth only',         'ledger', null, null, null, 'ledger_new', '{ledger_old}', true),
 ('relevance beats recency',                  'database outage postmortem', null, null, null, 'incident_old', '{}', true),
 ('entity: name only in entities',            'Lisa', null, null, null, 'lisa', '{}', true),
 ('no query: fresh, heavy, direct first',     null, null, null, null, 'fresh_top', '{pg_retired,ledger_old,o_pg}', false);

do $run$
declare c record; u uuid := (select id from t_fx where k = 'u'); proj uuid; ids uuid[]; base uuid[]; rnk int; brnk int;
        bad text[]; top record; hits int := 0; bhits int := 0; bn int := 0; rr numeric := 0; total int := 0;
        t0 timestamptz; ms numeric; nrows int;
begin
  for c in select * from t_cases order by n loop
    proj := (select id from t_fx where k = c.project);
    select array_agg(r.id order by ord) into ids from (
      select h.id, row_number() over () as ord
      from public.recall_hybrid(u, c.query, case when c.topic is null then null else pg_temp.topic_vec(c.topic) end, proj, c.facets, 40) h) r;
    rnk := array_position(ids, (select id from t_fx where k = c.expect));
    select array_agg(f) into bad from unnest(c.forbid) f where (select id from t_fx where k = f) = any(coalesce(ids, '{}'));
    select h.score, h.matched_by into top from public.recall_hybrid(u, c.query, case when c.topic is null then null else pg_temp.topic_vec(c.topic) end, proj, c.facets, 1) h;
    total := total + 1;
    if rnk = 1 then hits := hits + 1; end if;
    if rnk is not null then rr := rr + 1.0 / rnk; end if;
    brnk := null;
    if c.baseline_applicable and c.query is not null then
      select array_agg(s.id) into base from public.search_memory_items(u, c.query, 60, proj) s;
      brnk := array_position(base, (select id from t_fx where k = c.expect));
      bn := bn + 1; if brnk = 1 then bhits := bhits + 1; end if;
    end if;
    insert into t_results (area, check_name, pass, severity, detail) values ('eval', c.name,
      rnk = 1 and bad is null, 'eval',
      format('rank=%s baseline_rank=%s top_score=%s matched_by=%s%s', coalesce(rnk::text, 'absent'),
             case when c.baseline_applicable and c.query is not null then coalesce(brnk::text, 'absent') else 'n/a' end,
             round(top.score::numeric, 3), top.matched_by, case when bad is null then '' else ' FORBIDDEN=' || bad::text end));
  end loop;
  insert into t_results (area, check_name, pass, severity, detail) values
    ('eval', 'hit@1 = 100% (threshold)', hits = total, 'eval', format('%s/%s; legacy keyword path %s/%s', hits, total, bhits, bn)),
    ('eval', 'MRR >= 0.95', rr / total >= 0.95, 'eval', round(rr / total, 3)::text);

  -- Isolation: the other tenant's identical memory never shows up for u, and u's never for o.
  select count(*) into nrows from public.recall_hybrid(u, 'postgres mongo', pg_temp.topic_vec(1), null, null, 200) h
   where h.id = (select id from t_fx where k = 'o_pg');
  insert into t_results (area, check_name, pass, severity, detail) values ('isolation', 'other tenant never recalled (lexical+semantic)', nrows = 0, 'leak', nrows::text);
  select count(*) into nrows from public.recall_hybrid((select id from t_fx where k = 'o'), null, null, null, null, 200) h
   join public.memory_items m on m.id = h.id where m.user_id <> (select id from t_fx where k = 'o');
  insert into t_results (area, check_name, pass, severity, detail) values ('isolation', 'overview for o contains only o', nrows = 0, 'leak', nrows::text);

  -- Trace columns are present and coherent.
  select count(*) into nrows from public.recall_hybrid(u, 'vendor contract renewal', null, null, null, 10) h
   where h.capture_channel = 'connector' and h.source_connection_id is not null;
  insert into t_results (area, check_name, pass, severity, detail) values ('trace', 'connector provenance returned with connection id', nrows = 1, 'eval', nrows::text);
  select count(*) into nrows from public.recall_hybrid(u, 'which database did we pick', pg_temp.topic_vec(3), null, null, 10) h
   where h.id = (select id from t_fx where k = 'storage') and 'semantic' = any(h.matched_by) and not ('lexical' = any(h.matched_by));
  insert into t_results (area, check_name, pass, severity, detail) values ('trace', 'matched_by explains a semantic-only hit', nrows = 1, 'eval', nrows::text);
  begin perform public.recall_hybrid(null); insert into t_results (area, check_name, pass, severity, detail) values ('contract', 'null owner refused', false, 'eval', 'accepted');
  exception when others then insert into t_results (area, check_name, pass, severity, detail) values ('contract', 'null owner refused', sqlstate = '22023', 'eval', sqlstate); end;

  -- Latency over 5,000 rows (lexical + fuzzy, and overview).
  t0 := clock_timestamp();
  perform count(*) from public.recall_hybrid((select id from t_fx where k = 'big'), 'what changed about postgres deploys', null, null, null, 60);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into t_results (area, check_name, pass, severity, detail) values ('latency', 'query recall over 5,000 rows < 1500 ms', ms < 1500, 'eval', round(ms) || ' ms');
  t0 := clock_timestamp();
  perform count(*) from public.recall_hybrid((select id from t_fx where k = 'big'), null, null, null, null, 60);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into t_results (area, check_name, pass, severity, detail) values ('latency', 'overview recall over 5,000 rows < 1500 ms', ms < 1500, 'eval', round(ms) || ' ms');
end
$run$;

-- Privileges: backend-only.
insert into t_results (area, check_name, pass, severity, detail)
select 'privileges', 'recall_hybrid not executable by ' || r, not has_function_privilege(r, 'public.recall_hybrid(uuid, text, vector, uuid, text[], integer, timestamptz)', 'execute'), 'leak', ''
from unnest(array['anon', 'authenticated']) r;

select area, check_name, pass, severity, detail from t_results order by id;
rollback;
