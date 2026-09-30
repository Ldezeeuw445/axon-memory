-- Which assistant wrote this, not merely which kind of assistant.
--
-- A source has carried `source_connection_id` since the beginning, so two
-- mailboxes or two Supabase projects each get their own summit and their own
-- number. An assistant carried nothing: every memory Claude wrote was filed
-- under origin_key 'anthropic' and no further. So three Claude registrations on
-- one account — a desktop app, and Claude Code on two machines — collapse into
-- a single mountain, and there is no way to draw them apart because the rows
-- genuinely do not say which one they came from.
--
-- resolveBearerToken already knows: it looks the key up on every single call
-- and returns apiKeyId. It was simply never written down.
--
-- Nullable on purpose, and it stays nullable. Memories written before this
-- cannot be attributed after the fact — guessing which of three keys wrote
-- something in August would be inventing history — so they keep a null and the
-- landscape draws them on one summit for the app, which shrinks by itself as
-- attributed memories arrive.
alter table public.memory_items
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;
comment on column public.memory_items.api_key_id is
  'The registered client that wrote this memory, for assistants — the mirror of source_connection_id for sources. Null means it arrived before AXON recorded this, or through a route with no key.';
create index if not exists memory_items_api_key_idx
  on public.memory_items (user_id, api_key_id)
  where api_key_id is not null;
