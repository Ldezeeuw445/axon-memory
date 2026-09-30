-- A fan per registration, so every summit opens the same way.
--
-- Pressing one of the three Claudes went nowhere: the per-source views are
-- keyed on source_id, a `key:<uuid>` summit matches none of them, so it came
-- back with no conclusions at all — and a summit with nothing above it does
-- not climb. Three accounts on one mountain, and only the mountain could be
-- opened.
--
-- The split was already in the data. memory_facts.source_item_ids names the
-- memories a conclusion was drawn from, and every memory records the
-- registration that wrote it. This is the api_key mirror of
-- memory_facts_by_connection: the same shape, the same grouping, the other
-- half of "which account did this come from".

create or replace view public.memory_facts_by_api_key
with (security_invoker = on) as
with joined as (
  select f.user_id,
         i.api_key_id,
         f.category,
         f.id   as fact_id,
         i.id   as item_id,
         f.statement,
         f.last_confirmed_at
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  where f.superseded_at is null
    and i.api_key_id is not null
)
select user_id,
       api_key_id,
       category,
       count(distinct fact_id) as fact_count,
       count(distinct item_id) as item_count,
       (array_agg(statement order by last_confirmed_at desc nulls last))[1]
         as lead_statement
from joined
group by user_id, api_key_id, category;
create or replace view public.memory_facts_with_api_key
with (security_invoker = on) as
select distinct
       f.user_id,
       i.api_key_id,
       f.category,
       f.id as fact_id,
       f.statement,
       f.last_confirmed_at
from public.memory_facts f
join public.memory_items i on i.id = any (f.source_item_ids)
where f.superseded_at is null
  and i.api_key_id is not null;
