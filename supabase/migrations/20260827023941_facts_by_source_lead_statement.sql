-- A cluster should be able to say what it is about before it is opened, and
-- the statement it says has to be one this source actually contributed to.
-- Picking it client-side meant "most recent fact in this category" across the
-- whole account, so a GITHUB / DECISION cluster could quote a conclusion drawn
-- entirely from Gmail. The join that knows which source a fact came from is
-- here, so the answer belongs here too.
create or replace view public.memory_facts_by_source
with (security_invoker = on) as
with joined as (
  select f.user_id,
         i.origin_key as source_id,
         f.category,
         f.id   as fact_id,
         i.id   as item_id,
         f.statement,
         f.last_confirmed_at
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  where f.superseded_at is null
    and i.origin_key is not null
)
select user_id,
       source_id,
       category,
       count(distinct fact_id) as fact_count,
       count(distinct item_id) as item_count,
       (array_agg(statement order by last_confirmed_at desc nulls last))[1]
         as lead_statement
from joined
group by user_id, source_id, category;
