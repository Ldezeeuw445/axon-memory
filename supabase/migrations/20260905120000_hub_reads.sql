-- An assistant's height is what it has read.
--
-- memory_hub_counts counts memory_items, which is what a connection *deposited*.
-- An assistant deposits nothing — it takes things out — so every adapter summit
-- was guaranteed to read "0 memories" for ever. On the first outside account the
-- terrain drew CHATGPT at zero while the dashboard two taps away said it had
-- read thirteen. Both true, measuring different things, and the half of the
-- landscape doing the actual work looked like the half nobody used.
--
-- Keyed the way the terrain already groups adapters — client_key for the app,
-- api_key_id for the registration — so this drops into the same shape without a
-- second grouping pass. `items` is distinct memories read, which is the figure
-- the pulse already says out loud; `reads` is how often, for later.
create or replace view public.memory_hub_reads
with (security_invoker = on) as
select
  user_id,
  client_key,
  api_key_id,
  count(*)::bigint                     as items,
  coalesce(sum(recall_count), 0)::bigint as reads,
  max(last_recalled_at)                as newest
from public.memory_recalls
group by user_id, client_key, api_key_id;
comment on view public.memory_hub_reads is
  'How much of this memory an assistant has read, keyed the way the terrain groups adapters. items is distinct memories read; reads counts how often.';
grant select on public.memory_hub_reads to authenticated;
