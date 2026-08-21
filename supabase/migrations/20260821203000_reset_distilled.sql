-- Give the material back.
--
-- The first distiller marked a batch as read whether or not the model had
-- actually answered, so a failing model call retired items permanently with
-- nothing derived from them. The code now distinguishes "concluded nothing"
-- from "never got an answer"; this hands back everything marked under the old
-- behaviour.
--
-- Guarded on there being no facts at all, so it cannot undo real work if it is
-- ever replayed against a database where distillation has since succeeded.
do $$
begin
  if not exists (select 1 from public.memory_facts) then
    update public.memory_items set distilled_at = null where distilled_at is not null;
  end if;
end $$;
