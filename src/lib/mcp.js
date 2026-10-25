// Pure helpers for the MCP (AI agents) UI: the OAuth consent page and Settings → AI agents.
// Kept free of React / Supabase so they can be unit-tested (tests/unit/mcp.test.js).

// Production MCP address: vercel.json rewrites /mcp (and the /.well-known discovery paths)
// on wedflow.live to the `mcp` edge function, which advertises this URL via MCP_PUBLIC_URL.
export const PRODUCTION_MCP_URL = 'https://wedflow.live/mcp';

/**
 * The public URL of WedFlow's MCP server. VITE_MCP_URL wins; production builds use
 * PRODUCTION_MCP_URL; otherwise (local dev, no Vercel rewrites) it's the `mcp` edge function
 * on the Supabase project. Empty strings count as unset (Vercel env vars are often
 * defined-but-empty), and a trailing slash is dropped.
 */
export function getMcpServerUrl(env = import.meta.env) {
  const explicit = (env?.VITE_MCP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (env?.PROD) return PRODUCTION_MCP_URL;
  const base = (env?.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  return `${base}/functions/v1/mcp`;
}

/** The one-liner that adds WedFlow to Claude Code. */
export function claudeCodeCommand(url) {
  return `claude mcp add --transport http wedflow ${url}`;
}

// Supabase Auth authorization ids are short opaque tokens (e.g. "3umyvafm5e67sd46tflqpt3ejky4hlpo").
// The SDK interpolates the id straight into a request path, so anything that isn't a plain
// token (slashes, dots, `?`…) is rejected rather than risk hitting a different endpoint.
const AUTHORIZATION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Reads and validates `authorization_id` from a query string / URLSearchParams. Returns null if missing or malformed. */
export function parseAuthorizationId(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const id = (params.get('authorization_id') || '').trim();
  return AUTHORIZATION_ID_RE.test(id) ? id : null;
}

/**
 * Human-meaningful origin of a redirect URI, shown on the consent screen so users can tell
 * where the approval code is going ("localhost:9999", "claude.ai", "cursor://…").
 */
export function redirectDisplayHost(uri) {
  if (!uri) return '';
  try {
    const u = new URL(uri);
    if (u.host) return u.host;
    // Custom schemes (cursor://, vscode://) may have no host — show scheme + first path segment.
    const first = u.pathname.replace(/^\/+/, '').split('/')[0];
    return `${u.protocol}//${first}`;
  } catch {
    return uri;
  }
}

// Where an approval code may be sent. An OAuth access token for WedFlow is a full Supabase
// user JWT: RLS makes it read-only for data, but it can still call Auth endpoints such as
// "update password". With open dynamic client registration anyone can register a client,
// so the consent page only lets codes go to known agent platforms and to loopback/native
// apps on the user's own machine (Claude Code, Cursor, …). That stops a phishing client
// with its own redirect host from ever receiving a code. Extra hosts can be allowed with
// VITE_MCP_TRUSTED_REDIRECT_HOSTS (comma-separated, https only).
const TRUSTED_REDIRECT_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com', 'chat.openai.com'];
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const TRUSTED_APP_SCHEMES = ['cursor:', 'vscode:'];

/**
 * True if an OAuth redirect goes to the MCP's own /callback (supabase/functions/mcp/oauth.ts):
 * the MCP is the one upstream OAuth client agents connect through, and it forwards the code to
 * the agent only after checking the agent's redirect itself.
 */
export function isMcpCallback(uri, env = import.meta.env) {
  try {
    const u = new URL(uri);
    const cb = new URL(`${getMcpServerUrl(env)}/callback`);
    return !u.hash && u.origin === cb.origin && u.pathname === cb.pathname;
  } catch {
    return false;
  }
}

/** Agent display info ({ name, host }) the MCP's /authorize leaves in a cookie for this page. */
export const MCP_AGENT_COOKIE = 'wedflow_mcp_agent';

export function readMcpAgentCookie(cookieString = typeof document === 'undefined' ? '' : document.cookie) {
  const raw = String(cookieString || '').split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${MCP_AGENT_COOKIE}=`));
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw.slice(MCP_AGENT_COOKIE.length + 1)));
    const name = typeof v?.name === 'string' ? v.name.slice(0, 100) : '';
    const host = typeof v?.host === 'string' ? v.host.slice(0, 200) : '';
    return name || host ? { name, host } : null;
  } catch {
    return null;
  }
}

/** The MCP callback URL with the issued code swapped for error=access_denied (state kept). */
export function deniedMcpCallbackUrl(redirectUrl) {
  const u = new URL(redirectUrl);
  u.searchParams.delete('code');
  u.searchParams.set('error', 'access_denied');
  return u.toString();
}

/** True if an OAuth redirect (URI or code-bearing redirect URL) goes somewhere WedFlow trusts. */
export function isTrustedRedirect(uri, env = import.meta.env) {
  if (isMcpCallback(uri, env)) return true;
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (TRUSTED_APP_SCHEMES.includes(u.protocol)) return true;
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTNAMES.includes(u.hostname)) return true;
  if (u.protocol !== 'https:') return false;
  const extra = String(env?.VITE_MCP_TRUSTED_REDIRECT_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return [...TRUSTED_REDIRECT_HOSTS, ...extra].includes(u.hostname.toLowerCase());
}

/** Distinguishes "needs consent" details from the "already consented → redirect" response. */
export function isAuthorizationRedirect(data) {
  return !!data && typeof data.redirect_url === 'string' && !data.authorization_id;
}

/**
 * Maps a Supabase Auth OAuth error to a coarse kind for a friendly message:
 * 'not_found' | 'expired' | 'already_processed' | 'session' | 'unknown'.
 */
export function classifyConsentError(error) {
  if (!error) return 'unknown';
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  if (error.name === 'AuthSessionMissingError' || code === 'session_not_found' || msg.includes('session missing')) return 'session';
  if (msg.includes('expired')) return 'expired';
  if (code === 'oauth_authorization_not_found' || error.status === 404 || msg.includes('not found')) return 'not_found';
  if (msg.includes('no longer pending') || msg.includes('cannot be processed') || msg.includes('already')) return 'already_processed';
  return 'unknown';
}

/** Grant scopes arrive as an array (listGrants) or a space-separated string (authorization details). */
export function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  if (typeof scopes === 'string') return scopes.split(/\s+/).filter(Boolean);
  return [];
}
