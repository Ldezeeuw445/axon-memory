-- Remember how far back we got, so the rest can follow.
--
-- A first sync takes what it can afford — a hundred and twenty commits per
-- repository — and then the cursor jumps to now. Everything older than that
-- window becomes unreachable: not slow to reach, unreachable, because every
-- later run asks only for what is new. Four of this account's five repositories
-- were cut short on their first pass, and without this the older half of AXE
-- CORE would simply never arrive.
--
-- Two columns and the walk becomes resumable. `backfill_until` is the oldest
-- commit reached so far; the next run asks GitHub for commits *before* that and
-- moves the mark further back. `backfill_done` is set when a page comes back
-- short, which is GitHub saying there is nothing older.
--
-- Null `backfill_until` means the walk has not started. That is the right
-- default for a repository added today: its first sync reaches back on its own,
-- and the backfill picks up from wherever that stopped.
alter table public.project_repos
  add column if not exists backfill_until timestamptz,
  add column if not exists backfill_done  boolean not null default false;

comment on column public.project_repos.backfill_until is
  'Oldest commit date reached while walking backwards. The next run asks for commits before this.';

comment on column public.project_repos.backfill_done is
  'True once GitHub has answered with a short page — there is nothing older to fetch.';
