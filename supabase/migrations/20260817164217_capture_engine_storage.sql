-- Private bucket for captured documents. Path convention: {user_id}/{capture_id}.{ext}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'captures', 'captures', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "captures own read" on storage.objects;
create policy "captures own read" on storage.objects
  for select using (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "captures own write" on storage.objects;
create policy "captures own write" on storage.objects
  for insert with check (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "captures own delete" on storage.objects;
create policy "captures own delete" on storage.objects
  for delete using (
    bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text
  );
