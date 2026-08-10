-- Real semantic search: an HNSW index for fast cosine-distance lookups, and
-- a SECURITY DEFINER RPC that does the vector similarity search scoped to
-- one user. context-pack/mcp-server call this via admin.rpc(...) — it's
-- called with the service role (RLS is bypassed for that role anyway), so
-- the function itself enforces the user_id filter explicitly. It is NOT
-- exposed to anon/authenticated roles directly; only the service role can
-- call it, matching how every other edge function talks to the DB here.

create index if not exists memory_embeddings_embedding_hnsw_idx
  on public.memory_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function public.match_memory_items(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 20
)
returns table (
  id uuid,
  content_type text,
  title text,
  content text,
  entities jsonb,
  occurred_at timestamptz,
  source_type text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
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
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke all on function public.match_memory_items(uuid, vector, int) from public;
revoke all on function public.match_memory_items(uuid, vector, int) from anon;
revoke all on function public.match_memory_items(uuid, vector, int) from authenticated;
grant execute on function public.match_memory_items(uuid, vector, int) to service_role;
