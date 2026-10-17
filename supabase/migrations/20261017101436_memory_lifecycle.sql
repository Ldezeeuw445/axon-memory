-- A4-1: Supersede / Retire / Restore / Delete, with delete propagating to every
-- derived surface. Additive: new functions + one trigger; no column or existing
-- row is changed by this migration. (Rows change only when a person or their
-- assistant calls one of these operations.)
--
-- Where a memory's data lives, and what removes it on delete:
--   memory_items row ........................ the DELETE itself
--   memory_embeddings (vector + HNSW index) . FK on delete cascade
--   memory_recalls .......................... FK on delete cascade
--   memory_relations ........................ FK on delete cascade
--   memory_items.superseded_by (others) ..... FK on delete set null
--   entity_links ............................ purge_memory_derivatives (below) + FK cascade
--   entities only this memory mentioned ..... purge_memory_derivatives
--   memory_facts derived only from it ....... purge_memory_derivatives (deleted)
--   memory_facts with other sources ......... purge_memory_derivatives (id removed;
--                                             withdrawn if no live source remains)
--   full-text GIN / HNSW indexes ............ maintained transactionally by Postgres
--   caches .................................. none exist: context packs are built per
--                                             request; context_pack_logs hold the query
--                                             only, never memory content
--   memory_lifecycle_events ................. keeps id + counts only (no content)

-- Who the operation is for: the signed-in caller, or — for the service role
-- only — an explicit p_user_id. A signed-in caller naming somebody else is refused.
create or replace function public.lifecycle_owner(p_user_id uuid)
  returns uuid language plpgsql stable security invoker set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is not null then
    if p_user_id is not null and p_user_id <> v then
      raise exception 'not your memory' using errcode = '42501';
    end if;
    return v;
  end if;
  if current_user in ('service_role', 'postgres') or coalesce(auth.role(), '') = 'service_role' then
    if p_user_id is null then raise exception 'p_user_id is required for service calls' using errcode = '22023'; end if;
    return p_user_id;
  end if;
  raise exception 'not signed in' using errcode = '42501';
end $$;

-- ── delete propagation (fires for every delete path, incl. account deletion) ──
create or replace function public.purge_memory_derivatives()
  returns trigger language plpgsql security definer set search_path = public as $$
declare v_entities uuid[]; v_touched uuid[]; v_emptied uuid[];
begin
  -- Account deletion: the owner row is already gone and every table of theirs is
  -- cascading away anyway; touching facts here would trip their user_id FK.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  select coalesce(array_agg(entity_id), '{}') into v_entities from public.entity_links where memory_item_id = old.id;
  delete from public.entity_links where memory_item_id = old.id;
  delete from public.entities e
   where e.id = any (v_entities) and e.user_id = old.user_id
     and not exists (select 1 from public.entity_links l where l.entity_id = e.id);

  with u as (
    update public.memory_facts f set source_item_ids = array_remove(f.source_item_ids, old.id)
     where f.user_id = old.user_id and f.source_item_ids @> array[old.id]
    returning f.id, f.source_item_ids)
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(id) filter (where cardinality(source_item_ids) = 0), '{}')
    into v_touched, v_emptied from u;
  -- A conclusion drawn only from deleted material is deleted with it.
  delete from public.memory_facts where id = any (v_emptied);
  -- One that still has sources, but none of them live, loses its footing (same rule as resync_facts_for_item).
  update public.memory_facts f set superseded_at = now(), superseded_reason = 'source-retired'
   where f.id = any (v_touched) and not (f.id = any (v_emptied)) and f.superseded_at is null
     and not exists (select 1 from public.memory_items i where i.id = any (f.source_item_ids) and i.retired_at is null and i.id <> old.id);
  return old;
end $$;
revoke all on function public.purge_memory_derivatives() from public, anon, authenticated;

drop trigger if exists memory_items_purge_derivatives on public.memory_items;
create trigger memory_items_purge_derivatives before delete on public.memory_items
  for each row execute function public.purge_memory_derivatives();

