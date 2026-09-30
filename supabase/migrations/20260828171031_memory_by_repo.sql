-- GitHub is not one thing.
--
-- Opening the GitHub summit gives six category clusters drawn from every
-- repository at once — 894 commits from AXE CORE and 140 from AXON, folded into
-- one answer. That is the same mistake the flat account made before projects
-- existed, one level down: the loudest repository wins and the map cannot say
-- which repo a conclusion came from.
--
-- A repository is the unit a person actually thinks in. This gives the layer
-- above the fan: which repos this source holds, how much each carries, and
-- which project it belongs to.
--
-- Only GitHub has repositories, so this is deliberately narrow rather than a
-- general "sub-source" abstraction. When a second source grows the same shape,
-- that is the moment to generalise — not before, on a guess about which one.
create or replace view public.memory_by_repo
with (security_invoker = on) as
select i.user_id,
       i.metadata->>'repo'   as repo,
       i.metadata->>'branch' as branch,
       i.project_id,
       count(*)                     as items,
       max(i.occurred_at)           as newest,
       min(i.occurred_at)           as oldest
from public.memory_items i
where i.origin_key = 'github'
  and i.retired_at is null
  and i.metadata->>'repo' is not null
group by i.user_id, i.metadata->>'repo', i.metadata->>'branch', i.project_id;

-- The conclusions a single repository contributed to.
--
-- Same join as memory_facts_by_source, one level finer. A fact drawn from two
-- repositories counts for both, which is the same claim the source-level view
-- makes: these are the conclusions this repo helped reach, not the ones it
-- reached alone.
create or replace view public.memory_facts_by_repo
with (security_invoker = on) as
with joined as (
  select f.user_id,
         i.metadata->>'repo' as repo,
         f.category,
         f.id as fact_id,
         i.id as item_id,
         f.statement,
         f.last_confirmed_at
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  where f.superseded_at is null
    and i.origin_key = 'github'
    and i.metadata->>'repo' is not null
)
select user_id,
       repo,
       category,
       count(distinct fact_id) as fact_count,
       count(distinct item_id) as item_count,
       (array_agg(statement order by last_confirmed_at desc nulls last))[1] as lead_statement
from joined
group by user_id, repo, category;
