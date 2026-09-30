-- The starter list should not ask for what has already been done.
--
-- On the first account that was not the builder's, "What now" opened with
-- C1 Connect your first source and C2 Register an assistant — with Gmail
-- connected and ChatGPT registered. The list is seeded with three facts about
-- a new account and then never looks at the account again, so it was wrong
-- about two of the three on the first day, and progress read 9%.
--
-- Ticked from the fact rather than from a press. Which means it has to happen
-- in both directions: a workspace made after the source was connected, and a
-- source connected after the workspace was made. Hence a trigger on each side.
--
-- Matched on the seeded title as well as the code, so a task somebody wrote
-- themselves in phase C is never ticked by this. Renaming the seeded one means
-- it stops being ticked automatically, which is the safe way for this to fail.

create or replace function public.tick_starter_tasks(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_source    boolean;
  has_assistant boolean;
  has_project   boolean;
begin
  select exists (
    select 1 from public.source_connections
    where user_id = p_user_id and status = 'connected'
  ) into has_source;

  select exists (
    select 1 from public.api_keys
    where user_id = p_user_id and revoked_at is null and oauth_client_id is not null
  ) into has_assistant;

  select exists (
    select 1 from public.projects where user_id = p_user_id
  ) into has_project;

  -- built_by is 'you' because the person did the work; the list simply had not
  -- noticed. tested is left alone: connecting a source is not proof it syncs,
  -- and that distinction is the whole reason there are two boxes.
  update public.workspace_tasks t
     set built = true, built_by = coalesce(t.built_by, 'you')
   where t.user_id = p_user_id
     and t.built = false
     and t.phase_code = 'C'
     and (
       (t.title = 'Connect your first source' and has_source)
       or (t.title = 'Register an assistant'  and has_assistant)
       or (t.title = 'Name your projects'     and has_project)
     );
end;
$$;
comment on function public.tick_starter_tasks(uuid) is
  'Ticks the seeded C tasks from what the account actually has. Called when a workspace is created and when a source, assistant or project appears.';
revoke all on function public.tick_starter_tasks(uuid) from public, anon, authenticated;
-- A workspace made after the work was already done.
create or replace function public.starter_tasks_on_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.tick_starter_tasks(new.user_id);
  return new;
end $$;
drop trigger if exists starter_tasks_on_workspace on public.workspaces;
create trigger starter_tasks_on_workspace
  after insert on public.workspaces
  for each row execute function public.starter_tasks_on_workspace();
-- Work done after the workspace existed.
create or replace function public.starter_tasks_on_fact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.tick_starter_tasks(new.user_id);
  return new;
end $$;
drop trigger if exists starter_tasks_on_source on public.source_connections;
create trigger starter_tasks_on_source
  after insert or update of status on public.source_connections
  for each row execute function public.starter_tasks_on_fact();
drop trigger if exists starter_tasks_on_key on public.api_keys;
create trigger starter_tasks_on_key
  after insert on public.api_keys
  for each row execute function public.starter_tasks_on_fact();
drop trigger if exists starter_tasks_on_project on public.projects;
create trigger starter_tasks_on_project
  after insert on public.projects
  for each row execute function public.starter_tasks_on_fact();
-- And once over what is already there, because the accounts this was found on
-- exist now and nothing above would reach them.
do $$
declare u uuid;
begin
  for u in select distinct user_id from public.workspace_tasks loop
    perform public.tick_starter_tasks(u);
  end loop;
end $$;
