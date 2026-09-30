-- Throwing a memory away did not throw away what was concluded from it.
--
-- Retiring a memory is the withdrawal gesture in this product, and recall
-- honours it: both queries in memory-core filter `retired_at is null`, so the
-- raw material stops travelling the moment it is retired.
--
-- The conclusion drawn from it does not. `memory_facts` has no retired filter
-- and nothing has ever written `superseded_at` — grepped across supabase/ and
-- src/, no assignment anywhere — so a fact keeps going into every context pack
-- for ever. Retire the note that said where you live, and the sentence "lives
-- in Rotterdam" that was distilled out of it still goes to every assistant you
-- connect. The withdrawal worked on the copy nobody reads and not on the
-- version that actually travels.
--
-- ## Why this half needs no model
--
-- B9's other half — noticing that "uses Postgres" and "uses MySQL" contradict
-- each other — is a judgement, and it waits on the distiller having credit.
-- This half is arithmetic: a conclusion whose every source has been withdrawn
-- has nothing left holding it up. No opinion required, so it does not wait.
--
-- ## Why "every" and not "any"
--
-- A conclusion drawn from five memories where one is retired still stands on
-- the other four. Superseding on the first retirement would quietly delete
-- conclusions people are still entitled to. Only when nothing live is left
-- does the fact lose its footing.
--
-- ## Restoring
--
-- Retiring is recoverable, so this has to be too, and it may only undo its own
-- work: a fact superseded because a human contradicted it must not come back
-- to life because an unrelated source item was restored. That is what
-- `superseded_reason` is for, and it is the T8 complaint as well — a column
-- saying when something stopped being true, and nothing saying what stopped
-- it, is a tombstone rather than history.

alter table public.memory_facts
  -- The fact that replaced this one. Null for a supersession with no
  -- successor, which is exactly the case below.
  add column if not exists superseded_by uuid references public.memory_facts(id) on delete set null,
  -- What did it. 'source-retired' is written here; 'contradicted' is the
  -- distiller's to write once it can tell.
  add column if not exists superseded_reason text;
comment on column public.memory_facts.superseded_by is
  'The conclusion that replaced this one, when there is one.';
comment on column public.memory_facts.superseded_reason is
  'What ended it: source-retired (every memory behind it was withdrawn) or contradicted (a later conclusion disagreed).';
-- `= any(array)` cannot use an index; the containment form can, and this runs
-- on every retire and every restore.
create index if not exists memory_facts_source_items_idx
  on public.memory_facts using gin (source_item_ids);
create or replace function public.resync_facts_for_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nothing live behind it any more: it loses its footing.
  update public.memory_facts f
     set superseded_at = now(),
         superseded_reason = 'source-retired'
   where f.user_id = new.user_id
     and f.source_item_ids @> array[new.id]
     and f.superseded_at is null
     -- A fact with no sources at all is a data fault, not a withdrawn one.
     -- Superseding those would silently empty the memory of anybody whose
     -- distiller ever wrote one.
     and cardinality(f.source_item_ids) > 0
     and not exists (
       select 1
         from public.memory_items i
        where i.id = any (f.source_item_ids)
          and i.retired_at is null
     );

  -- Something behind it is back. Only undo what this function did.
  update public.memory_facts f
     set superseded_at = null,
         superseded_reason = null
   where f.user_id = new.user_id
     and f.source_item_ids @> array[new.id]
     and f.superseded_reason = 'source-retired'
     and exists (
       select 1
         from public.memory_items i
        where i.id = any (f.source_item_ids)
          and i.retired_at is null
     );

  return new;
end;
$$;
comment on function public.resync_facts_for_item() is
  'A conclusion stands only while at least one memory behind it is live. Runs on retire and on restore; each half is a no-op in the wrong direction.';
drop trigger if exists resync_facts_on_retire on public.memory_items;
create trigger resync_facts_on_retire
  after update of retired_at on public.memory_items
  for each row
  when (old.retired_at is distinct from new.retired_at)
  execute function public.resync_facts_for_item();
-- ── Proving it, here, on the database it will run against ──────────────
--
-- This trigger cannot be reached by the test suite: vitest does not have a
-- Postgres, and the edge functions are Deno. So it proves itself at the moment
-- it is installed, against real rows, and a failed assertion aborts the whole
-- migration — which means nothing is applied and the fault is on the screen of
-- the person who ran it, rather than discovered a month later by somebody
-- whose retired note was still being quoted.
--
-- The inner block is unwound by a sentinel exception, so no test row survives.
do $$
declare
  uid    uuid;
  item_a uuid;
  item_b uuid;
  fact_1 uuid;
  fact_2 uuid;
  tag    text := gen_random_uuid()::text;
  state  timestamptz;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise notice 'resync_facts_for_item: no account to test against, trigger installed unverified';
    return;
  end if;

  begin
    insert into public.memory_items (user_id, source_type, content_type, content, title)
    values (uid, 'manual', 'note', 'selftest a ' || tag, 'selftest ' || tag)
    returning id into item_a;

    insert into public.memory_items (user_id, source_type, content_type, content, title)
    values (uid, 'manual', 'note', 'selftest b ' || tag, 'selftest ' || tag)
    returning id into item_b;

    -- Stands on one memory only.
    insert into public.memory_facts (user_id, statement, category, source_item_ids)
    values (uid, 'selftest single ' || tag, 'tool', array[item_a])
    returning id into fact_1;

    -- Stands on two.
    insert into public.memory_facts (user_id, statement, category, source_item_ids)
    values (uid, 'selftest double ' || tag, 'tool', array[item_a, item_b])
    returning id into fact_2;

    -- Retire the first memory.
    update public.memory_items set retired_at = now() where id = item_a;

    select superseded_at into state from public.memory_facts where id = fact_1;
    if state is null then
      raise exception 'a conclusion resting only on a withdrawn memory kept travelling';
    end if;

    select superseded_at into state from public.memory_facts where id = fact_2;
    if state is not null then
      raise exception 'a conclusion still standing on a live memory was withdrawn with it';
    end if;

    -- Restore it.
    update public.memory_items set retired_at = null where id = item_a;

    select superseded_at into state from public.memory_facts where id = fact_1;
    if state is not null then
      raise exception 'restoring a memory did not bring its conclusion back';
    end if;

    raise exception 'axon-selftest-rollback';
  exception when others then
    if sqlerrm <> 'axon-selftest-rollback' then
      raise;
    end if;
  end;

  raise notice 'resync_facts_for_item: verified against real rows, none kept';
end;
$$;
