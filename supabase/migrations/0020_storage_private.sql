-- CRITICAL: the uploads bucket was public with an anon-readable, wedding-blind SELECT policy,
-- and files lived at flat guessable paths. Make it private and scope every operation to
-- membership of the wedding named by the first path segment: <wedding_id>/<file>.

update storage.buckets set public = false where id = 'uploads';

drop policy if exists "public read uploads" on storage.objects;
drop policy if exists "auth upload" on storage.objects;

create policy "uploads_member_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_select" on storage.objects for select to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));
