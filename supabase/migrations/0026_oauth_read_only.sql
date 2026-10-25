-- 0026_oauth_read_only.sql: OAuth (AI agent / MCP) access tokens are READ-ONLY.
--
-- Supabase Auth's OAuth 2.1 server issues access tokens that are ordinary user JWTs plus a
-- `client_id` claim (the OAuth client's uuid). Normal app sessions never carry `client_id`.
-- Without this migration an agent token could write anything the user can via PostgREST or
-- Storage. We add RESTRICTIVE policies (AND-ed with the existing permissive ones) that deny
-- INSERT/UPDATE/DELETE whenever the caller's JWT carries `client_id`.
--
-- * service_role bypasses RLS, so edge functions / admin tooling are unaffected.
-- * Normal user sessions have no `client_id`, so the predicate is true and existing
--   permissive policies decide as before.
-- * Restrictive UPDATE/DELETE policies filter rows (0 rows affected, no error); INSERT fails
--   with 42501 (new row violates row-level security policy).
-- * SECURITY DEFINER functions in this schema are either trigger functions (not callable via
--   RPC) or read-only helpers, so no RPC guard is needed. Any future write RPC callable by
--   `authenticated` must call `is_oauth_client()` and raise.

create or replace function is_oauth_client() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'client_id', '') <> '';
$$;
comment on function is_oauth_client() is
  'true when the request JWT is an OAuth (AI agent) access token; such tokens are read-only (0026)';

do $$
declare
  t record;
begin
  -- Every RLS-enabled public table (covers weddings, profiles, wedding_members, tables, guests,
  -- expenses, payments, gifts, vendors, checklist_groups, checklist_items, wedding_settings,
  -- activity_logs, wedding_invite_links, leads, email_log) plus storage.objects.
  for t in
    select n.nspname as sch, c.relname as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    execute format('drop policy if exists oauth_read_only_insert on %I.%I', t.sch, t.tbl);
    execute format('drop policy if exists oauth_read_only_update on %I.%I', t.sch, t.tbl);
    execute format('drop policy if exists oauth_read_only_delete on %I.%I', t.sch, t.tbl);
    execute format('create policy oauth_read_only_insert on %I.%I as restrictive for insert
      with check (not public.is_oauth_client())', t.sch, t.tbl);
    execute format('create policy oauth_read_only_update on %I.%I as restrictive for update
      using (not public.is_oauth_client()) with check (not public.is_oauth_client())', t.sch, t.tbl);
    execute format('create policy oauth_read_only_delete on %I.%I as restrictive for delete
      using (not public.is_oauth_client())', t.sch, t.tbl);
  end loop;
end $$;
