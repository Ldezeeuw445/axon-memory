-- Memories were unfindable by their own title.
--
-- 0001_init.sql already indexes the right thing:
--
--   using gin (to_tsvector('english', coalesce(title,'') || ' ' || content))
--
-- but memory-core's keyword path searched the `content` column alone. So a
-- memory titled "API Architecture Decision" could not be recalled by asking
-- about the API architecture — the words live in the title, and the query
-- never looked there. It also meant the GIN index above was never actually
-- used, since the query expression didn't match the indexed one.
--
-- PostgREST can't run `textSearch` against an expression, so the search moves
-- into a function that matches the index exactly. Entities are folded in as
-- well: they are the extracted topics, and they are what a person is most
-- likely to search by.
--
-- Entities are read with jsonb_to_tsvector and an explicit 'english' config.
-- The two-argument form inherits the session's default config and is only
-- STABLE, so it cannot be indexed; unnesting the array with a subquery is
-- rejected outright ("cannot use subquery in index expression"). The
-- three-argument form is IMMUTABLE and indexes cleanly.

create or replace function public.search_memory_items(
  p_user_id uuid,
  p_query text,
  p_limit int default 60
)
returns setof public.memory_items
language sql
stable
security invoker
set search_path = public
as $$
  select *
  from public.memory_items
  where user_id = p_user_id
    and (
      to_tsvector('english', coalesce(title, '') || ' ' || content)
        @@ websearch_to_tsquery('english', p_query)
      or jsonb_to_tsvector('english', entities, '["string"]')
        @@ websearch_to_tsquery('english', p_query)
    )
  order by occurred_at desc
  limit p_limit;
$$;

-- security invoker keeps the caller's RLS in force, so a user can still only
-- reach their own rows even though the function takes a user id.
grant execute on function public.search_memory_items(uuid, text, int)
  to authenticated, service_role;

create index if not exists memory_items_entities_fts
  on public.memory_items
  using gin (jsonb_to_tsvector('english', entities, '["string"]'));
