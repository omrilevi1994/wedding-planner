-- Shareable "open invite link" for joining a wedding as a collaborator, as opposed to
-- the existing per-email invite (inviteUserToWedding). Anyone holding the token can join
-- within its TTL (2 days), as the fixed `role` baked into the link — never 'owner'.
--
-- The token is the only secret protecting membership, so this table has NO select policy
-- for anon/authenticated: rows are only ever read/written via the service-role client inside
-- the createWeddingInviteLink / joinWeddingViaLink edge functions, exactly like the per-email
-- invite flow never exposes its token_hash through a client-readable table. The insert policy
-- below is defense-in-depth only (the edge function is the actual gate).

create table if not exists wedding_invite_links (
  id text primary key default gen_random_uuid()::text,
  wedding_id text not null references weddings(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  role text not null,
  expires_at timestamptz not null,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text
);

create index if not exists idx_wil_wedding on wedding_invite_links(wedding_id);
create index if not exists idx_wil_token on wedding_invite_links(token);

create trigger trg_wedding_invite_links_updated before update on wedding_invite_links
  for each row execute function set_updated_date();

create trigger trg_wedding_invite_links_created_by before insert on wedding_invite_links
  for each row execute function set_created_by();

alter table wedding_invite_links enable row level security;

-- Only the wedding owner (or a platform admin) may create invite links for their wedding.
-- No select/update/delete policy is defined on purpose: regular clients can never list or
-- read tokens back out of the table. The edge functions use the service-role key, which
-- bypasses RLS entirely, to look tokens up and to insert new rows.
create policy wil_insert on wedding_invite_links for insert
  with check (is_platform_admin() or is_wedding_owner(wedding_id));

-- Supabase's ALTER DEFAULT PRIVILEGES (0004_grants.sql) auto-grants ALL on new tables to
-- anon/authenticated; explicitly narrow that here (mirrors 0010_email_log.sql). Note there is
-- deliberately no `grant select` for authenticated: the RLS policy above only covers insert,
-- so any select attempt is denied outright, and update/delete are impossible entirely.
revoke all on wedding_invite_links from anon, authenticated;
grant insert on wedding_invite_links to authenticated;
grant all on wedding_invite_links to service_role;
