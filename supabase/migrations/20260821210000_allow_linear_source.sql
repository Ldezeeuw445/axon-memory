-- A connector nobody can store.
--
-- source_connections restricted provider to the original four, so the Linear
-- callback exchanged the code, encrypted the tokens, and then had its insert
-- refused by a check constraint. The callback did not read the write's error,
-- so it redirected with connected=linear and the app showed Connect again —
-- a success message for something that never happened.
--
-- memory_items.source_type has the same shape of restriction and would have
-- refused the first synced issue in exactly the same way.

alter table public.source_connections drop constraint if exists source_connections_provider_check;
alter table public.source_connections
  add constraint source_connections_provider_check
  check (provider in ('gmail','github','notion','slack','linear'));

alter table public.memory_items drop constraint if exists memory_items_source_type_check;
alter table public.memory_items
  add constraint memory_items_source_type_check
  check (source_type in ('gmail','github','notion','slack','linear','manual'));
