-- A key is made by the server, never by the browser.
--
-- 0001_init gave api_keys a single policy "for all". Any signed-in user could
-- therefore insert a row with a key_hash of their own choosing, straight from
-- devtools, and skip the has_api_access check that api-keys-create exists to
-- enforce. The same policy let them rewrite the hash of a key they already had,
-- or bring a revoked key back to life by setting revoked_at to null.
--
-- What the browser actually does with this table (measured 15 Oct, every
-- .from('api_keys') in src/): read its own keys, revoke one (revoked_at),
-- rename one (display_name). Nothing else. Rows are created by api-keys-create
-- and mcp-oauth-token, and last_used_at is stamped by _shared/mcp-auth.ts --
-- all three use the service role, which RLS and these grants do not touch.

drop policy if exists "api_keys_all_own" on public.api_keys;

create policy "api_keys_select_own" on public.api_keys
  for select to authenticated using (auth.uid() = user_id);

create policy "api_keys_update_own" on public.api_keys
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The two columns the app changes, and only those.
revoke all on public.api_keys from anon;
revoke insert, update, delete on public.api_keys from authenticated;
grant select on public.api_keys to authenticated;
grant update (revoked_at, display_name) on public.api_keys to authenticated;

-- Revoked stays revoked, for every role. Nothing in the codebase un-revokes;
-- reconnecting an assistant makes a new key.
create or replace function public.api_keys_revoked_stays_revoked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked API key cannot be restored' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists api_keys_revoked_stays_revoked on public.api_keys;
create trigger api_keys_revoked_stays_revoked
  before update on public.api_keys
  for each row execute function public.api_keys_revoked_stays_revoked();

-- Rollback, if this ever has to go:
--   drop trigger if exists api_keys_revoked_stays_revoked on public.api_keys;
--   drop function if exists public.api_keys_revoked_stays_revoked();
--   drop policy if exists "api_keys_select_own" on public.api_keys;
--   drop policy if exists "api_keys_update_own" on public.api_keys;
--   grant insert, update, delete on public.api_keys to authenticated;
--   create policy "api_keys_all_own" on public.api_keys
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
