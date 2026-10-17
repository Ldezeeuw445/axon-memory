-- A3-1: hybrid recall ranking.
-- Additive only: one extension (pg_trgm, in the extensions schema), two new
-- functions. Nothing existing is altered; search_memory_items and
-- match_memory_items stay as they are (legacy fallback path in memory-core).

create extension if not exists pg_trgm with schema extensions;

-- OR-of-prefixes tsquery from free text: "what did we decide about postgres"
-- -> 'decid':* | 'postgr':*. websearch_to_tsquery ANDs every word, so one
-- extra word in a natural question used to zero the result set.
create or replace function public.recall_or_tsquery(p_query text)
  returns tsquery
  language sql immutable parallel safe
  set search_path = public, pg_catalog
as $$
  select case
    when coalesce(btrim(p_query), '') = '' then null
    else nullif(
      regexp_replace(
        replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '),
        '''([^'']+)''', '''\1'':*', 'g'),
      '')::tsquery
  end
$$;

-- Ranked memories plus the per-signal breakdown that explains the rank.
-- Signals: semantic (cosine, when a query embedding is passed), lexical
-- (term coverage + ts_rank_cd over title/content/entities, prefix-tolerant),
-- fuzzy (trigram word similarity on titles, catches typos), recency, Weight,
-- Depth, provenance channel, Thread (project) match, Facet match.
-- Scope rules are the same as recall has always had: own rows only, live only
-- (retired + superseded excluded), project scope = this project + unscoped
-- items that did not come from a connected account.
create or replace function public.recall_hybrid(
  p_user_id uuid,
  p_query text default null,
  p_query_embedding public.vector default null,
  p_project_id uuid default null,
  p_facets text[] default null,
  p_limit integer default 40,
  p_now timestamptz default now()
)
returns table (
  id uuid, content_type text, title text, content text, entities jsonb, metadata jsonb,
  occurred_at timestamptz, created_at timestamptz, source_type text, origin_key text,
  source_connection_id uuid, api_key_id uuid, project_id uuid, facets text[], confidence real,
  capture_channel text, weight smallint, depth smallint,
  semantic real, lexical real, fuzzy real, recency real,
  thread_match boolean, facet_match boolean, score real, matched_by text[]
)
language plpgsql stable security invoker
set search_path = public, extensions, pg_catalog
as $$
#variable_conflict use_column
declare
  qtext  text    := nullif(btrim(coalesce(p_query, '')), '');
  q      tsquery := public.recall_or_tsquery(p_query);
  n_terms int    := 0;
  lim    int     := least(greatest(coalesce(p_limit, 40), 1), 200);
  use_fz boolean;
  has_q  boolean;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;
  use_fz := qtext is not null and length(qtext) between 4 and 80;
  has_q  := q is not null or p_query_embedding is not null or use_fz;
  if q is not null then
    n_terms := coalesce(array_length(tsvector_to_array(to_tsvector('english', qtext)), 1), 0);
  end if;

  return query
  with lex as (
    select m.id,
           ts_rank_cd(to_tsvector('english', coalesce(m.title, '') || ' ' || m.content), q, 32)::real as rank
    from memory_items m
    where q is not null and m.user_id = p_user_id and m.retired_at is null
      and (to_tsvector('english', coalesce(m.title, '') || ' ' || m.content) @@ q
           or jsonb_to_tsvector('english', m.entities, '["string"]') @@ q)
    order by 2 desc
    limit 300
  ), fz as (
    select m.id, word_similarity(lower(qtext), lower(m.title))::real as sim
    from memory_items m
    where use_fz and m.user_id = p_user_id and m.retired_at is null and m.title is not null
      and word_similarity(lower(qtext), lower(m.title)) >= 0.5
    order by 2 desc
    limit 50
  ), sem as (
    select e.memory_item_id as id, (1 - (e.embedding <=> p_query_embedding))::real as sim
    from memory_embeddings e
    join memory_items m on m.id = e.memory_item_id
    where p_query_embedding is not null and m.user_id = p_user_id and m.retired_at is null
    -- Exact distance within this owner's rows ("+ 0" keeps the planner off the
    -- shared HNSW index, which filters by owner only after its candidate
    -- list and so can return far fewer than asked for small accounts).
    order by (e.embedding <=> p_query_embedding) + 0
    limit 150
  ), rec as (
    select m.id
    from memory_items m
    where not has_q and m.user_id = p_user_id and m.retired_at is null
    order by m.occurred_at desc nulls last
    limit 300
  ), cand as (
    select lex.id from lex union select fz.id from fz union select sem.id from sem union select rec.id from rec
  ), mx as (
    select greatest(coalesce(max(lex.rank), 0), 1e-6)::real as mx from lex
  ), base as (
    select m.*,
      case when m.source_connection_id is not null then 'connector'
           when m.api_key_id is not null           then 'agent'
           when m.source_type = 'manual'           then 'direct'
           else 'unknown' end as channel,
      coalesce(r.recall_clients, 0) as recall_clients,
      coalesce(l.link_count, 0) as link_count,
      case when sem.id is null then 0
           else least(1, greatest(0, (sem.sim - 0.2) / 0.5)) end::real as s_sem,
      case when lex.id is null or n_terms = 0 then 0
           else (0.7 * (select count(*) from unnest(tsvector_to_array(to_tsvector('english', qtext))) t(lx)
                         where (to_tsvector('english', coalesce(m.title, '') || ' ' || m.content)
                                || jsonb_to_tsvector('english', m.entities, '["string"]'))
                               @@ (quote_literal(t.lx) || ':*')::tsquery)::real / n_terms
                 + 0.3 * lex.rank / (select mx.mx from mx)) end::real as s_lex,
      coalesce(fz.sim, 0)::real as s_fz,
      exp(-greatest(0, extract(epoch from (p_now - coalesce(m.occurred_at, m.created_at)))) / 86400.0 / 45.0)::real as s_rec
    from cand c
    join memory_items m on m.id = c.id
    left join lex on lex.id = m.id
    left join fz  on fz.id  = m.id
    left join sem on sem.id = m.id
    left join lateral (select count(distinct x.client_key)::int as recall_clients
                       from memory_recalls x where x.memory_item_id = m.id) r on true
    left join lateral (select count(*)::int as link_count
                       from entity_links y where y.memory_item_id = m.id) l on true
    where m.user_id = p_user_id and m.retired_at is null
      and (p_project_id is null or m.project_id = p_project_id
           or (m.project_id is null and m.source_connection_id is null))
  ), feat as (
    select b.*,
      memory_weight(b.anchored_weight, b.recall_clients, b.link_count, b.source_type) as w,
      memory_depth(b.occurred_at, b.retired_at, p_now) as d,
      coalesce(p_project_id is not null and b.project_id = p_project_id, false) as t_match,
      coalesce(p_facets is not null and cardinality(p_facets) > 0 and b.facets && p_facets, false) as f_match,
      greatest(b.s_lex, 0.85 * b.s_fz)::real as s_text,
      case b.channel when 'direct' then 1.0 when 'agent' then 0.8 when 'connector' then 0.4 else 0.5 end as s_prov
    from base b
  ), ranked as (
    select f.*,
      case when p_query_embedding is not null
           then 0.6 * greatest(f.s_sem, f.s_text) + 0.4 * (f.s_sem + f.s_text) / 2
           else f.s_text end::real as rel
    from feat f
  )
  select r.id, r.content_type, r.title, r.content, r.entities, r.metadata,
         r.occurred_at, r.created_at, r.source_type, r.origin_key,
         r.source_connection_id, r.api_key_id, r.project_id, r.facets, r.confidence,
         r.channel, r.w, r.d,
         r.s_sem, r.s_lex, r.s_fz, r.s_rec, r.t_match, r.f_match,
         (case when has_q
               then 0.70 * r.rel + 0.10 * r.s_rec + 0.07 * (r.w - 1) / 4.0 + 0.06 * r.s_prov
                    + 0.04 * r.t_match::int + 0.03 * r.f_match::int
               else 0.45 * r.s_rec + 0.20 * (r.w - 1) / 4.0 + 0.15 * r.s_prov
                    + 0.12 * r.t_match::int + 0.08 * r.f_match::int end)::real,
         array_remove(array[
           case when r.s_sem >= 0.3 then 'semantic' end,
           case when r.s_lex > 0 then 'lexical' end,
           case when r.s_fz >= 0.5 then 'fuzzy' end,
           case when r.t_match then 'thread' end,
           case when r.f_match then 'facet' end,
           case when r.s_rec >= 0.85 then 'recent' end,
           case when r.w >= 4 then 'weight' end], null)
  from ranked r
  where not has_q or r.rel >= 0.08
  order by 25 desc nulls last, r.occurred_at desc nulls last, r.id
  limit lim;
end
$$;

revoke all on function public.recall_hybrid(uuid, text, public.vector, uuid, text[], integer, timestamptz) from public, anon, authenticated;
grant execute on function public.recall_hybrid(uuid, text, public.vector, uuid, text[], integer, timestamptz) to service_role;
revoke all on function public.recall_or_tsquery(text) from public, anon;
grant execute on function public.recall_or_tsquery(text) to authenticated, service_role;

comment on function public.recall_hybrid is
  'A3-1 hybrid recall: semantic + lexical + fuzzy + recency + Weight + Depth + provenance + Thread + Facet, with per-signal scores. service_role only; owner is p_user_id.';
