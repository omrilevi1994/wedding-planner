-- Marketing/lead-capture store for the public /calc calculator. Rows are inserted ONLY
-- by the submitCalculatorLead edge function using the service role (which bypasses RLS).
-- No anon/member access; platform admins may read (aligns with the AdminDashboard pattern).
--
-- Unlike the wedding-scoped domain tables, `leads` has no wedding_id and no base44 system
-- columns — it is a write-once marketing record, so it carries only created_at.
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  source        text not null default 'calculator',
  guest_count   integer,
  cost_per_head numeric,
  total_cost    numeric,
  budget_status text,                                 -- 'ok' | 'warn' | 'over'
  payload       jsonb,                                -- full input snapshot
  created_at    timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

-- Platform admins may read leads; everyone else gets nothing through RLS.
-- (Service-role inserts from the edge function bypass RLS entirely.)
-- Uses the is_platform_admin() helper defined in 0006_multitenant.sql.
drop policy if exists "leads_admin_select" on public.leads;
create policy "leads_admin_select" on public.leads
  for select to authenticated
  using (is_platform_admin());

-- Data-API grants: no anon access at all; authenticated may only SELECT (further gated by
-- the admin-only RLS policy). The edge function writes as service_role, which bypasses RLS
-- but still needs an explicit table grant.
revoke all on public.leads from anon, authenticated;
grant select on public.leads to authenticated;
grant all on public.leads to service_role;
