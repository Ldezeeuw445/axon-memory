-- Somewhere for what you drop into a note.
--
-- Private, and scoped by path. Every object lives under `<user_id>/...`, and the
-- policies below check that first segment against auth.uid() — so a signed URL
-- is the only way anything leaves, and one account can never address another's
-- files by guessing a name. A public bucket would have made every screenshot
-- somebody drops into a note world-readable to anybody who learned the URL,
-- which is not a trade to make on a product whose whole subject is private
-- memory.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-files', 'note-files', false,
  26214400,  -- 25 MB. Large enough for a screenshot or a PDF, small enough that
             -- nobody parks a video library in their memory layer by accident.
  array[
    'image/png','image/jpeg','image/gif','image/webp','image/heic',
    'application/pdf',
    'text/plain','text/markdown','text/csv',
    'application/json'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- storage.objects already has RLS enabled by Supabase; these are the four rules
-- that make the path prefix mean something.
create policy note_files_read_own on storage.objects
  for select using (
    bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy note_files_insert_own on storage.objects
  for insert with check (
    bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy note_files_update_own on storage.objects
  for update using (
    bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy note_files_delete_own on storage.objects
  for delete using (
    bucket_id = 'note-files' and (storage.foldername(name))[1] = auth.uid()::text
  );
