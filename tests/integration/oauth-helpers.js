// Drives Supabase Auth's OAuth 2.1 server end-to-end, the way an MCP client + the WedFlow
// consent page would: DCR -> authorize (PKCE) -> user approves -> code -> token.
import 'dotenv/config';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

/** Dynamic client registration (public client, PKCE). */
export async function registerClient(name = 'vitest-agent') {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/oauth/clients/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.client_id) throw new Error(`DCR failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
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
