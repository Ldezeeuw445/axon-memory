-- The uniqueness of a fact has to be something PostgREST can name.
--
-- The first index was on (user_id, lower(statement)). Postgres is happy with a
-- functional index, but an upsert has to name its conflict target by column,
-- and there is no column called lower(statement) — so every write would have
-- failed with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". Same intent, expressed as a column the upsert can point at.

drop index if exists public.memory_facts_user_statement_idx;

alter table public.memory_facts
  add column if not exists statement_key text
  generated always as (lower(btrim(statement))) stored;

create unique index if not exists memory_facts_user_key_idx
  on public.memory_facts (user_id, statement_key);
