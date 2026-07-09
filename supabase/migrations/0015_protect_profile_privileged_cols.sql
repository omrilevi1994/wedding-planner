-- CRITICAL: 0008's profiles_self_update has USING but no WITH CHECK, so USING (id = auth.uid())
-- is reused to validate the new row — letting a user set ANY column on their own row,
-- including is_platform_admin (the schema-wide master bypass) and email (invite-squatting).
-- A BEFORE UPDATE trigger pins the privileged columns for non-admins; the WITH CHECK is
-- defense-in-depth.

create or replace function protect_profile_privileged_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    new.is_platform_admin := old.is_platform_admin;
    new.email := old.email;
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_profile_privileged_cols on profiles;
create trigger trg_protect_profile_privileged_cols
  before update on profiles
  for each row execute function protect_profile_privileged_cols();

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_platform_admin())
  with check (id = auth.uid() or is_platform_admin());
