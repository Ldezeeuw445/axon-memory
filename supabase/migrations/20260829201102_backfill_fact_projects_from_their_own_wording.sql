-- The distiller names the app in almost every sentence it writes: "… in AXE
-- Companion OS", "… in AXE-CORE", "… in AXON Memory", "… in Trading OS". Those
-- 298 conclusions were filed as applying everywhere only because the batch they
-- came from mixed four codebases, and the statement itself says otherwise.
--
-- Matched on the project's own name and the spellings that actually appear in
-- the data, and only assigned when exactly one project is named — a sentence
-- mentioning two of them genuinely does apply to both, and guessing between
-- them would be worse than leaving it everywhere.
--
-- Only for facts that came from a mixed batch. Anything already scoped from its
-- source items keeps that, because where the material came from is better
-- evidence than what a sentence happens to mention.

with pattern as (
  select p.id, p.user_id, v.rx
  from public.projects p
  cross join lateral (values
    (case p.key
      when 'axe-companion' then '(axe[ -]companion)'
      when 'axe-core'      then '(axe[ -]core)'
      when 'trading-os'    then '(trading[ -]os)'
      when 'axon'          then '(axon memory|axon-memory)'
      else null
    end)
  ) as v(rx)
  where v.rx is not null
),
named as (
  select f.id as fact_id,
         count(*) as hits,
         (array_agg(pt.id))[1] as only_project
  from public.memory_facts f
  join pattern pt on pt.user_id = f.user_id and f.statement ~* pt.rx
  where f.project_id is null and f.superseded_at is null
  group by f.id
)
update public.memory_facts f
set project_id = n.only_project
from named n
where n.fact_id = f.id and n.hits = 1;
