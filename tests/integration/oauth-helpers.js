// OAuth test drivers.
// * oauthToken(): Supabase Auth's OAuth 2.1 server directly (register -> authorize (PKCE) ->
//   user approves -> code -> token) — what the MCP does upstream; its tokens are the inner,
//   never-exposed ones (migration 0026 makes them read-only).
// * registerAgent() / authorizeAgent() / exchangeAgentCode() / connectAgent(): the MCP's own
//   OAuth server, the way an MCP client + the WedFlow consent page would drive it.
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { admin } from './setup.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const REDIRECT_URI = 'http://localhost:9999/callback';

// auth.oauth.* needs a stored session (persistSession: false makes them throw
// AuthSessionMissingError), so keep the session in memory instead of localStorage.
export function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** Anon-key client with an in-memory persisted session. */
export function userClient(options = {}) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...options,
    auth: { persistSession: true, autoRefreshToken: false, storage: memoryStorage(), ...options.auth },
  });
}

/** Client that sends a fixed access token (e.g. an OAuth agent token) on every request. */
export function tokenClient(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => accessToken,
  });
}

export function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** Registers a public PKCE client with Supabase Auth via the admin API (dynamic registration is off). */
export async function registerClient(name = 'vitest-agent') {
  const { data, error } = await admin.auth.admin.oauth.createClient({
    client_name: name,
    redirect_uris: [REDIRECT_URI],
    client_type: 'public',
    token_endpoint_auth_method: 'none',
  });
  if (error) throw error;
  return data;
}

/**
 * Full OAuth flow for an existing user. Returns { access_token, refresh_token, client_id }.
 * Pass `client` to reuse an already signed-in userClient().
 */
export async function oauthToken(email, password, { client } = {}) {
  const user = client ?? userClient();
  if (!client) {
    const { error } = await user.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  const { client_id } = await registerClient();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(8).toString('hex');

  const q = new URLSearchParams({
    response_type: 'code', client_id, redirect_uri: REDIRECT_URI, state, scope: 'openid email',
    code_challenge: challenge, code_challenge_method: 'S256',
  });
  const auth = await fetch(`${SUPABASE_URL}/auth/v1/oauth/authorize?${q}`, { redirect: 'manual' });
  const loc = auth.headers.get('location');
  const authorizationId = loc && new URL(loc).searchParams.get('authorization_id');
  if (!authorizationId) throw new Error(`authorize did not redirect to consent (${auth.status}): ${loc}`);

  // The consent page loads the details first; that call binds the authorization to the user.
  const details = await user.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) throw details.error;
  const approved = await user.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (approved.error) throw approved.error;
  const redirect = new URL(approved.data.redirect_url ?? approved.data.redirect_to);
  if (redirect.searchParams.get('state') !== state) throw new Error('state mismatch');
  const code = redirect.searchParams.get('code');
  if (!code) throw new Error(`no code in redirect: ${redirect}`);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id, code_verifier: verifier,
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error(`token exchange failed (${res.status}): ${JSON.stringify(tok)}`);
  return { access_token: tok.access_token, refresh_token: tok.refresh_token, client_id };
}

/** Refresh an OAuth token via the OAuth token endpoint. */
export async function refreshOAuthToken(refreshToken, clientId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }),
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------------------------
// The MCP's OAuth server (supabase/functions/mcp/oauth.ts)

export const AGENT_REDIRECT_URI = 'http://localhost:9998/agent/callback';

export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

/** POST {mcp}/register. Returns { status, body }. */
export async function registerAgent(mcpUrl, metadata = {}) {
  const res = await fetch(`${mcpUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'vitest agent', redirect_uris: [AGENT_REDIRECT_URI], token_endpoint_auth_method: 'none', ...metadata }),
  });
  return { status: res.status, body: await res.json() };
}

function setCookies(res) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
}

/**
 * Agent -> {mcp}/authorize -> Supabase /oauth/authorize -> consent (user approves via the SDK,
 * like the consent page) -> {mcp}/callback. Returns the agent-side redirect and everything a
 * negative test may want to tamper with.
 */
export async function authorizeAgent(mcpUrl, clientId, user, { redirectUri = AGENT_REDIRECT_URI, sendCookies = true, deny = false } = {}) {
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(8).toString('hex');
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: mcpUrl,
  });
  const start = await fetch(`${mcpUrl}/authorize?${q}`, { redirect: 'manual' });
  if (start.status !== 302) throw new Error(`authorize: ${start.status} ${await start.text()}`);
  const cookies = setCookies(start);
  const upstream = await fetch(start.headers.get('location'), { redirect: 'manual' });
  const consentUrl = new URL(upstream.headers.get('location'));
  const authorizationId = consentUrl.searchParams.get('authorization_id');
  if (!authorizationId) throw new Error(`upstream authorize did not reach consent: ${consentUrl}`);

  const details = await user.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) throw details.error;
  let callbackUrl = details.data.redirect_url; // already consented: Supabase issued the code
  if (details.data.authorization_id) {
    const decided = deny
      ? await user.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await user.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (decided.error) throw decided.error;
    callbackUrl = decided.data.redirect_url ?? decided.data.redirect_to;
  }
  const cb = await fetch(callbackUrl, {
    redirect: 'manual',
    headers: sendCookies ? { cookie: cookies.join('; ') } : {},
  });
  const location = cb.headers.get('location');
  return {
    state, verifier, cookies, details: details.data, callbackUrl,
    callbackStatus: cb.status,
    callbackBody: location ? null : await cb.text(),
    redirect: location ? new URL(location) : null,
  };
}

/** POST {mcp}/token (form-encoded). Returns { status, body }. */
export async function agentToken(mcpUrl, params, headers = {}) {
  const res = await fetch(`${mcpUrl}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(params),
  });
  return { status: res.status, body: await res.json() };
}

/** Full happy path: register -> authorize -> approve -> callback -> token. */
export async function connectAgent(mcpUrl, user, metadata = {}) {
  const reg = await registerAgent(mcpUrl, metadata);
  if (reg.status !== 201) throw new Error(`register: ${reg.status} ${JSON.stringify(reg.body)}`);
  const auth = await authorizeAgent(mcpUrl, reg.body.client_id, user);
  const code = auth.redirect?.searchParams.get('code');
  if (!code) throw new Error(`no code: ${auth.callbackStatus} ${auth.redirect ?? auth.callbackBody}`);
  const tok = await agentToken(mcpUrl, {
    grant_type: 'authorization_code', code, redirect_uri: AGENT_REDIRECT_URI,
    code_verifier: auth.verifier, client_id: reg.body.client_id,
  });
  if (tok.status !== 200) throw new Error(`token: ${tok.status} ${JSON.stringify(tok.body)}`);
  return { clientId: reg.body.client_id, code, verifier: auth.verifier, ...tok.body };
}
