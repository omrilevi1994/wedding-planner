// OAuth 2.1 authorization server for MCP clients (docs/mcp.md "Security model").
//
// Agents register, authorize and get tokens HERE, never at Supabase Auth. The MCP signs the user
// in through Supabase's OAuth server as one confidential upstream client, then wraps the
// Supabase tokens in sealed blobs only this server can open:
//
//   agent ──/authorize──▶ MCP ──302──▶ Supabase /oauth/authorize ──▶ WedFlow consent page
//   agent ◀──code── MCP /callback ◀──code── Supabase   (MCP exchanges it with its client secret)
//   agent ──/token (PKCE)──▶ MCP ──▶ sealed access + refresh tokens
//
// Stateless apart from mcp_connections (one row per approved agent: revocation, one-time codes):
// client ids, the upstream `state` and authorization codes are sealed too. Pure module (web
// standard Request/Response); the store and upstream credentials are injected by index.ts.
import { clientSecretFor, type Keys, open, randomToken, safeEqual, seal, sha256 } from './seal.ts';
import { isTrustedRedirect, redirectHost } from './trust.ts';

export const SCOPE = 'wedflow:read';
const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];
const STATE_TTL_MS = 15 * 60_000;
const CODE_TTL_MS = 2 * 60_000;
/** Cookie the consent page reads to show which agent is connecting (display only). */
export const AGENT_COOKIE = 'wedflow_mcp_agent';
const NONCE_COOKIE_PREFIX = 'wfmcp_';

export interface Connection {
  userId: string;
  clientName: string;
  revokedAt: string | null;
}

export interface ConnectionStore {
  create(row: { userId: string; clientName: string; redirectHost: string; sessionId: string | null }): Promise<string>;
  /** Atomically marks the connection's one-time code used. False if already used or revoked. */
  useCode(id: string): Promise<boolean>;
  get(id: string): Promise<Connection | null>;
  /** Marks the connection revoked and ends its upstream Supabase session. */
  revoke(id: string): Promise<void>;
}

export interface OAuthOptions {
  /** Public MCP URL and OAuth issuer, e.g. https://wedflow.live/mcp */
  publicUrl: string;
  keys: Keys;
  upstream: {
    /** Supabase /auth/v1/oauth/authorize as the browser sees it. */
    authorizeUrl: string;
    /** Supabase /auth/v1/oauth/token as this server reaches it. */
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
  };
  store: ConnectionStore;
  extraTrustedHosts?: string[];
  fetch?: typeof fetch;
  now?: () => number;
}

interface ClientInfo extends Record<string, unknown> { n: string; r: string[]; m: string }
interface StateInfo extends Record<string, unknown> {
  n: string; v: string; r: string; cc: string; s: string | null; ch: string; name: string;
}
interface CodeInfo extends Record<string, unknown> {
  cid: string; ch: string; r: string; cc: string; at: string; rt: string; ae: number;
}
interface AccessInfo extends Record<string, unknown> { at: string; cid: string; ch: string; exp: number }
interface RefreshInfo extends Record<string, unknown> { rt: string; cid: string; ch: string }

/** What the MCP needs from a valid agent access token. */
export interface AgentToken { supabaseToken: string; connectionId: string }

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status, NO_STORE);
}

/** Plain page for failures where we can't (or mustn't) redirect back to the agent. */
function page(status: number, message: string, headers: Headers = new Headers()): Response {
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(`WedFlow — ${message}\n`, { status, headers });
}

function redirect(location: string, headers: Headers = new Headers()): Response {
  headers.set('Location', location);
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 302, headers });
}

