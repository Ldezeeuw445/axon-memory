-- A name you chose, next to the name the client registered under.
--
-- Three Claude registrations on one account are three separate workers — a
-- desktop app, and Claude Code on two machines — and they all register as
-- "Claude". The terrain can tell them apart by when each was added, which is
-- readable but not meaningful: "30 AUG 22:22" is a fact about the past, not a
-- description of the thing.
--
-- Renaming `name` itself would have been the obvious move and is a trap. That
-- column is what adapterKeyFromLabel matches on to decide which app a
-- registration belongs to — rename one to "Mini" and it stops matching
-- /claude/i, falls out of the Claude group, and appears on the landscape as an
-- unknown app of its own. The registered name has to stay exactly as the client
-- sent it.
--
-- So: display_name for the person, name for the machine. Null means nobody has
-- named it and the old behaviour stands.
alter table public.api_keys
  add column if not exists display_name text;
comment on column public.api_keys.display_name is
  'What the person calls this registration, e.g. "Claude Code on the mini". Display only — adapter matching reads `name`, which must stay as the client registered it.';
