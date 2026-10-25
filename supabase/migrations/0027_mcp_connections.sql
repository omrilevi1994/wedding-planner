-- 0027_mcp_connections.sql: AI-agent connections made through WedFlow's MCP OAuth server.
--
-- The `mcp` edge function is the OAuth authorization server agents talk to (docs/mcp.md). It
-- signs the user in through Supabase Auth as ONE upstream OAuth client and hands the agent
-- sealed tokens it alone can open, so agents never hold a Supabase JWT. Each approved agent
-- gets a row here: it's what Settings → AI agents lists, what revocation flips, and what the
-- MCP checks on every call.
--
-- * Rows are written only by the edge function (service role). Users can read their own rows
--   and revoke them via revoke_mcp_connection().
-- * session_id is the upstream Supabase Auth session behind the connection. Revoking deletes
--   that session, so the wrapped Supabase tokens die immediately — the user's other sessions
--   and agents are untouched.
-- * code_used_at makes the one-time authorization code single-use (atomic update).

create table if not exists mcp_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  client_name   text not null,
  redirect_host text not null,
  session_id    uuid,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  code_used_at  timestamptz
);

create index if not exists mcp_connections_user_id_idx on mcp_connections (user_id);

alter table mcp_connections enable row level security;

drop policy if exists mcp_connections_select_own on mcp_connections;
create policy mcp_connections_select_own on mcp_connections
  for select to authenticated using (user_id = auth.uid());

revoke all on mcp_connections from anon, authenticated;
grant select on mcp_connections to authenticated;
grant all on mcp_connections to service_role;

-- Marks a connection revoked and ends its upstream Supabase session. Service role only (the
-- MCP's /revoke endpoint and code-replay handling); users go through revoke_mcp_connection().
create or replace function mcp_revoke_connection_internal(connection_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  uid uuid;
begin
  update mcp_connections set revoked_at = coalesce(revoked_at, now())
   where id = connection_id
   returning session_id, user_id into sid, uid;
  if not found then
    return false;
  end if;
  if sid is not null then
    delete from auth.sessions where id = sid and user_id = uid;
  end if;
  return true;
end $$;

revoke execute on function mcp_revoke_connection_internal(uuid) from public, anon, authenticated;
grant execute on function mcp_revoke_connection_internal(uuid) to service_role;

-- Settings → AI agents → Disconnect. Only the connection's owner, and never an agent token.
create or replace function revoke_mcp_connection(connection_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if public.is_oauth_client() then
    raise exception 'AI agent tokens are read-only' using errcode = '42501';
  end if;
  if not exists (select 1 from mcp_connections where id = connection_id and user_id = auth.uid()) then
    return false;
  end if;
  return mcp_revoke_connection_internal(connection_id);
end $$;

revoke execute on function revoke_mcp_connection(uuid) from public, anon;
grant execute on function revoke_mcp_connection(uuid) to authenticated, service_role;
