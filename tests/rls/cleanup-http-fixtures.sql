-- Fallback cleanup for scripts/rls-isolation-http.mjs fixtures. Only ever
-- matches the disposable test domain; every owned row cascades from auth.users.
delete from storage.objects where bucket_id = 'note-files'
  and owner in (select id from auth.users where email like '%@rls-test.invalid');
delete from auth.users where email like '%@rls-test.invalid';
select count(*) as remaining from auth.users where email like '%@rls-test.invalid';
