-- 0010_email_log.sql: email audit log (Resend delivery records).
-- Writes happen via the service role (bypasses RLS); readers are gated by RLS.

-- 1. table
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template_id text not null,
  subject text,
  status text not null check (status in ('sent','failed')),
  provider_id text,                                             -- Resend message id
  error text,
  wedding_id text references weddings(id) on delete set null,   -- ids are text in this project
  created_by_id uuid,
  created_date timestamptz not null default now()
);
create index if not exists idx_email_log_wedding on email_log(wedding_id);
create index if not exists idx_email_log_created_date on email_log(created_date desc);

-- 2. RLS: read-only policies; no insert/update/delete (service role bypasses RLS)
alter table email_log enable row level security;
create policy email_log_platform_read on email_log for select
  using (is_platform_admin());
create policy email_log_owner_read on email_log for select
  using (is_wedding_owner(wedding_id));

-- 3. grants (Supabase convention: RLS gates authenticated; service_role bypasses)
revoke all on email_log from anon, authenticated;
grant select on email_log to authenticated;
grant all on email_log to service_role;
