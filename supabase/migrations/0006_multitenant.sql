-- 1. weddings gain an owner
alter table weddings add column if not exists owner_id uuid references profiles(id);

-- 2. platform-admin flag on profiles
alter table profiles add column if not exists is_platform_admin boolean default false;

-- 3. membership backbone
create table if not exists wedding_members (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null,                         -- owner | coplanner | family | event_manager
  wedding_sides text[] default '{}',
  max_guests int,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  unique (wedding_id, user_id)
);
create index if not exists idx_wm_wedding on wedding_members(wedding_id);
create index if not exists idx_wm_user on wedding_members(user_id);
create trigger trg_wedding_members_updated before update on wedding_members
  for each row execute function set_updated_date();

-- 4. helpers (security definer to avoid recursive RLS)
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_wedding_member(wid text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from wedding_members where user_id = auth.uid() and wedding_id = wid);
$$;

create or replace function is_wedding_owner(wid text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from weddings where id = wid and owner_id = auth.uid());
$$;

-- 5. RLS on wedding_members
alter table wedding_members enable row level security;
create policy wm_read on wedding_members for select
  using (is_platform_admin() or user_id = auth.uid() or is_wedding_member(wedding_id));
create policy wm_manage on wedding_members for all
  using (is_platform_admin() or is_wedding_owner(wedding_id))
  with check (is_platform_admin() or is_wedding_owner(wedding_id));

-- 6. weddings policies (replace old ones)
drop policy if exists weddings_read on weddings;
drop policy if exists weddings_admin_write on weddings;
create policy weddings_read on weddings for select
  using (is_platform_admin() or is_wedding_member(id));
create policy weddings_insert on weddings for insert
  with check (owner_id = auth.uid());
create policy weddings_update on weddings for update
  using (is_platform_admin() or owner_id = auth.uid())
  with check (is_platform_admin() or owner_id = auth.uid());
create policy weddings_delete on weddings for delete
  using (is_platform_admin() or owner_id = auth.uid());

-- 7. wedding-scoped tables: swap single-wedding policy for membership policy
do $$
declare t text;
begin
  foreach t in array array['tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format('drop policy if exists %1$s_scoped on %1$s;', t);
    execute format($f$
      create policy %1$s_scoped on %1$s for all
      using (is_platform_admin() or is_wedding_member(wedding_id))
      with check (is_platform_admin() or is_wedding_member(wedding_id));
    $f$, t);
  end loop;
end $$;

-- 8. grants for the new table
grant all on wedding_members to anon, authenticated, service_role;
