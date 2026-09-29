-- Per-source totals, so the graph panel can say what share of your memory a
-- source actually is.
--
-- The panel already claimed "summit height reflects how much this source has
-- contributed" and then showed no number at all. memory_breakdown answers the
-- same question by content_type for the dashboard; this one answers it by
-- source_type, which is what a summit represents.
--
-- PostgREST cannot express a GROUP BY, hence an RPC rather than a select.

create or replace function public.memory_source_breakdown(p_user_id uuid)
returns table (source_type text, item_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select source_type, count(*)::bigint as item_count
  from public.memory_items
  where user_id = p_user_id
  group by source_type
  order by count(*) desc, source_type;
$$;

-- security invoker keeps RLS in force: the argument cannot be used to count
-- another user's memories.
grant execute on function public.memory_source_breakdown(uuid) to authenticated, service_role;
