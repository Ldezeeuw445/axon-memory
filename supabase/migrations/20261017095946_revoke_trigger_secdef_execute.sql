-- A5-2: the last three SECURITY DEFINER functions still executable by anon and
-- authenticated (security advisor 0028/0029). All three are trigger bodies:
--   starter_tasks_on_workspace  (workspaces)
--   starter_tasks_on_fact       (source_connections, api_keys, projects)
--   resync_facts_for_item       (memory_items, on retire/unretire)
-- PostgreSQL never checks EXECUTE when a trigger fires, and a trigger function
-- cannot be called directly anyway, so nobody legitimately needs the grant.
-- Same treatment 20260829175123 gave the other five trigger bodies.
-- Tightens privileges only. Proven by tests/rls/isolation.sql ("legit writes"
-- control fires all three triggers as a signed-in user after this revoke).
revoke all on function public.starter_tasks_on_workspace() from public, anon, authenticated;
revoke all on function public.starter_tasks_on_fact()      from public, anon, authenticated;
revoke all on function public.resync_facts_for_item()      from public, anon, authenticated;
