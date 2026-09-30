-- Where we were, as opposed to what we know.
--
-- memory_facts holds conclusions: "the climb ends at the fan, because otherwise
-- the camera settles on the pile." True today, true next month. What no table
-- holds is the thread — that the glass deploy is unverified, that the repo layer
-- was next, that tools/call is not arriving. That is not knowledge, it is a
-- cursor, and it is the whole difference between an assistant that knows things
-- about you and one that feels like it followed you.
--
-- ## One row, overwritten
--
-- Deliberately not a log. A thread that grows becomes a progress report within a
-- week, and progress reports are exactly what assistants are told not to save —
-- what changed is already in the commit. One line that replaces the previous one
-- stays small and stays true.
--
-- ## The age is part of the answer
--
-- Stale state is worse than none: "we were about to deploy X" is a question, not
-- an answer, once it is a fortnight old. So updated_at is returned with it every
-- time and the reader decides. A thread two hours old is a cursor; the same
-- thread two weeks old is a lie about where you are.
create table if not exists public.project_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Null is the account-wide thread, for work that is not about one codebase.
  project_id  uuid references public.projects (id) on delete cascade,
  state       text not null,
  -- Which client wrote it. Two assistants sharing one thread should be able to
  -- see whose sentence they are reading.
  updated_by  text,
  updated_at  timestamptz not null default now(),
  constraint project_threads_state_length check (char_length(state) between 1 and 2000)
);

comment on table public.project_threads is
  'One line per project saying where work stands. Overwritten, never appended — a thread that grows is a progress report, and its age is returned with it because stale state is worse than none.';

-- NULLs are distinct in a plain unique constraint, so an account-wide thread
-- would silently accept duplicates — the same trap external_account_id fell into
-- on this schema a week ago. Coalesced, so exactly one row per scope.
create unique index if not exists project_threads_scope_key
  on public.project_threads (user_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.project_threads enable row level security;

create policy project_threads_select_own on public.project_threads
  for select using (auth.uid() = user_id);
create policy project_threads_insert_own on public.project_threads
  for insert with check (auth.uid() = user_id);
create policy project_threads_update_own on public.project_threads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy project_threads_delete_own on public.project_threads
  for delete using (auth.uid() = user_id);
