// WedFlow read-only MCP server (see docs/mcp.md). Deno entry: wires Supabase clients,
// token validation, audit logging and rate limiting into the pure handler in server.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRateLimiter, type Db } from './access.ts';
import { type AuthInfo, createHandler } from './server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_SUPABASE_URL = (Deno.env.get('SUPABASE_PUBLIC_URL') ?? SUPABASE_URL).replace(/\/+$/, '');
const PUBLIC_URL = (Deno.env.get('MCP_PUBLIC_URL') ?? `${PUBLIC_SUPABASE_URL}/functions/v1/mcp`).replace(/\/+$/, '');

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: noSession });
const service = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: noSession }) : null;

/** Decode (without verifying — getUser() already did) the JWT payload to read claims like client_id. */
function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

async function authenticate(token: string): Promise<AuthInfo | null> {
  const { data, error } = await anon.auth.getUser(token);
  if (error) {
    // 4xx = bad/expired/revoked token; anything else is an infrastructure problem.
    const status = (error as { status?: number }).status ?? 0;
    if (status >= 400 && status < 500) return null;
    throw error;
  }
  if (!data.user) return null;
  const claims = jwtClaims(token);
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  }) as unknown as Db;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : null,
    db,
  };
}

// profiles.full_name for audit rows, cached briefly per user.
const nameCache = new Map<string, { name: string | null; at: number }>();
async function userName(userId: string): Promise<string | null> {
  const hit = nameCache.get(userId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.name;
  const { data } = await service!.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const name = (data?.full_name as string | undefined) ?? null;
  if (nameCache.size > 5000) nameCache.clear();
  nameCache.set(userId, { name, at: Date.now() });
  return name;
}

const limiter = createRateLimiter(60, 60_000);

const handler = createHandler({
  publicUrl: PUBLIC_URL,
  authorizationServer: `${PUBLIC_SUPABASE_URL}/auth/v1`,
  authenticate,
  rateLimit: (userId) => limiter.hit(userId),
  audit: ({ weddingId, tool, args, auth }) => {
    if (!service) return;
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
          details: JSON.stringify({ args, ...(auth.clientId ? { client_id: auth.clientId } : {}) }),
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
