-- Which branch the work actually happens on.
--
-- The sync read whatever GitHub calls the default branch, which is a fair guess
-- for a finished project and wrong for a live one. Of this founder's four apps,
-- two are built on a branch that is not main — AXE CORE on `orchestrator`, AXE
-- Companion on `axe-companion-runtime-foundation`. Reading main for those would
-- have returned a stale history, or nothing, and looked like the repository was
-- simply quiet.
--
-- Null keeps meaning "whatever the repository says is default", which is right
-- for most repos and the only sane thing to assume when nobody has said.
alter table public.project_repos
  add column if not exists branch text;

comment on column public.project_repos.branch is
  'The branch to read commits from. Null means the repository default, which is wrong often enough for work in progress that it is worth being able to say.';