function withParams(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

function cookies(req: Request): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

export function authorizationServerMetadata(publicUrl: string) {
  return {
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/authorize`,
    token_endpoint: `${publicUrl}/token`,
    registration_endpoint: `${publicUrl}/register`,
    revocation_endpoint: `${publicUrl}/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: AUTH_METHODS,
    revocation_endpoint_auth_methods_supported: AUTH_METHODS,
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

const METADATA_SUFFIXES = ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'];

export function createOAuthServer(opts: OAuthOptions) {
  const publicUrl = opts.publicUrl.replace(/\/+$/, '');
  const callbackUrl = `${publicUrl}/callback`;
  const secure = publicUrl.startsWith('https:');
  const cookiePath = new URL(publicUrl).pathname || '/';
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const extraHosts = opts.extraTrustedHosts ?? [];
  const keys = opts.keys;
  const upstreamBasic = 'Basic ' + btoa(`${encodeURIComponent(opts.upstream.clientId)}:${encodeURIComponent(opts.upstream.clientSecret)}`);

  const cookie = (name: string, value: string, path: string, maxAge: number, httpOnly: boolean) =>
    `${name}=${value}; Path=${path}; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${secure ? '; Secure' : ''}`;

  // ---- client authentication (token + revoke endpoints) ----
  async function authenticateClient(req: Request, form: URLSearchParams): Promise<{ clientId: string; client: ClientInfo } | Response> {
    let clientId = form.get('client_id') ?? '';
    let secret = form.get('client_secret');
    const basic = (req.headers.get('authorization') ?? '').match(/^Basic\s+(\S+)$/i);
    if (basic) {
      try {
        const [id, pw] = atob(basic[1]).split(':');
        clientId = decodeURIComponent(id ?? '');
        secret = decodeURIComponent(pw ?? '');
      } catch {
        return oauthError('invalid_client', 'Malformed client credentials', 401);
      }
    }
    const client = await open<ClientInfo>(keys, 'client', clientId);
    if (!client) return oauthError('invalid_client', 'Unknown client', 401);
    if (client.m !== 'none') {
      if (!secret || !safeEqual(secret, await clientSecretFor(keys, clientId))) {
        return oauthError('invalid_client', 'Client authentication failed', 401);
      }
    }
    return { clientId, client };
  }

  async function upstreamToken(params: Record<string, string>) {
    const res = await doFetch(opts.upstream.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: upstreamBasic },
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && typeof body.access_token === 'string', status: res.status, body };
  }

  async function issueTokens(cid: string, ch: string, at: string, rt: string, accessExpSec: number): Promise<Response> {
    const exp = Math.min(accessExpSec * 1000, now() + 3600_000);
    const access_token = await seal(keys, 'access', { at, cid, ch, exp } satisfies AccessInfo);
    const refresh_token = await seal(keys, 'refresh', { rt, cid, ch } satisfies RefreshInfo);
    return json({
      access_token,
      token_type: 'Bearer',
      expires_in: Math.max(0, Math.floor((exp - now()) / 1000)),
      refresh_token,
      scope: SCOPE,
    }, 200, NO_STORE);
  }

  // ---- endpoints ----
  async function register(req: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      const text = await req.text();
      if (text.length > 16_384) return oauthError('invalid_client_metadata', 'Registration request too large');
      body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch {
      return oauthError('invalid_client_metadata', 'Body must be a JSON object');
    }
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === 'string' && u.length <= 2000)) {
      return oauthError('invalid_redirect_uri', 'redirect_uris must be a non-empty array of URLs');
    }
    if (uris.join('').length > 4000) return oauthError('invalid_redirect_uri', 'redirect_uris too long');
    const untrusted = (uris as string[]).find((u) => !isTrustedRedirect(u, extraHosts));
    if (untrusted) {
      return oauthError('invalid_redirect_uri', `Redirect URI not allowed: ${untrusted}. WedFlow accepts known AI agent platforms and loopback / native-app redirects.`);
    }
    const method = body.token_endpoint_auth_method ?? 'none';
    if (typeof method !== 'string' || !AUTH_METHODS.includes(method)) {
      return oauthError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}`);
    }
    const grants = body.grant_types ?? ['authorization_code', 'refresh_token'];
    if (!Array.isArray(grants) || !grants.every((g) => g === 'authorization_code' || g === 'refresh_token')) {
      return oauthError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported');
    }
    const responseTypes = body.response_types ?? ['code'];
    if (!Array.isArray(responseTypes) || !responseTypes.every((t) => t === 'code')) {
      return oauthError('invalid_client_metadata', 'Only the code response type is supported');
    }
    const rawName = typeof body.client_name === 'string' ? body.client_name.trim() : '';
    const name = (rawName || 'AI agent').slice(0, 100);
    const issuedAt = Math.floor(now() / 1000);
    const client_id = await seal(keys, 'client', { n: name, r: uris, m: method, iat: issuedAt } satisfies ClientInfo & { iat: number });
    return json({
      client_id,
      client_id_issued_at: issuedAt,
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
      scope: SCOPE,
      ...(method === 'none' ? {} : { client_secret: await clientSecretFor(keys, client_id), client_secret_expires_at: 0 }),
    }, 201, NO_STORE);
  }

  async function authorize(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams;
    const clientId = q.get('client_id') ?? '';
    const client = await open<ClientInfo>(keys, 'client', clientId);
    if (!client) return page(400, 'Unknown AI agent (client_id). Remove the WedFlow connector from your AI app and add it again.');

    const requested = q.get('redirect_uri');
    const redirectUri = requested ?? (client.r.length === 1 ? client.r[0] : null);
    if (!redirectUri || !client.r.includes(redirectUri)) return page(400, 'The redirect_uri does not match this AI agent\'s registration.');
    if (!isTrustedRedirect(redirectUri, extraHosts)) return page(400, 'This AI agent\'s redirect address is not allowed.');

    // Errors before consent are shown here rather than redirected, so /authorize can't be used
    // as a WedFlow-branded bounce to arbitrary (allow-listed) addresses.
    const state = q.get('state');
    if (state && state.length > 2048) return page(400, 'The state parameter is too long.');
    if (q.get('response_type') !== 'code') return page(400, 'Unsupported response_type (only "code").');
    const challenge = q.get('code_challenge') ?? '';
    if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
      return page(400, 'PKCE with code_challenge_method=S256 is required.');
    }
    // RFC 8707: MCP clients name the server the user added. Requiring it to be this server stops a
    // look-alike connector that borrows our /authorize but sends codes to its own token endpoint.
    const resource = q.get('resource');
    if (!resource || resource.replace(/\/+$/, '') !== publicUrl) {
      return page(400, `This connection was not set up for ${publicUrl}. Add WedFlow to your AI app with exactly that address.`);
    }

    const nonce = randomToken(18);
    const verifier = randomToken(32);
    const upstreamState = await seal(keys, 'state', {
      n: nonce, v: verifier, r: redirectUri, cc: challenge, s: state, ch: await sha256(clientId), name: client.n,
      exp: now() + STATE_TTL_MS,
    } satisfies StateInfo & { exp: number });

    const headers = new Headers();
    // Binds the callback to this browser (stops an attacker's code being planted in your agent).
    headers.append('Set-Cookie', cookie(`${NONCE_COOKIE_PREFIX}${nonce.slice(0, 12)}`, nonce, cookiePath, STATE_TTL_MS / 1000, true));
    // Lets the consent page name the agent; it's on wedflow.live in production (vercel.json).
    headers.append('Set-Cookie', cookie(
      AGENT_COOKIE,
      encodeURIComponent(JSON.stringify({ name: client.n, host: redirectHost(redirectUri) })),
      '/app/oauth', STATE_TTL_MS / 1000, false,
    ));
    return redirect(withParams(opts.upstream.authorizeUrl, {
      response_type: 'code',
      client_id: opts.upstream.clientId,
      redirect_uri: callbackUrl,
      scope: 'email profile',
      state: upstreamState,
      code_challenge: await sha256(verifier),
      code_challenge_method: 'S256',
    }), headers);
  }

  async function callback(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams;
    const st = await open<StateInfo>(keys, 'state', q.get('state'));
    if (!st) return page(400, 'This connection request expired or is invalid. Start connecting again from your AI app.');
    const cookieName = `${NONCE_COOKIE_PREFIX}${st.n.slice(0, 12)}`;
    const headers = new Headers();
    headers.append('Set-Cookie', cookie(cookieName, '', cookiePath, 0, true));
    const presented = cookies(req).get(cookieName) ?? '';
    if (!presented || !safeEqual(presented, st.n)) {
      return page(400, 'This connection was started in a different browser. Start connecting again from your AI app, in this browser.', headers);
    }
    const back = (params: Record<string, string>) =>
      redirect(withParams(st.r, { ...params, state: st.s, iss: publicUrl }), headers);

    const upstreamError = q.get('error');
    if (upstreamError) {
      return back({ error: 'access_denied', error_description: q.get('error_description') ?? 'The user denied the request' });
    }
    const code = q.get('code');
    if (!code) return back({ error: 'server_error', error_description: 'Missing authorization code' });

    const up = await upstreamToken({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl, code_verifier: st.v });
    if (!up.ok) {
      console.error('[mcp] upstream code exchange failed:', up.status, up.body?.error_code ?? up.body?.error);
      return back({ error: 'server_error', error_description: 'Could not complete sign-in with WedFlow' });
    }
    const claims = jwtClaims(up.body.access_token);
    if (typeof claims.sub !== 'string') return back({ error: 'server_error', error_description: 'Unexpected token from WedFlow' });

    const cid = await opts.store.create({
      userId: claims.sub,
      clientName: st.name,
      redirectHost: redirectHost(st.r),
      sessionId: typeof claims.session_id === 'string' ? claims.session_id : null,
    });
    const agentCode = await seal(keys, 'code', {
      cid, ch: st.ch, r: st.r, cc: st.cc,
      at: up.body.access_token, rt: up.body.refresh_token,
      ae: typeof claims.exp === 'number' ? claims.exp : Math.floor(now() / 1000) + 3600,
      exp: now() + CODE_TTL_MS,
    } satisfies CodeInfo & { exp: number });
    return back({ code: agentCode });
  }

  async function token(req: Request): Promise<Response> {
    const form = await readForm(req);
    if (!form) return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded');
    const auth = await authenticateClient(req, form);
    if (auth instanceof Response) return auth;
    const ch = await sha256(auth.clientId);

    const grant = form.get('grant_type');
    if (grant === 'authorization_code') {
      const code = await open<CodeInfo>(keys, 'code', form.get('code'), now());
      if (!code || !safeEqual(code.ch, ch)) return oauthError('invalid_grant', 'Invalid or expired authorization code');
      const redirectUri = form.get('redirect_uri');
      if (redirectUri !== null && redirectUri !== code.r) return oauthError('invalid_grant', 'redirect_uri does not match');
      const verifier = form.get('code_verifier') ?? '';
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(await sha256(verifier), code.cc)) {
        return oauthError('invalid_grant', 'PKCE verification failed');
      }
      if (!(await opts.store.useCode(code.cid))) {
        // Replayed code: per OAuth 2.1, revoke what it already issued.
        await opts.store.revoke(code.cid).catch((e) => console.error('[mcp] revoke after code replay failed:', e));
        return oauthError('invalid_grant', 'Authorization code already used');
      }
      return issueTokens(code.cid, ch, code.at, code.rt, code.ae);
    }

    if (grant === 'refresh_token') {
      const rt = await open<RefreshInfo>(keys, 'refresh', form.get('refresh_token'));
      if (!rt || !safeEqual(rt.ch, ch)) return oauthError('invalid_grant', 'Invalid refresh token');
      const conn = await opts.store.get(rt.cid);
      if (!conn || conn.revokedAt) return oauthError('invalid_grant', 'This connection was disconnected');
      const up = await upstreamToken({ grant_type: 'refresh_token', refresh_token: rt.rt });
      if (!up.ok) {
        if (up.status >= 500) return oauthError('server_error', 'WedFlow sign-in is unavailable', 503);
        return oauthError('invalid_grant', 'Refresh token expired or revoked');
      }
      const exp = jwtClaims(up.body.access_token).exp;
      return issueTokens(rt.cid, ch, up.body.access_token, up.body.refresh_token, typeof exp === 'number' ? exp : Math.floor(now() / 1000) + 3600);
    }

    return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  async function revoke(req: Request): Promise<Response> {
    const form = await readForm(req);
    if (!form) return oauthError('invalid_request', 'Body must be application/x-www-form-urlencoded');
    const auth = await authenticateClient(req, form);
    if (auth instanceof Response) return auth;
    const ch = await sha256(auth.clientId);
    const value = form.get('token');
    const found = (await open<AccessInfo>(keys, 'access', value, 0)) ?? (await open<RefreshInfo>(keys, 'refresh', value));
    if (found && safeEqual(found.ch, ch)) await opts.store.revoke(found.cid);
    // RFC 7009: unknown or already-invalid tokens are not an error.
    return json({}, 200, NO_STORE);
  }

  return {
    metadata: () => authorizationServerMetadata(publicUrl),

    /** Opens an agent access token. Null if invalid/expired (revocation is checked by the caller). */
    async openAccessToken(value: string): Promise<AgentToken | null> {
      const t = await open<AccessInfo>(keys, 'access', value, now());
      return t ? { supabaseToken: t.at, connectionId: t.cid } : null;
    },

    /** Routes OAuth endpoints; null when `path` isn't one of them. */
    async handle(req: Request, path: string): Promise<Response | null> {
      if (METADATA_SUFFIXES.some((s) => path.endsWith(s))) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...CORS, Allow: 'GET' } });
        return json(authorizationServerMetadata(publicUrl), 200, { 'Cache-Control': 'public, max-age=3600' });
      }
      const route = [
        ['/register', 'POST', register],
        ['/authorize', 'GET', authorize],
        ['/callback', 'GET', callback],
        ['/token', 'POST', token],
        ['/revoke', 'POST', revoke],
      ] as const;
      for (const [suffix, method, fn] of route) {
        if (!path.endsWith(suffix)) continue;
        if (req.method !== method) return new Response(null, { status: 405, headers: { ...CORS, Allow: method } });
        try {
          return await fn(req);
        } catch (e) {
          console.error(`[mcp] ${suffix} failed:`, e);
          return oauthError('server_error', 'Internal error', 500);
        }
      }
      return null;
    },
  };
}

async function readForm(req: Request): Promise<URLSearchParams | null> {
  const type = req.headers.get('content-type') ?? '';
  try {
    const text = await req.text();
    if (text.length > 32_768) return null;
    if (type.includes('application/json')) {
      const body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
    }
    return new URLSearchParams(text);
  } catch {
    return null;
  }
}

export type OAuthServer = ReturnType<typeof createOAuthServer>;
