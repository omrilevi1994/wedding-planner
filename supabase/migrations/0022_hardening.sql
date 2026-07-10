-- LOW: pin search_path on the one definer function that lacked it.
create or replace function set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.jwt()->>'email'; end if;
  if new.created_by_id is null then new.created_by_id := auth.uid()::text; end if;
  return new;
end; $$;

-- LOW: remove membership/role helpers from the anon RPC surface. Postgres grants EXECUTE to
-- PUBLIC by default, so revoking from `anon` alone is useless (anon inherits it via PUBLIC).
-- Revoke from PUBLIC (and anon) and re-grant to authenticated + service_role: RLS policies
-- still evaluate these during authenticated queries, and service_role bypasses RLS. anon
-- (logged-out) has no direct access to the tables whose policies call these helpers, so it
-- loses only the membership-existence RPC oracle. These helpers key off auth.uid() and only
-- ever report the caller's own status.
do $$
declare fn text;
begin
  foreach fn in array array[
    'is_platform_admin()', 'is_wedding_member(text)', 'is_wedding_owner(text)',
    'wedding_role(text)', 'can_write_wedding(text)', 'wedding_member_sides(text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated, service_role;', fn);
  end loop;
end $$;
