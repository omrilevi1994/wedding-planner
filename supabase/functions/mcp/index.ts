// WedFlow read-only MCP server (see docs/mcp.md). Deno entry: wires Supabase clients, the OAuth
// server (oauth.ts), agent-token validation, audit logging and rate limiting into the pure
// handler in server.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRateLimiter, type Db } from './access.ts';
import { type Connection, type ConnectionStore, createOAuthServer } from './oauth.ts';
import { createKeys } from './seal.ts';
import { type AuthInfo, createHandler } from './server.ts';
import { parseHostList } from './trust.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_SUPABASE_URL = (Deno.env.get('SUPABASE_PUBLIC_URL') ?? SUPABASE_URL).replace(/\/+$/, '');
const PUBLIC_URL = (Deno.env.get('MCP_PUBLIC_URL') ?? `${PUBLIC_SUPABASE_URL}/functions/v1/mcp`).replace(/\/+$/, '');

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`[mcp] missing required secret ${name} (see docs/mcp.md "Configuration / deploy")`);
  return value;
}

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: noSession });
if (!SERVICE_ROLE_KEY) throw new Error('[mcp] missing SUPABASE_SERVICE_ROLE_KEY');
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: noSession });

// ---- agent connections (mcp_connections), service role ----
const CONNECTION_CACHE_MS = 30_000;
const connectionCache = new Map<string, { conn: Connection | null; at: number }>();
const touchedAt = new Map<string, number>();

const store: ConnectionStore = {
  async create({ userId, clientName, redirectHost, sessionId }) {
    // Approved but never redeemed (the agent didn't swap its code): such rows aren't listed in
    // Settings yet hold a live upstream session — end them when the user connects again.
    const { data: stale } = await service.from('mcp_connections').select('id')
      .eq('user_id', userId).is('code_used_at', null).is('revoked_at', null)
      .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    for (const row of stale ?? []) await store.revoke(row.id).catch((e) => console.error('[mcp] stale revoke failed:', e));
    const { data, error } = await service.from('mcp_connections')
      .insert({ user_id: userId, client_name: clientName, redirect_host: redirectHost, session_id: sessionId })
      .select('id').single();
    if (error) throw error;
    return data.id as string;
  },
  async useCode(id) {
    const { data, error } = await service.from('mcp_connections')
      .update({ code_used_at: new Date().toISOString() })
      .eq('id', id).is('code_used_at', null).is('revoked_at', null)
      .select('id');
    if (error) throw error;
    return (data ?? []).length === 1;
  },
  async get(id) {
    const { data, error } = await service.from('mcp_connections')
      .select('user_id, client_name, revoked_at').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { userId: data.user_id, clientName: data.client_name, revokedAt: data.revoked_at } : null;
  },
  async revoke(id) {
    connectionCache.delete(id);
    const { error } = await service.rpc('mcp_revoke_connection_internal', { connection_id: id });
    if (error) throw error;
  },
};

async function connection(id: string): Promise<Connection | null> {
  const hit = connectionCache.get(id);
  if (hit && Date.now() - hit.at < CONNECTION_CACHE_MS) return hit.conn;
  const conn = await store.get(id);
  if (connectionCache.size > 5000) connectionCache.clear();
  connectionCache.set(id, { conn, at: Date.now() });
  return conn;
}

/** Best-effort last_used_at, at most every 5 minutes per connection. */
function touch(id: string) {
  const last = touchedAt.get(id) ?? 0;
  if (Date.now() - last < 5 * 60_000) return;
  if (touchedAt.size > 5000) touchedAt.clear();
  touchedAt.set(id, Date.now());
  const task = (async () => {
    const { error } = await service.from('mcp_connections').update({ last_used_at: new Date().toISOString() }).eq('id', id);
    if (error) console.error('[mcp] last_used_at update failed:', error.message);
  })();
  (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task);
}

const oauth = createOAuthServer({
  publicUrl: PUBLIC_URL,
  keys: await createKeys(requireEnv('MCP_TOKEN_SECRET')),
  upstream: {
    authorizeUrl: `${PUBLIC_SUPABASE_URL}/auth/v1/oauth/authorize`,
    tokenUrl: `${SUPABASE_URL}/auth/v1/oauth/token`,
    clientId: requireEnv('MCP_UPSTREAM_CLIENT_ID'),
    clientSecret: requireEnv('MCP_UPSTREAM_CLIENT_SECRET'),
  },
  store,
  extraTrustedHosts: parseHostList(Deno.env.get('MCP_TRUSTED_REDIRECT_HOSTS')),
});

/**
 * Agents hold sealed tokens only this server can open (oauth.ts). Unseal, check the connection
 * is live, then act as the user with the wrapped Supabase token — so RLS scopes every query.
 */
async function authenticate(token: string): Promise<AuthInfo | null> {
  const agent = await oauth.openAccessToken(token);
  if (!agent) return null;
  const conn = await connection(agent.connectionId);
  if (!conn || conn.revokedAt) return null;
  const { data, error } = await anon.auth.getUser(agent.supabaseToken);
  if (error) {
    // 4xx = expired token or ended session (e.g. revoked); anything else is infrastructure.
    const status = (error as { status?: number }).status ?? 0;
    if (status >= 400 && status < 500) return null;
    throw error;
  }
  if (!data.user || data.user.id !== conn.userId) return null;
  touch(agent.connectionId);
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${agent.supabaseToken}` } },
  }) as unknown as Db;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    clientId: agent.connectionId,
    clientName: conn.clientName,
    db,
  };
}

// profiles.full_name for audit rows, cached briefly per user.
const nameCache = new Map<string, { name: string | null; at: number }>();
async function userName(userId: string): Promise<string | null> {
  const hit = nameCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.name;
  const { data } = await service.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const name = (data?.full_name as string | undefined) ?? null;
  if (nameCache.size > 5000) nameCache.clear();
  nameCache.set(userId, { name, at: Date.now() });
  return name;
}

const limiter = createRateLimiter(60, 60_000);

const handler = createHandler({
  publicUrl: PUBLIC_URL,
  authorizationServer: PUBLIC_URL,
  oauth,
  authenticate,
  rateLimit: (userId) => limiter.hit(userId),
  audit: ({ weddingId, tool, args, auth }) => {
    // Written with the service role: agent (OAuth) tokens are read-only under RLS.
    const task = (async () => {
      try {
        const { error } = await service.from('activity_logs').insert({
          wedding_id: weddingId,
          user_email: auth.email,
          user_name: await userName(auth.userId).catch(() => null),
          action_type: 'mcp_read',
          entity_type: tool,
          description: 'AI agent read via MCP',
          details: JSON.stringify({
            args,
            ...(auth.clientId ? { connection_id: auth.clientId } : {}),
            ...(auth.clientName ? { client_name: auth.clientName } : {}),
          }),
          created_by: auth.email,
          created_by_id: auth.userId,
        });
        if (error) console.error('[mcp] audit insert failed:', error.message);
      } catch (e) {
        console.error('[mcp] audit insert failed:', e);
      }
    })();
    // Keep the isolate alive for the write on Supabase's edge runtime; plain Deno just runs it.
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task);
  },
});

Deno.serve({ port: Number(Deno.env.get('PORT') ?? 8000) }, handler);
