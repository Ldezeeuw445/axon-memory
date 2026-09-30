-- Nothing here should be callable by a person holding a session token.
--
-- Supabase grants EXECUTE on every function in `public` to anon, authenticated
-- and service_role by default. For a SECURITY DEFINER function that is the
-- whole attack: it runs as its owner, so a signed-in user calling it directly
-- acts with more authority than their own row-level policies allow. The
-- security advisor flagged eight of them, two of which arrived with the
-- workspace tables this week.
--
-- Five are trigger bodies. A trigger fires as the table owner and never needs a
-- grant, so those lose EXECUTE entirely. Two are called by edge functions
-- holding the service role, so they keep exactly that and nothing else.
-- `create_workspace` is SECURITY INVOKER and is meant to be called by the
-- person creating one — it stays as it is.

-- ── Trigger bodies: callable by nobody ──────────────────────────────────────
revoke all on function public.handle_new_user()        from public, anon, authenticated;
revoke all on function public.sync_entity_links()      from public, anon, authenticated;
revoke all on function public.workspace_task_event()   from public, anon, authenticated;
revoke all on function public.workspace_catch_event()  from public, anon, authenticated;
revoke all on function public.set_updated_at()         from public, anon, authenticated;
revoke all on function public.rls_auto_enable()        from public, anon, authenticated;

-- ── Called by the backend, and only by the backend ──────────────────────────
revoke all on function public.match_memory_items(uuid, public.vector, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.match_memory_items(uuid, public.vector, integer, uuid)
  to service_role;

revoke all on function public.record_memory_recalls(uuid, uuid[], text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_memory_recalls(uuid, uuid[], text, text, uuid)
  to service_role;

-- A trigger that resolves its own function names against whatever search_path
-- the caller happens to have is a trigger somebody else can aim.
alter function public.set_updated_at() set search_path = public;
