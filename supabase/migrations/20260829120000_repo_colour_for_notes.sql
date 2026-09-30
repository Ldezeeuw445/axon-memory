-- A colour you chose, per repository.
--
-- Every other hue in this app is derived — a source's key decides it, so the
-- map stays consistent without anybody maintaining a table. Repositories are
-- the exception: they are yours, there are as many as you have, and no
-- derivation can know that axe-core should be warm and trading-os should be
-- green. So this one is picked.
--
-- Null keeps the derived behaviour, which is the right default: a repo added
-- today gets a hue from its name and is never invisible while you decide.
alter table public.project_repos
  add column if not exists colour text;
comment on column public.project_repos.colour is
  'Accent for this repository, chosen by the user. Null falls back to a hue derived from the name — the same rule every other source follows.';
