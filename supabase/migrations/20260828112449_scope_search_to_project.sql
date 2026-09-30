-- Both search paths learn about projects.
--
-- The recency path filters in the client, but a recall with a query goes
-- through one of these two functions instead — and a filter that holds for the
-- default path and leaks on the search path is worse than no filter, because it
-- fails exactly when somebody is looking for something specific and then cannot
-- be trusted again.
--
-- p_project_id null means "everything", which is what an unscoped recall wants
-- and what every existing caller passes by omission. A project id means that
-- project plus the memories that belong to no project — mail, identity, a
-- conclusion about how somebody works. Those are true whichever app is open,
-- and withholding them would make a scoped recall worse than an unscoped one.
--
-- Dropped and recreated rather than replaced: adding a defaulted parameter to
-- an existing function makes an overload, and a three-argument call would then
-- be ambiguous between the two and fail outright.

drop function if exists public.search_memory_items(uuid, text, integer);

create function public.search_memory_items(
  p_user_id uuid,
  p_query text,
  p_limit integer default 60,
  p_project_id uuid default null
)
returns setof public.memory_items
language sql
stable
set search_path to 'public'
as $function$
  select *
  from public.memory_items
  where user_id = p_user_id
    and retired_at is null
    and (p_project_id is null or project_id = p_project_id or project_id is null)
    and (
      to_tsvector('english', coalesce(title, '') || ' ' || content)
        @@ websearch_to_tsquery('english', p_query)
      or jsonb_to_tsvector('english', entities, '["string"]')
        @@ websearch_to_tsquery('english', p_query)
    )
  order by occurred_at desc
  limit p_limit;
$function$;

drop function if exists public.match_memory_items(uuid, vector, integer);

create function public.match_memory_items(
  p_user_id uuid,
  p_query_embedding vector,
  p_match_count integer default 20,
  p_project_id uuid default null
)
returns table (
  id uuid,
  content_type text,
  title text,
  content text,
  entities jsonb,
  occurred_at timestamptz,
  source_type text,
  similarity double precision
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    m.id,
    m.content_type,
    m.title,
    m.content,
    m.entities,
    m.occurred_at,
    m.source_type,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.memory_embeddings e
  join public.memory_items m on m.id = e.memory_item_id
  where m.user_id = p_user_id
    and m.retired_at is null
    and (p_project_id is null or m.project_id = p_project_id or m.project_id is null)
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$function$;
