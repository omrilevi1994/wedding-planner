-- Owner-granting invite links may only be created by platform admins. The join function trusts a
-- stored role='owner' (it transfers ownership), so the *creation* path must be the gate. The
-- createWeddingInviteLink edge function enforces this, but the table also grants direct INSERT to
-- authenticated (0012) under a policy that ignored the role value — a wedding owner could insert a
-- role='owner' row directly via PostgREST. Tighten the insert policy so owners can only insert
-- non-owner links; platform admins (and the service role, which bypasses RLS) may insert any role.
-- There is no update/delete policy/grant on this table, so a non-owner role cannot be flipped later.
drop policy if exists wil_insert on wedding_invite_links;
create policy wil_insert on wedding_invite_links for insert with check (
  is_platform_admin()
  or (is_wedding_owner(wedding_id) and role <> 'owner')
);
