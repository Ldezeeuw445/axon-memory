-- Conclusions per connected account, not per app.
--
-- memory_facts_by_source groups on origin_key, which is the provider: two
-- Gmail accounts land in one bucket and two Supabase projects become one
-- summit. Every memory already records which connection carried it —
-- memory_items.source_connection_id, set on 505 of 511 rows — so the split
-- exists in the data and only the grouping was coarser than the truth.
--
-- Assistant-written memories are deliberately absent here: nothing written
-- through the gateway has a source connection, and an assistant has one
-- account by definition. Those summits keep asking memory_facts_by_source,
-- which is the right question for them.
create or replace view public.memory_facts_by_connection
with (security_invoker = on) as
with joined as (
  select f.user_id,
         i.source_connection_id as connection_id,
         f.category,
         f.id   as fact_id,
         i.id   as item_id,
         f.statement,
         f.last_confirmed_at
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  where f.superseded_at is null
    and i.source_connection_id is not null
)
select user_id,
       connection_id,
       category,
       count(distinct fact_id) as fact_count,
       count(distinct item_id) as item_count,
       (array_agg(statement order by last_confirmed_at desc nulls last))[1]
         as lead_statement
from joined
group by user_id, connection_id, category;

-- The same rows unfolded, so a cluster can be opened. Same reason as
-- memory_facts_with_source: the join that decides which account a conclusion
-- belongs to lives here, and a second copy in the client is how the two drift.
create or replace view public.memory_facts_with_connection
with (security_invoker = on) as
select distinct
       f.user_id,
       i.source_connection_id as connection_id,
       f.category,
       f.id as fact_id,
       f.statement,
       f.last_confirmed_at
from public.memory_facts f
join public.memory_items i on i.id = any (f.source_item_ids)
where f.superseded_at is null
  and i.source_connection_id is not null;
