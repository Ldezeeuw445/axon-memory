-- A starter list about AGENTS.md and repositories is noise to somebody who has
-- neither, and until now everybody got it.
--
-- Onboarding asks "how will you use AXON?" on its second screen. The answer was
-- collected into a piece of React state, used to colour the button it was
-- clicked on, and dropped — `profiles.use_case` has carried the comment "free
-- text goal captured at onboarding" since the first migration and nothing had
-- ever written to it. So the screen promised to personalise things and the one
-- after it proved otherwise.
--
-- This is the half of that promise that lives in the database.
--
-- ## Why this is an overload rather than a rewrite
--
-- create_workspace also seeds three long documents, and duplicating those into
-- a second copy of the function is how the two copies start disagreeing — the
-- fault three files full of prices already demonstrate. So the existing
-- function keeps producing exactly what it always has, and this one calls it
-- and then says three lines differently.
--
-- Deliberately no default on p_shape. With one, create_workspace(key, name)
-- would match both functions and Postgres would refuse the call as ambiguous —
-- at the moment somebody is creating their first workspace.
--
-- ## Why only three lines
--
-- The rest of the list is already right for anybody. "Connect your first
-- source", "one recall you did not trigger yourself", "write the first note",
-- "catch one thing you would have forgotten", "somebody who is not you" — none
-- of that is developer vocabulary. A kitchen is not a lesser workspace than
-- four repos and three coding assistants; it is the same shape with different
-- nouns, and the nouns are what change here.

create or replace function public.create_workspace(
  p_key    text,
  p_name   text,
  p_colour text,
  p_shape  text
)
returns public.workspaces
language plpgsql
security invoker
set search_path = public
as $$
declare
  w public.workspaces;
begin
  -- Everything as it has always been, documents included. Written as a
  -- SELECT INTO rather than an assignment because that is the form that works
  -- whether the callee is read as returning a row or a set of one.
  select * into w
  from public.create_workspace(p_key, p_name, coalesce(p_colour, '#ffb733'));

  -- Anything unrecognised keeps the list this function has always produced,
  -- rather than failing. Somebody who skips the question must land exactly
  -- where they would have landed before.
  if p_shape is distinct from 'plain' then
    return w;
  end if;

  update public.workspace_tasks
     set body = 'Pick the one that fills the map — usually your mail, because that is where most of what you have already decided lives. One full source beats four thin ones: a landscape with something in it is what makes the next step obvious.'
   where workspace_id = w.id and phase_code = 'C' and number = 1;

  update public.workspace_tasks
     set title = 'Write down how you want this done',
         body  = 'The standing layer: the things you would otherwise repeat to every assistant, every time. How you like to be answered, what matters in this project, what is already settled. It lives in this workspace under Documents, and an assistant reads it before it starts.'
   where workspace_id = w.id and phase_code = 'T' and number = 2;

  -- "Agents" is the word for a thing somebody without a codebase has never
  -- installed. The screen is the same screen; it just stops using a word that
  -- tells half the people reading it that this was not built for them.
  update public.workspace_phases
     set title = 'Your assistants as one team'
   where workspace_id = w.id and code = 'T';

  update public.workspace_tasks
     set title = 'Every assistant on the same account'
   where workspace_id = w.id and phase_code = 'T' and number = 1;

  update public.workspace_tasks
     set title = 'Let your assistants keep this list'
   where workspace_id = w.id and phase_code = 'T' and number = 3;

  return w;
end;
$$;
comment on function public.create_workspace(text, text, text, text) is
  'create_workspace with a shape: ''plain'' rewrites the handful of starter lines that assume a codebase. Anything else, including null, produces exactly what the three-argument version always has.';
