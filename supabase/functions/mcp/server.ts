// HTTP layer of the WedFlow MCP server (Streamable HTTP, stateless, JSON responses only).
// Pure module using only web-standard Request/Response: auth, audit and rate limiting are
// injected by index.ts (Deno) or by tests.
import type { Db } from './access.ts';
import { type AuditEntry, ERR, handleMessage, rpcError, SUPPORTED_PROTOCOL_VERSIONS } from './protocol.ts';

export const WELL_KNOWN_SUFFIX = '/.well-known/oauth-protected-resource';

export interface AuthInfo {
  userId: string;
  email: string | null;
  /** OAuth client id when the token was issued to an MCP client via Supabase's OAuth server. */
  clientId: string | null;
  /** Supabase client acting as the user (anon key + the user's bearer token): RLS applies. */
  db: Db;
}

export interface ServerOptions {
  /** Public URL of the MCP endpoint, e.g. https://<ref>.supabase.co/functions/v1/mcp */
  publicUrl: string;
  /** OAuth authorization server issuer, e.g. https://<ref>.supabase.co/auth/v1 */
  authorizationServer: string;
  /** Validate a bearer token. Return null when invalid; throw on infrastructure errors. */
  authenticate: (token: string) => Promise<AuthInfo | null>;
  /** Fire-and-forget audit sink for successful wedding-scoped tool calls. */
  audit?: (entry: AuditEntry & { auth: AuthInfo }) => void;
  /** Returns 0 when allowed, else seconds to wait. */
  rateLimit?: (userId: string) => number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...CORS_HEADERS, ...extra } });
}

export function protectedResourceMetadata(opts: Pick<ServerOptions, 'publicUrl' | 'authorizationServer'>) {
  return {
    resource: opts.publicUrl,
    authorization_servers: [opts.authorizationServer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
    resource_name: 'WedFlow',
  };
}

export function createHandler(opts: ServerOptions): (req: Request) => Promise<Response> {
  const metadataUrl = `${opts.publicUrl.replace(/\/+$/, '')}${WELL_KNOWN_SUFFIX}`;
  const unauthorized = (invalidToken: boolean) => {
    const challenge = `Bearer resource_metadata="${metadataUrl}"` +
      (invalidToken ? ', error="invalid_token", error_description="The access token is invalid or expired"' : '');
    return json(
      { error: invalidToken ? 'invalid_token' : 'unauthorized', error_description: invalidToken ? 'Invalid or expired access token' : 'Bearer token required' },
      401,
      { 'WWW-Authenticate': challenge },
    );
  };

  return async (req: Request): Promise<Response> => {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');

    if (req.method === 'OPTIONS') return empty(204);

    if (path.endsWith(WELL_KNOWN_SUFFIX)) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return empty(405, { Allow: 'GET, OPTIONS' });
      return json(protectedResourceMetadata(opts), 200, { 'Cache-Control': 'public, max-age=3600' });
    }

    // Stateless server: no SSE stream (GET) and no sessions to terminate (DELETE).
    if (req.method !== 'POST') return empty(405, { Allow: 'POST, OPTIONS' });

    // ---- authentication ----
    const header = req.headers.get('authorization') ?? '';
    const match = header.match(/^Bearer\s+(\S+)\s*$/i);
    if (!match) return unauthorized(false);
    let auth: AuthInfo | null;
    try {
      auth = await opts.authenticate(match[1]);
    } catch (e) {
      console.error('[mcp] token validation failed:', e);
      return json(rpcError(null, ERR.INTERNAL, 'Authentication service unavailable'), 503);
    }
    if (!auth) return unauthorized(true);

    const version = req.headers.get('mcp-protocol-version');
    if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      return json(rpcError(null, ERR.INVALID_REQUEST, `Unsupported MCP-Protocol-Version: ${version}`), 400);
    }

    // ---- JSON-RPC ----
    let msg: unknown;
    try {
      msg = await req.json();
    } catch {
      return json(rpcError(null, ERR.PARSE, 'Parse error: body must be JSON'), 400);
    }
    const a = auth;
    try {
      const outcome = await handleMessage(msg, {
        tool: { db: a.db, userId: a.userId },
        rateLimit: opts.rateLimit ? () => opts.rateLimit!(a.userId) : undefined,
        audit: opts.audit ? (entry) => opts.audit!({ ...entry, auth: a }) : undefined,
      });
      return outcome.body ? json(outcome.body, outcome.status) : empty(outcome.status);
    } catch (e) {
      console.error('[mcp] request failed:', e);
      const id = typeof msg === 'object' && msg && 'id' in msg ? (msg as { id: string | number | null }).id : null;
      return json(rpcError(id ?? null, ERR.INTERNAL, 'Internal error'), 500);
    }
  };
}
