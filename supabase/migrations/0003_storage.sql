insert into storage.buckets (id, name, public) values ('uploads','uploads', true)
on conflict (id) do nothing;

create policy "auth upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads');
create policy "public read uploads" on storage.objects for select
  using (bucket_id = 'uploads');
