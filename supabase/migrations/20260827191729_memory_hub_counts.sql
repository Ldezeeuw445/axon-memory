-- One question instead of sixteen.
--
-- The landscape counted memories with a separate head-request per provider and
-- per adapter — sixteen round trips to build one picture, and it would have
-- become one per connected ACCOUNT the moment two Gmails were allowed. Every
-- memory already carries both keys it needs: source_connection_id says which
-- connected account brought it in, origin_key says which app it came from.
--
-- A row with a connection is a source, and it is counted per account, so two
-- Supabase projects are two rows and therefore two summits. A row without one
-- is an assistant writing through the gateway — those have no connection and
-- one account by definition, so they group on origin_key alone.
--
-- Retired memories are excluded here rather than in every caller: a summit's
-- height is what a source currently holds, and retiring is the gesture for
-- saying something no longer counts.
create or replace view public.memory_hub_counts
with (security_invoker = on) as
select user_id,
       source_connection_id as connection_id,
       origin_key,
       count(*) as items,
       max(created_at) as newest
from public.memory_items
where retired_at is null
group by user_id, source_connection_id, origin_key;
