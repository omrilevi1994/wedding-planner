-- Helpers (security definer to read profiles without recursive RLS)
create or replace function auth_role() returns text
language sql stable security definer set search_path=public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_wedding_id() returns text
language sql stable security definer set search_path=public as $$
  select wedding_id from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable as $$ select auth_role() = 'admin'; $$;

-- Enable RLS on all tables
do $$
declare t text;
begin
  foreach t in array array['weddings','profiles','tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop execute format('alter table %I enable row level security;', t); end loop;
end $$;

-- weddings: read = any authenticated; write = admin only
create policy weddings_read on weddings for select using (auth.uid() is not null);
create policy weddings_admin_write on weddings for all
  using (is_admin()) with check (is_admin());

-- profiles: user reads/updates own row; admin all
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_admin());
create policy profiles_admin_write on profiles for all
  using (is_admin()) with check (is_admin());

-- wedding-scoped tables: same policy shape for each
do $$
declare t text;
begin
  foreach t in array array['tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format($f$
      create policy %1$s_scoped on %1$s for all
      using (is_admin() or wedding_id = auth_wedding_id())
      with check (is_admin() or wedding_id = auth_wedding_id());
    $f$, t);
  end loop;
end $$;
