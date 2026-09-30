-- Making a workspace has to leave you with something, not with an empty page.
-- One call produces the phases, a starter build list that already knows what a
-- new account has to do, and the three documents an assistant reads before it
-- touches anything. Built once here rather than in every client, so Cursor,
-- Claude and the app all get the identical thing.

create or replace function public.create_workspace(
  p_key    text,
  p_name   text,
  p_colour text default '#ffb733'
)
returns public.workspaces
language plpgsql
security invoker
set search_path = public
as $$
declare
  w   public.workspaces;
  uid uuid := auth.uid();
  keys text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  insert into public.workspaces (user_id, key, name, colour)
  values (uid, p_key, p_name, p_colour)
  returning * into w;

  -- Phases. A letter, a colour, and a sentence about why the group exists.
  insert into public.workspace_phases (workspace_id, user_id, code, title, note, colour, position) values
    (w.id, uid, 'C', 'Connect what you already use',
     'Nothing here is a feature. Until something is syncing there is no memory to share, and every phase below reads as an idea.',
     '#e0b45e', 1),
    (w.id, uid, 'M', 'Make recall real',
     'The whole promise in one sentence: written in one app, read in another. Until that has happened for somebody who did not build it, the rest does not matter.',
     '#69c27e', 2),
    (w.id, uid, 'T', 'Your agents as one team',
     'Same account, same memory, different tools. This is the difference between testing a memory layer and using one.',
     '#ed905e', 3),
    (w.id, uid, 'B', 'What you are actually building',
     'Your own work goes here. Add a task and it gets the next number automatically; an agent can add one too.',
     '#63b4d8', 4),
    (w.id, uid, 'L', 'Proof it works for somebody else',
     'A thing that only works for its author is a demo. This phase is where it stops being one.',
     '#b195e8', 5);

  -- A starter list. Real work, in the order that makes each next step cheaper.
  insert into public.workspace_tasks
    (workspace_id, user_id, phase_code, number, title, body, value, effort, blocked_by, position) values
    (w.id, uid, 'C', 1, 'Connect your first source',
     'Pick the one that fills the map — GitHub if you write code, Gmail if you do not. One full source beats four thin ones, because a landscape with something in it is what makes the next step obvious.',
     3, 1, null, 1),
    (w.id, uid, 'C', 2, 'Register an assistant',
     'Claude, Cursor, Codex, ChatGPT — whichever you actually open. The gateway speaks MCP over OAuth, so there is no key to paste into a config file and nothing to rotate later.',
     3, 1, null, 2),
    (w.id, uid, 'C', 3, 'Name your projects',
     'A memory belongs to one project or to none, and none means everywhere rather than unknown. Without keys an assistant does an unscoped recall and gets another project''s decisions back.',
     2, 1, null, 3),

    (w.id, uid, 'M', 1, 'One recall you did not trigger yourself',
     'Ask an assistant something you never told it in that conversation. The proof is a row in your recall log, not an answer that sounds right.',
     3, 1, 'C2', 4),
    (w.id, uid, 'M', 2, 'Write the first note',
     'A note is a memory the moment you stop typing — same table, same recall. It is also the only way intent gets in; everything else here is exhaust from work already done.',
     3, 1, null, 5),
    (w.id, uid, 'M', 3, 'Catch one thing you would have forgotten',
     'Put it in the box above this list. Type it, forget it, and be reminded you forgot.',
     2, 1, null, 6),

    (w.id, uid, 'T', 1, 'Every agent on the same account',
     'Two assistants on two accounts are two memories that quietly disagree. One account, and they stop guessing at each other''s work.',
     3, 1, 'C2', 7),
    (w.id, uid, 'T', 2, 'AGENTS.md in every repository',
     'The standing layer: what the repo is, which project key it carries, and the rules that are not visible in the code. Yours is already written — it is in this workspace under Documents.',
     3, 2, null, 8),
    (w.id, uid, 'T', 3, 'Let the agents keep this list',
     'They can tick built and tested over MCP, and add to the catch box. You find out what happened without asking.',
     3, 1, 'T1', 9),

    (w.id, uid, 'B', 1, 'Your first real task',
     'Replace this one. Give it a title somebody else would understand a week from now.',
     2, 2, null, 10),

    (w.id, uid, 'L', 1, 'Somebody who is not you',
     'One person, one connected source, one recall. Not a growth number — a validity number.',
     3, 3, 'M1', 11);

  select string_agg(key, ' · ' order by key) into keys
  from public.projects where user_id = uid;

  insert into public.workspace_docs (workspace_id, user_id, name, content) values
  (w.id, uid, 'AGENTS.md', format($doc$# %s — for the agents working in it

You are working inside an AXON workspace. Read this before you touch anything;
it says what this place is and what it expects of you.

## Reach the memory before you start

Recall first, always. The point of this account is that a decision made on
Thursday in one tool is known on Monday in another — that only works if you
look. Call `recall_context` with what you are about to do, before you plan it.

Project keys on this account: %s

An unscoped recall in a multi-project account returns another project's
decisions and reads as confident nonsense. Pass the key.

## Write back what would otherwise be lost

MCP hands you tools, not a recorder. An assistant with `remember` available uses
it zero times unless it is told when. Write when:

- a decision is made and the reasoning matters later
- something failed and the cause is not obvious from the code
- the user states a preference about how work should be done
- a run finished and its result changes what happens next

Never write secrets, tokens, or raw file contents.

## This workspace keeps a list

There is one build list, and it is the only page. Every task carries a phase
letter and a number — `C1`, `M2`, `T3` — and two boxes: **built** and **tested**.

- `list_tasks` to see what is open and what is blocking what.
- `mark_built` when you have written it.
- `mark_tested` only when you have *measured* it. A green build is not a test.
- `add_catch` for anything the user says in passing that is worth keeping.

Ticking a box notifies the user. That is the point: they find out what happened
without asking, and nothing sits half-done and silent.

## Rules that are not visible in the code

**Nothing ships having been seen on one screen.** Measure at 375 × 812 and at
1440 × 900 before calling anything done. Looked at, not reasoned about.

**A silent zero is a lie.** Whoever finds nothing writes down why.

**Never log memory content.** Counts, ids and provider error codes only.

**Every request becomes a line, in the same reply it arrived in.** Three ideas in
one message are three lines. Half done is stated as half done, and says which
half.
$doc$, w.name, coalesce(keys, 'none yet — create one first'))),

  (w.id, uid, 'ECOSYSTEM.md', format($doc$# %s — how the parts meet

## What this workspace holds

- **Projects** — the things being built. A memory belongs to one, or to none.
- **Sources** — what gets read: repositories, mail, issues, messages.
- **Assistants** — what reads it back: Claude, Cursor, Codex, and anything else
  that speaks MCP.
- **One list** — the build list below the catch box, in this workspace.
- **Three documents** — this one, AGENTS.md, and ARTIFACT.md.

## How a memory travels

A source syncs, the distiller draws conclusions from what it finds, and an
assistant asks for context before it works. Nothing is pushed at anybody: the
assistant pulls, scoped to the project it was told about.

## Standards that hold across everything here

**Both screens, every time.** A change is not finished until it has been looked
at on a phone and on a desktop, measured rather than reasoned about.

**One list per project, and it is one page.** Not a plan here, a mockup there
and a checklist somewhere else — that is three places to look and two to forget.

**Every request becomes a line the moment it arrives.** Ideas arrive faster than
they can be built, and one that lives only in a chat transcript is gone.
$doc$, w.name)),

  (w.id, uid, 'ARTIFACT.md', $doc$# The list, and how it stays true

## What it is

One page, three parts, top to bottom:

1. **Sketches** — mockups and drafts, behind a picker. They open here, not in a
   separate document, because a second page is a page that gets overlooked.
2. **Nothing to lose** — the catch box. Everything said, including what looks
   like nothing. Type it, forget it, get reminded you forgot.
3. **The build list** — a letter per phase, a letter-and-number per task, a
   colour per phase, and two boxes: built and tested.

## How it stays up to date without anybody maintaining it

The agents keep it. Over MCP they can:

- `list_tasks` — read what is open, with what blocks what
- `add_task` — add work they discovered
- `mark_built` / `mark_tested` — tick what they finished
- `add_catch` — capture something said in passing

Every tick writes an event, so you get told: *C2 built by Cursor*, *M1 built and
tested by Claude*. Two percentages sit at the top — how much of the catch box has
been answered, and how much of the build list is built and tested.

## The one rule about ticking

**Built** means the code exists. **Tested** means somebody measured it working.
They are two boxes because they are two claims, and a green build has never once
proved the second one.

## Adding to it

Say it. Anything said becomes a line in the catch box in the same reply, and a
line that turns into work gets a code and moves down into the list. Nothing has
to be filed, formatted, or remembered.
$doc$);

  return w;
end $$;

comment on function public.create_workspace is
  'Creates a workspace with its phases, a starter build list and the three documents. One call, so every client produces the identical thing.';
