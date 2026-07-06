-- 0002 defined auth_role()/auth_wedding_id()/is_admin() that read profiles.role and
-- profiles.wedding_id, and profiles policies that call is_admin(). Migration 0007 dropped
-- those columns, so those functions now error whenever evaluated (e.g. a platform admin
-- reading another user's profile). Replace them with the membership-era helper is_platform_admin().

drop policy if exists profiles_self_read on profiles;
drop policy if exists profiles_self_update on profiles;
drop policy if exists profiles_admin_write on profiles;

drop function if exists is_admin();
drop function if exists auth_role();
drop function if exists auth_wedding_id();

create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_platform_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_platform_admin());
create policy profiles_admin_write on profiles for all
  using (is_platform_admin()) with check (is_platform_admin());
