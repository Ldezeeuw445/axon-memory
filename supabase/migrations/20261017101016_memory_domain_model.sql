-- A1-1: the canonical Memory domain model, expressed over the existing tables.
--
-- Additive only. No column is dropped, renamed, retyped or backfilled; every new
-- column is NULL or has a constant default (metadata-only in Postgres 11+, no
-- table rewrite). Canon nouns (Lexicon §1): Memory, Thread, Core, Facet, Weight,
-- Depth. Verbs: Capture, Recall, Retire, Restore, Delete (+ supersession, §15).
-- Contract mirrored in supabase/functions/_shared/domain.ts and docs/MEMORY_MODEL.md;
-- tests/schema/memory_model.sql asserts the two agree.
--
-- Lifecycle is stored, not duplicated: `retired_at` already means "left active
-- recall" and every recall path filters on it. Supersession therefore sets
-- retired_at too, with retired_reason = 'superseded' and superseded_by pointing
-- at the newer truth — so a superseded memory drops out of every existing recall
-- path and withdraws its facts through the existing trigger, while its row (the
-- previous state) is kept intact.

-- ── Memory: new nullable/defaulted columns ─────────────────────────────────────
alter table public.memory_items
  add column if not exists retired_reason  text,
  add column if not exists superseded_by   uuid references public.memory_items(id) on delete set null,
  add column if not exists anchored_weight smallint,
  add column if not exists facets          text[] not null default '{}',
  add column if not exists confidence      real,
  add column if not exists updated_at      timestamptz;

alter table public.memory_items
  add constraint memory_items_retired_reason_len check (retired_reason is null or char_length(retired_reason) between 1 and 200),
  add constraint memory_items_superseded_shape  check (superseded_by is null or (superseded_by <> id and coalesce(retired_reason, '') = 'superseded')),
  add constraint memory_items_anchored_weight   check (anchored_weight is null or anchored_weight between 1 and 5),
  add constraint memory_items_confidence_range  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  add constraint memory_items_facets_shape      check (array_to_string(facets, ',') ~ '^([a-z0-9][a-z0-9-]{0,31}(,[a-z0-9][a-z0-9-]{0,31})*)?$');

comment on column public.memory_items.retired_reason  is 'Why it left active recall: user | superseded | source-revoked | free text (<=200). NULL while active.';
comment on column public.memory_items.superseded_by   is 'The newer memory that replaced this one (contradiction/supersession, spec §15). Row kept as the previous state.';
comment on column public.memory_items.anchored_weight is 'Anchor: explicit Weight 1-5 set by the person, overrides the computed Weight.';
comment on column public.memory_items.facets          is 'Facets this memory is seen through (lowercase slugs). One memory, many facets — never duplicated per app.';
comment on column public.memory_items.confidence      is '0..1 where the capture path knows it (inferred memories). NULL = stated directly.';

create index if not exists memory_items_superseded_by_idx on public.memory_items (superseded_by) where superseded_by is not null;

-- ── Relationships between memories (supersedes / contradicts / relates / weaves) ─
create table if not exists public.memory_relations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  from_memory_id uuid not null references public.memory_items(id) on delete cascade,
  to_memory_id   uuid not null references public.memory_items(id) on delete cascade,
  kind           text not null check (kind in ('supersedes', 'contradicts', 'relates', 'weaves')),
  reason         text check (reason is null or char_length(reason) <= 500),
  created_by     text,
  created_at     timestamptz not null default now(),
  unique (from_memory_id, to_memory_id, kind),
  check (from_memory_id <> to_memory_id)
);
create index if not exists memory_relations_to_idx on public.memory_relations (to_memory_id);
create index if not exists memory_relations_user_idx on public.memory_relations (user_id, created_at desc);
alter table public.memory_relations enable row level security;
create policy memory_relations_select_own on public.memory_relations for select to authenticated using (user_id = auth.uid());
create policy memory_relations_delete_own on public.memory_relations for delete to authenticated using (user_id = auth.uid());
create policy memory_relations_insert_own on public.memory_relations for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.memory_items m where m.id = from_memory_id and m.user_id = auth.uid())
    and exists (select 1 from public.memory_items m where m.id = to_memory_id and m.user_id = auth.uid()));
revoke all on public.memory_relations from anon;

-- ── Observable lifecycle (spec §4: each stage must be observable) ───────────────
-- Never carries memory content: a delete must not leave the deleted text behind.
create table if not exists public.memory_lifecycle_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  memory_item_id uuid not null,            -- no FK: the event outlives a deleted memory
  op             text not null check (op in ('capture', 'retire', 'restore', 'supersede', 'delete')),
  actor          text check (actor is null or char_length(actor) <= 120),
  detail         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists memory_lifecycle_events_user_idx on public.memory_lifecycle_events (user_id, created_at desc);
create index if not exists memory_lifecycle_events_item_idx on public.memory_lifecycle_events (memory_item_id);
alter table public.memory_lifecycle_events enable row level security;
create policy memory_lifecycle_events_select_own on public.memory_lifecycle_events for select to authenticated using (user_id = auth.uid());
create policy memory_lifecycle_events_insert_own on public.memory_lifecycle_events for insert to authenticated with check (user_id = auth.uid());
revoke all on public.memory_lifecycle_events from anon;

