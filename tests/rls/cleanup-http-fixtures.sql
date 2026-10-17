-- Fallback cleanup for scripts/rls-isolation-http.mjs fixtures. Only ever
-- matches the disposable test domain; every owned row cascades from auth.users.
--
-- Storage objects cannot be deleted with SQL any more (storage.protect_delete
-- raises 42501), so the suite removes its note-files object through the
-- Storage API itself. This query reports any that survived; remove those via
-- the Storage API before deleting their owner.
select count(*) as leftover_objects from storage.objects where bucket_id = 'note-files'
  and owner in (select id from auth.users where email like '%@rls-test.invalid');
delete from auth.users where email like '%@rls-test.invalid'
  and id not in (select owner from storage.objects where bucket_id = 'note-files' and owner is not null);
select count(*) as remaining from auth.users where email like '%@rls-test.invalid';
-- OAuth clients created by the suite are not owned by a user, so they do not
-- cascade. Codes cascade from the client; api_keys from the user.
delete from public.oauth_clients where client_name like 'rls-test%' and client_id like 'axon_client_rlstest%';
select count(*) as remaining_clients from public.oauth_clients where client_name like 'rls-test%';
