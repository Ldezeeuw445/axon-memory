-- The column measured cost and was named saving.
--
-- context_pack_logs.approx_tokens_saved held Math.round(used / CHARS_PER_TOKEN),
-- where `used` counts the characters AXON puts INTO a context pack. Those are
-- tokens the assistant has to read — spent, not saved. The same measurement was
-- already recorded correctly one field away as approx_tokens.
--
-- It surfaced on both dashboards as "Tokens Saved", with a dollar figure beside
-- it that was the cost of the pack presented as money back.
--
-- There is a real saving. Without this layer an assistant has to go and find the
-- same context — read files, grep, walk commits — and that costs thousands of
-- tokens of tool output to arrive at what a few dozen distilled conclusions say
-- in a few hundred. But that is a comparison against a session that never
-- happened, and it cannot be measured from here. What can be measured honestly
-- is what was delivered, and separately the compression the distiller achieves:
-- 993 commits to 57 conclusions is a ratio read straight from the tables.
alter table public.context_pack_logs
  rename column approx_tokens_saved to approx_tokens_delivered;
comment on column public.context_pack_logs.approx_tokens_delivered is
  'Approximate tokens of context handed to the assistant in this pack. Cost, not saving — the saving is real but lives in the sessions that did not have to go looking, and cannot be observed from here.';