-- ── Weight and Depth, computed (never shown as numbers in the product) ──────────
-- Weight 1..5: an Anchor wins; otherwise 1 + distinct assistants that recalled it
-- (max 2; distinct clients, so one automation hammering it cannot inflate it)
-- + 1 if it sits in a dense part of the graph (>= 3 entity links)
-- + 1 if a person or assistant captured it on purpose (source_type = 'manual').
create or replace function public.memory_weight(p_anchor smallint, p_recall_clients integer, p_links integer, p_source_type text)
  returns smallint language sql immutable set search_path = public as $$
  select coalesce(p_anchor,
    least(5, 1 + least(coalesce(p_recall_clients, 0), 2)
             + case when coalesce(p_links, 0) >= 3 then 1 else 0 end
             + case when p_source_type = 'manual' then 1 else 0 end))::smallint
$$;
-- Depth 0..3 — how far down time has carried it: 0 surface (< 7 days),
-- 1 near (< 30 days), 2 deep (< 365 days), 3 bedrock (older, or retired: once
-- retired a memory settles, Lexicon §3).
create or replace function public.memory_depth(p_occurred_at timestamptz, p_retired_at timestamptz, p_now timestamptz default now())
  returns smallint language sql immutable set search_path = public as $$
  select (case
    when p_retired_at is not null then 3
    when p_occurred_at is null or p_now - p_occurred_at < interval '7 days' then 0
    when p_now - p_occurred_at < interval '30 days' then 1
    when p_now - p_occurred_at < interval '365 days' then 2
    else 3 end)::smallint
$$;
revoke all on function public.memory_weight(smallint, integer, integer, text), public.memory_depth(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.memory_weight(smallint, integer, integer, text), public.memory_depth(timestamptz, timestamptz, timestamptz) to authenticated, service_role;

-- ── The canonical Memory, as one read surface ───────────────────────────────────
create or replace view public.memories with (security_invoker = on) as
select
  m.id,
  m.user_id                                             as owner_id,
  m.title,
  m.content,
  lower(regexp_replace(btrim(coalesce(m.title || ' ', '') || m.content), '\s+', ' ', 'g')) as normalized_content,
  m.content_type,
  -- provenance
  m.source_type,
  m.external_id                                         as source_id,
  m.origin_key                                          as source_application,
  m.source_connection_id,
  m.api_key_id,
  case when m.source_connection_id is not null then 'connector'
       when m.api_key_id is not null           then 'agent'
       when m.source_type = 'manual'           then 'direct'
       else 'unknown' end                               as capture_channel,
  m.occurred_at                                         as source_at,
  m.created_at,
  coalesce(m.updated_at, m.created_at)                  as updated_at,
  -- shape
  m.project_id                                          as thread_id,
  m.facets,
  m.entities,
  m.confidence,
  -- lifecycle
  case when m.retired_at is null then 'active'
       when m.retired_reason = 'superseded' then 'superseded'
       else 'retired' end                               as lifecycle_state,
  m.retired_at,
  m.retired_reason,
  m.superseded_by,
  -- strength
  m.anchored_weight,
  coalesce(r.recall_clients, 0)                         as recall_clients,
  coalesce(r.recall_count, 0)                           as recall_count,
  coalesce(l.link_count, 0)                             as link_count,
  public.memory_weight(m.anchored_weight, r.recall_clients, l.link_count, m.source_type) as weight,
  public.memory_depth(m.occurred_at, m.retired_at)      as depth,
  exists (select 1 from public.memory_embeddings e where e.memory_item_id = m.id) as has_embedding
from public.memory_items m
left join lateral (select count(distinct x.client_key)::int as recall_clients, sum(x.recall_count)::int as recall_count
                   from public.memory_recalls x where x.memory_item_id = m.id) r on true
left join lateral (select count(*)::int as link_count from public.entity_links y where y.memory_item_id = m.id) l on true;

-- ── Thread: a continuous strand about one thing. Today a project + its state ────
create or replace view public.threads with (security_invoker = on) as
select p.id, p.user_id as owner_id, p.key, p.name, p.colour, p.created_at,
       t.state, t.updated_by as state_updated_by, t.updated_at as state_updated_at,
       (select count(*) from public.memory_items m where m.project_id = p.id and m.retired_at is null)::int as active_memories
from public.projects p
left join public.project_threads t on t.project_id = p.id and t.user_id = p.user_id;

-- ── Core: the one entity holding every Thread ───────────────────────────────────
create or replace function public.core_summary(p_user_id uuid default null)
  returns table (owner_id uuid, memories bigint, active bigint, retired bigint, superseded bigint, threads bigint, facets text[])
  language sql stable security invoker set search_path = public as $$
  select coalesce(auth.uid(), p_user_id),
         count(*), count(*) filter (where m.retired_at is null),
         count(*) filter (where m.retired_at is not null and m.retired_reason is distinct from 'superseded'),
         count(*) filter (where m.retired_reason = 'superseded'),
         (select count(*) from public.projects p where p.user_id = coalesce(auth.uid(), p_user_id)),
         coalesce((select array_agg(distinct f order by f) from public.memory_items x, unnest(x.facets) f
                   where x.user_id = coalesce(auth.uid(), p_user_id)), '{}')
  from public.memory_items m where m.user_id = coalesce(auth.uid(), p_user_id)
$$;
revoke all on function public.core_summary(uuid) from public, anon;
grant execute on function public.core_summary(uuid) to authenticated, service_role;

revoke all on public.memories, public.threads from anon;
grant select on public.memories, public.threads to authenticated, service_role;
