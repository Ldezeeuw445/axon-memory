-- Start the walk where the first pass stopped, not at today.
--
-- Without this every repository begins its backfill from now and re-reads the
-- window it already has. Deduping makes that harmless and it is still a hundred
-- wasted requests per repository per run, and it would delay the part that is
-- actually missing by exactly as long.
--
-- The oldest memory already stored for a repository is precisely how far the
-- forward pass reached, so it is the right place to resume from. Repositories
-- with nothing stored keep a null mark, which means "start from the top" — the
-- right answer for one added but never synced.
update public.project_repos r
set backfill_until = oldest.at
from (
  select i.user_id,
         i.metadata->>'repo' as full_name,
         min(i.occurred_at)  as at
  from public.memory_items i
  where i.metadata ? 'repo'
    and i.content_type = 'commit'
  group by 1, 2
) as oldest
where oldest.user_id = r.user_id
  and oldest.full_name = r.full_name
  and r.backfill_until is null;
