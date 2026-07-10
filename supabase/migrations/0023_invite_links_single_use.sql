-- Single-use invite links. The link is redeemed by an atomic
-- UPDATE ... WHERE used_at IS NULL inside joinWeddingViaLink; these columns record
-- consumption and owner revocation. Redeemable iff
--   used_at IS NULL AND revoked_at IS NULL AND expires_at > now().
-- No client select policy is added: tokens stay unreadable by anon/authenticated,
-- exactly as in 0012. list/revoke go through service-role edge functions.
alter table wedding_invite_links add column if not exists used_at    timestamptz;
alter table wedding_invite_links add column if not exists used_by    uuid references profiles(id) on delete set null;
alter table wedding_invite_links add column if not exists revoked_at timestamptz;

-- Partial index: joinWeddingViaLink looks links up by token, but only redeemable ones matter.
create index if not exists idx_wil_token_live on wedding_invite_links(token)
  where used_at is null and revoked_at is null;
