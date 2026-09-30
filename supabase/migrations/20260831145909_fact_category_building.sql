-- Two different things were both called "project".
--
-- A fact of category `project` is something the distiller concluded about what
-- somebody is building. A `project` everywhere else in AXON — projects.key,
-- memory_items.project_id, the scoping a recall is narrowed by, the chips in the
-- workspace editor — is a named container of work. Reading a recall you get both
-- words in the same answer meaning different things, and every conversation
-- about "the project category" had to start by establishing which was meant.
--
-- `building` says what the category is for and collides with nothing.
alter table public.memory_facts drop constraint if exists memory_facts_category_check;
update public.memory_facts set category = 'building' where category = 'project';
alter table public.memory_facts add constraint memory_facts_category_check
  check (category in (
    'identity',     -- who they are, what they do
    'building',     -- what they are building, and what it is for
    'preference',   -- how they like things done
    'relationship', -- who they work with
    'tool',         -- what they use
    'decision'      -- a choice they made, and the reason
  ));