-- ── Retire ────────────────────────────────────────────────────────────────────
create or replace function public.memory_retire(p_memory_id uuid, p_reason text default 'user', p_actor text default null, p_user_id uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := public.lifecycle_owner(p_user_id); m public.memory_items; v_reason text := coalesce(nullif(btrim(p_reason), ''), 'user'); v_facts int;
begin
  if v_reason = 'superseded' then raise exception 'use memory_supersede to supersede' using errcode = '22023'; end if;
  select * into m from public.memory_items where id = p_memory_id and user_id = v_uid for update;
  if not found then raise exception 'no such memory' using errcode = 'P0002'; end if;
  if m.retired_at is not null then
    return jsonb_build_object('id', m.id, 'lifecycle_state', case when m.retired_reason = 'superseded' then 'superseded' else 'retired' end, 'changed', false);
  end if;
  update public.memory_items set retired_at = now(), retired_reason = left(v_reason, 200), updated_at = now() where id = m.id;
  select count(*) into v_facts from public.memory_facts where user_id = v_uid and source_item_ids @> array[m.id] and superseded_reason = 'source-retired';
  insert into public.memory_lifecycle_events (user_id, memory_item_id, op, actor, detail)
    values (v_uid, m.id, 'retire', left(p_actor, 120), jsonb_build_object('reason', left(v_reason, 200), 'facts_withdrawn', v_facts));
  return jsonb_build_object('id', m.id, 'lifecycle_state', 'retired', 'changed', true, 'facts_withdrawn', v_facts);
end $$;

-- ── Restore ───────────────────────────────────────────────────────────────────
create or replace function public.memory_restore(p_memory_id uuid, p_actor text default null, p_user_id uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := public.lifecycle_owner(p_user_id); m public.memory_items;
begin
  select * into m from public.memory_items where id = p_memory_id and user_id = v_uid for update;
  if not found then raise exception 'no such memory' using errcode = 'P0002'; end if;
  if m.retired_at is null then return jsonb_build_object('id', m.id, 'lifecycle_state', 'active', 'changed', false); end if;
  update public.memory_items set retired_at = null, retired_reason = null, superseded_by = null, updated_at = now() where id = m.id;
  insert into public.memory_lifecycle_events (user_id, memory_item_id, op, actor, detail)
    values (v_uid, m.id, 'restore', left(p_actor, 120), jsonb_build_object('was', case when m.retired_reason = 'superseded' then 'superseded' else 'retired' end));
  return jsonb_build_object('id', m.id, 'lifecycle_state', 'active', 'changed', true);
end $$;

-- ── Supersede: new truth replaces old without falsifying history ──────────────
create or replace function public.memory_supersede(p_old_id uuid, p_new_id uuid, p_reason text default null, p_actor text default null, p_user_id uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := public.lifecycle_owner(p_user_id); o public.memory_items; n public.memory_items; v_facts int;
begin
  if p_old_id = p_new_id then raise exception 'a memory cannot supersede itself' using errcode = '22023'; end if;
  select * into o from public.memory_items where id = p_old_id and user_id = v_uid for update;
  if not found then raise exception 'no such memory (old)' using errcode = 'P0002'; end if;
  select * into n from public.memory_items where id = p_new_id and user_id = v_uid;
  if not found then raise exception 'no such memory (new)' using errcode = 'P0002'; end if;
  if n.retired_at is not null then raise exception 'the newer memory is not active' using errcode = '22023'; end if;
  if o.superseded_by = n.id then
    return jsonb_build_object('old', o.id, 'new', n.id, 'changed', false);
  end if;
  update public.memory_items
     set retired_at = coalesce(retired_at, now()), retired_reason = 'superseded', superseded_by = n.id, updated_at = now()
   where id = o.id;
  insert into public.memory_relations (user_id, from_memory_id, to_memory_id, kind, reason, created_by)
    values (v_uid, n.id, o.id, 'supersedes', left(p_reason, 500), left(p_actor, 120))
    on conflict (from_memory_id, to_memory_id, kind) do nothing;
  select count(*) into v_facts from public.memory_facts where user_id = v_uid and source_item_ids @> array[o.id] and superseded_reason = 'source-retired';
  insert into public.memory_lifecycle_events (user_id, memory_item_id, op, actor, detail)
    values (v_uid, o.id, 'supersede', left(p_actor, 120), jsonb_build_object('superseded_by', n.id, 'facts_withdrawn', v_facts));
  return jsonb_build_object('old', o.id, 'new', n.id, 'changed', true, 'old_state', 'superseded', 'facts_withdrawn', v_facts);
end $$;

-- ── Delete: gone from every surface ───────────────────────────────────────────
create or replace function public.memory_delete(p_memory_id uuid, p_actor text default null, p_user_id uuid default null)
  returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := public.lifecycle_owner(p_user_id); m public.memory_items; d jsonb;
begin
  select * into m from public.memory_items where id = p_memory_id and user_id = v_uid for update;
  if not found then raise exception 'no such memory' using errcode = 'P0002'; end if;
  d := jsonb_build_object(
    'source_type', m.source_type, 'content_type', m.content_type,
    'embeddings', (select count(*) from public.memory_embeddings where memory_item_id = m.id),
    'entity_links', (select count(*) from public.entity_links where memory_item_id = m.id),
    'entities_orphaned', (select count(*) from public.entity_links l where l.memory_item_id = m.id
                            and not exists (select 1 from public.entity_links x where x.entity_id = l.entity_id and x.memory_item_id <> m.id)),
    'recalls', (select count(*) from public.memory_recalls where memory_item_id = m.id),
    'relations', (select count(*) from public.memory_relations where from_memory_id = m.id or to_memory_id = m.id),
    'facts_deleted', (select count(*) from public.memory_facts where user_id = v_uid and source_item_ids = array[m.id]),
    'facts_updated', (select count(*) from public.memory_facts where user_id = v_uid and source_item_ids @> array[m.id] and cardinality(source_item_ids) > 1));
  delete from public.memory_items where id = m.id;
  insert into public.memory_lifecycle_events (user_id, memory_item_id, op, actor, detail)
    values (v_uid, m.id, 'delete', left(p_actor, 120), d);
  return jsonb_build_object('id', m.id, 'deleted', true) || d;
end $$;

revoke all on function public.lifecycle_owner(uuid),
                       public.memory_retire(uuid, text, text, uuid),
                       public.memory_restore(uuid, text, uuid),
                       public.memory_supersede(uuid, uuid, text, text, uuid),
                       public.memory_delete(uuid, text, uuid) from public, anon;
grant execute on function public.lifecycle_owner(uuid),
                          public.memory_retire(uuid, text, text, uuid),
                          public.memory_restore(uuid, text, uuid),
                          public.memory_supersede(uuid, uuid, text, text, uuid),
                          public.memory_delete(uuid, text, uuid) to authenticated, service_role;
