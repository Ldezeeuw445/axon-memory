-- The rows behind a cluster, so one can be opened.
--
-- memory_facts_by_source counts; opening a cluster needs the statements it
-- counted. The join that decides which source a fact belongs to lives in the
-- view above, and duplicating it in the client is how the two drift apart —
-- so the same join is exposed one row per fact per source instead of folded
-- into a count.
--
-- A fact drawn from two sources appears once under each, which is the same
-- claim the count makes: Claude's conclusions are the ones Claude helped
-- reach, and the same conclusion can also be Cursor's.
create or replace view public.memory_facts_with_source
with (security_invoker = on) as
select distinct
       f.user_id,
       i.origin_key as source_id,
       f.category,
       f.id         as fact_id,
       f.statement,
       f.last_confirmed_at
from public.memory_facts f
join public.memory_items i on i.id = any (f.source_item_ids)
where f.superseded_at is null
  and i.origin_key is not null;
