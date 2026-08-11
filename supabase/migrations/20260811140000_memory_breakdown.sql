-- The dashboard's "Memory Breakdown" was a fixed list — Documents 38%,
-- Goals & OKRs 22%, and so on — rendered identically whether a user had ten
-- thousand memories or none. It sat directly under a "Memory Nodes: 0" card,
-- contradicting it.
--
-- PostgREST cannot express a GROUP BY, which is presumably why it was faked.
-- This does the counting in the database, so the panel can show what is
-- actually there, including nothing.

create or replace function public.memory_breakdown(p_user_id uuid)
returns table (content_type text, item_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select content_type, count(*)::bigint as item_count
  from public.memory_items
  where user_id = p_user_id
  group by content_type
  order by count(*) desc, content_type;
$$;

-- security invoker keeps RLS in force: the user id argument cannot be used to
-- count another user's memories.
grant execute on function public.memory_breakdown(uuid) to authenticated, service_role;
