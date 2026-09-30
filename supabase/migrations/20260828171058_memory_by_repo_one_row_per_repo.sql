-- One row per repository, not one per branch.
--
-- Grouping on branch split every repo in two: the commits carry the branch they
-- were read from, and the repository's own description card carries none. So
-- AXE CORE appeared twice — 893 items on `orchestrator` and 1 item on nothing —
-- which is exactly the kind of duplicate that makes a list look untrustworthy
-- even when both halves are correct.
--
-- The branch is still worth showing, so it is carried as the one the commits
-- actually came from rather than dropped.
create or replace view public.memory_by_repo
with (security_invoker = on) as
select i.user_id,
       i.metadata->>'repo' as repo,
       -- max() over a column that is null on the description card and constant
       -- across the commits: it returns the branch when there is one.
       max(i.metadata->>'branch') as branch,
       max(i.project_id::text)::uuid as project_id,
       count(*)           as items,
       max(i.occurred_at) as newest,
       min(i.occurred_at) as oldest
from public.memory_items i
where i.origin_key = 'github'
  and i.retired_at is null
  and i.metadata->>'repo' is not null
group by i.user_id, i.metadata->>'repo';
