-- A conclusion has to say which project it is about.
--
-- Scoping was built into the raw items and never into the facts drawn from
-- them, and the facts are the authoritative half of a recall. So asking for
-- `trading-os` returned forty decisions about AXE Companion, stated as
-- settled, with nothing marking them as belonging somewhere else. That is
-- exactly the failure the project key exists to prevent, and the instruction
-- telling agents to pass it was describing a protection that did not exist.
--
-- Null means everywhere, not unknown — the same rule memory_items already
-- follows. A preference about how somebody likes errors written is true in
-- every repository; a decision about a news provider is not.

alter table public.memory_facts
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on column public.memory_facts.project_id is
  'The project this conclusion belongs to, or null for one that holds everywhere. Derived from the items it was drawn from: one project if they agree, null if they do not.';

create index if not exists memory_facts_user_project_idx
  on public.memory_facts (user_id, project_id, last_confirmed_at desc)
  where superseded_at is null;

-- Backfill from the material each fact came from. A fact whose items all sit in
-- one project belongs to it; one drawn from a mixed batch stays null, because
-- guessing which of two projects it meant is worse than saying it applies to
-- both.
with agreed as (
  select f.id,
         count(distinct i.project_id) filter (where i.project_id is not null) as projects,
         (array_agg(distinct i.project_id) filter (where i.project_id is not null))[1] as only_project
  from public.memory_facts f
  join public.memory_items i on i.id = any (f.source_item_ids)
  group by f.id
)
update public.memory_facts f
set project_id = a.only_project
from agreed a
where a.id = f.id
  and a.projects = 1
  and f.project_id is null;
