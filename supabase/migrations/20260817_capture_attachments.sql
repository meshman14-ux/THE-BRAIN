-- capture_attachments — the private bucket behind the capture page's photo and
-- document doors. Applied to the live project 2026-08-17.
--
-- One private bucket, owner-scoped by path prefix: every object key starts
-- with the uploader's user id, and every policy checks that prefix against
-- auth.uid(). Never make this bucket public — it will hold photographed bills
-- and paperwork (the cog-docs precedent, learned in the sibling system).
--
-- Policies are pinned to bucket_id = 'captures' so they can never widen access
-- to a bucket something else adds later — also the sibling system's lesson.

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

drop policy if exists "captures_owner_read" on storage.objects;
create policy "captures_owner_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "captures_owner_insert" on storage.objects;
create policy "captures_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "captures_owner_delete" on storage.objects;
create policy "captures_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
