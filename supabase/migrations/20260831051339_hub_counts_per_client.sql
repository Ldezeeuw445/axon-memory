-- The counts have to be able to answer per registered client, not only per app.
--
-- memory_hub_counts grouped on the connection and the adapter key, which is
-- exactly right for a source and exactly one level too coarse for an assistant:
-- everything Claude ever wrote came back as a single row, so the landscape
-- could not draw one mountain per registration however it tried. Now that
-- memory_items records api_key_id, grouping on it costs nothing.
--
-- Appended at the end rather than put beside connection_id where it belongs,
-- because `create or replace view` may only add columns after the last one —
-- renaming a position is an error, and dropping the view to get a tidier order
-- would take its permissions with it for the sake of nothing anybody sees.
create or replace view public.memory_hub_counts
with (security_invoker = on) as
select user_id,
       source_connection_id as connection_id,
       origin_key,
       count(*) as items,
       max(created_at) as newest,
       api_key_id
from public.memory_items
where retired_at is null
group by user_id, source_connection_id, origin_key, api_key_id;
