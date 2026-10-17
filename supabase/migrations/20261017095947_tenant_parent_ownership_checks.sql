-- A5-4: a row may only point at parents its own user owns.
--
-- tests/rls/isolation.sql found that a signed-in user A, knowing the uuid of
-- user B's workspace/project/entity, could INSERT rows of their own that hang
-- off B's object (a task in B's workspace, a memory filed under B's project, a
-- link to B's entity). RLS hid those rows from B's own session, but the edge
-- functions read workspace children by workspace_id with the service role, so
-- a planted task would have been handed to B's assistants over MCP. Not a read
-- leak (uuids are never exposed across tenants), but a cross-tenant write.
--
-- Fix: RESTRICTIVE policies on INSERT/UPDATE. They are ANDed with the existing
-- permissive policies, so nothing that is allowed today for a user's own data
-- changes; the service role and SECURITY DEFINER triggers bypass RLS as before.
-- Production had zero rows violating these checks when this was written.
-- Additive and tightening only; rollback = drop the policies.

create or replace function public.owns_workspace(p_id uuid) returns boolean
  language sql stable security invoker set search_path = public
  as $$ select exists (select 1 from public.workspaces w where w.id = p_id and w.user_id = auth.uid()) $$;
create or replace function public.owns_project(p_id uuid) returns boolean
  language sql stable security invoker set search_path = public
  as $$ select p_id is null or exists (select 1 from public.projects p where p.id = p_id and p.user_id = auth.uid()) $$;
create or replace function public.owns_api_key(p_id uuid) returns boolean
  language sql stable security invoker set search_path = public
  as $$ select p_id is null or exists (select 1 from public.api_keys k where k.id = p_id and k.user_id = auth.uid()) $$;
revoke all on function public.owns_workspace(uuid), public.owns_project(uuid), public.owns_api_key(uuid) from public, anon;
grant execute on function public.owns_workspace(uuid), public.owns_project(uuid), public.owns_api_key(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['workspace_tasks','workspace_catch','workspace_work','workspace_phases',
                           'workspace_docs','workspace_events','workspace_links','workspace_team'] loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.owns_workspace(workspace_id))', t || '_parent_owned_ins', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (true) with check (public.owns_workspace(workspace_id))', t || '_parent_owned_upd', t);
  end loop;
end $$;

create policy workspace_work_keys_owned_ins on public.workspace_work as restrictive for insert to authenticated
  with check (public.owns_api_key(assignee_key_id) and public.owns_api_key(claimed_by));
create policy workspace_work_keys_owned_upd on public.workspace_work as restrictive for update to authenticated
  using (true) with check (public.owns_api_key(assignee_key_id) and public.owns_api_key(claimed_by));

create policy memory_items_parent_owned_ins on public.memory_items as restrictive for insert to authenticated
  with check (public.owns_project(project_id) and public.owns_api_key(api_key_id)
              and (source_connection_id is null or exists (select 1 from public.source_connections c
                   where c.id = source_connection_id and c.user_id = auth.uid())));
create policy memory_items_parent_owned_upd on public.memory_items as restrictive for update to authenticated
  using (true)
  with check (public.owns_project(project_id) and public.owns_api_key(api_key_id)
              and (source_connection_id is null or exists (select 1 from public.source_connections c
                   where c.id = source_connection_id and c.user_id = auth.uid())));

create policy project_threads_parent_owned_ins on public.project_threads as restrictive for insert to authenticated
  with check (public.owns_project(project_id));
create policy project_threads_parent_owned_upd on public.project_threads as restrictive for update to authenticated
  using (true) with check (public.owns_project(project_id));

create policy project_repos_parent_owned_ins on public.project_repos as restrictive for insert to authenticated
  with check (project_id is not null and public.owns_project(project_id));
create policy project_repos_parent_owned_upd on public.project_repos as restrictive for update to authenticated
  using (true) with check (project_id is not null and public.owns_project(project_id));

create policy entity_links_parent_owned_ins on public.entity_links as restrictive for insert to authenticated
  with check (exists (select 1 from public.entities e where e.id = entity_id and e.user_id = auth.uid())
              and exists (select 1 from public.memory_items m where m.id = memory_item_id and m.user_id = auth.uid()));
create policy entity_links_parent_owned_upd on public.entity_links as restrictive for update to authenticated
  using (true)
  with check (exists (select 1 from public.entities e where e.id = entity_id and e.user_id = auth.uid())
              and exists (select 1 from public.memory_items m where m.id = memory_item_id and m.user_id = auth.uid()));
