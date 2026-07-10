-- HIGH: RLS authorized on membership only; roles lived in the UI, so any member (even
-- 'family'/'event_manager') could write or destroy any wedding data via the client.
-- Add role helpers and split each wedding-scoped policy into member-SELECT + role-gated write.
-- NOTE: max_guests quota is intentionally NOT enforced here (stays UI-enforced).

create or replace function wedding_role(wid text) returns text
language sql stable security definer set search_path = public as $$
  select role from wedding_members where user_id = auth.uid() and wedding_id = wid;
$$;

create or replace function can_write_wedding(wid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or wedding_role(wid) in ('owner','coplanner');
$$;

create or replace function wedding_member_sides(wid text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(wedding_sides, '{}') from wedding_members
   where user_id = auth.uid() and wedding_id = wid;
$$;

-- Default tables: any member reads; only owner/coplanner (or platform admin) writes.
-- The permissive member-SELECT policy is OR'd with the FOR ALL write policy, so members who
-- are not writers can still read but not INSERT/UPDATE/DELETE.
do $$
declare t text;
begin
  foreach t in array array['tables','expenses','payments','gifts','vendors','checklist_groups','wedding_settings','activity_logs']
  loop
    execute format('drop policy if exists %1$s_scoped on %1$s;', t);
    execute format('create policy %1$s_select on %1$s for select using (is_platform_admin() or is_wedding_member(wedding_id));', t);
    execute format('create policy %1$s_write on %1$s for all using (can_write_wedding(wedding_id)) with check (can_write_wedding(wedding_id));', t);
  end loop;
end $$;

-- guests: owner/coplanner full write; family may write ONLY rows on their own sides.
drop policy if exists guests_scoped on guests;
create policy guests_select on guests for select
  using (is_platform_admin() or is_wedding_member(wedding_id));
create policy guests_write on guests for all
  using (
    can_write_wedding(wedding_id)
    or (wedding_role(wedding_id) = 'family' and side = any(wedding_member_sides(wedding_id)))
  )
  with check (
    can_write_wedding(wedding_id)
    or (wedding_role(wedding_id) = 'family' and side = any(wedding_member_sides(wedding_id)))
  );

-- checklist_items: owner/coplanner full write; event_manager may write (day-of toggles).
drop policy if exists checklist_items_scoped on checklist_items;
create policy checklist_items_select on checklist_items for select
  using (is_platform_admin() or is_wedding_member(wedding_id));
create policy checklist_items_write on checklist_items for all
  using (can_write_wedding(wedding_id) or wedding_role(wedding_id) = 'event_manager')
  with check (can_write_wedding(wedding_id) or wedding_role(wedding_id) = 'event_manager');
