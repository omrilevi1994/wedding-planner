// The MCP's own OAuth server (supabase/functions/mcp/oauth.ts) end to end, against the local
// Supabase stack: agents register / authorize / get tokens at the MCP, which signs the user in
// through Supabase Auth as one upstream client and hands out sealed tokens. See docs/mcp.md.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, makeWedding } from './setup.js';
import { startMcp } from './mcp-server.js';
import {
  AGENT_REDIRECT_URI, agentToken, authorizeAgent, connectAgent, registerAgent, userClient,
} from './oauth-helpers.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = 'Passw0rd!1';
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let mcp, w, owner, ownerSession, other, otherSession;

async function makeUser(label) {
  const email = `mcp-oauth-${label}-${run}@t.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const session = userClient();
  const s = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw s.error;
  return [{ id: data.user.id, email }, session];
}

async function mcpCall(token, name = 'list_weddings', args = {}) {
  const res = await fetch(mcp.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function connection(id) {
  const { data } = await admin.from('mcp_connections').select('*').eq('id', id).single();
  return data;
}

/** The connection id inside a sealed token isn't readable; find the newest row for the user. */
async function latestConnection(userId) {
  const { data } = await admin.from('mcp_connections').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).single();
  return data;
}

beforeAll(async () => {
  mcp = await startMcp();
  [owner, ownerSession] = await makeUser('owner');
  [other, otherSession] = await makeUser('other');
  w = await makeWedding();
  await admin.from('weddings').update({ owner_id: owner.id, couple_names: 'OAuth & Test' }).eq('id', w.id).throwOnError();
  await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' }).throwOnError();
}, 120_000);

afterAll(async () => {
  await mcp?.stop();
  if (w) await admin.from('weddings').delete().eq('id', w.id);
});

describe('discovery', () => {
  it('protected-resource metadata names the MCP as its authorization server', async () => {
    const meta = await (await fetch(`${mcp.url}/.well-known/oauth-protected-resource`)).json();
    expect(meta).toMatchObject({ resource: mcp.url, authorization_servers: [mcp.url], scopes_supported: ['wedflow:read'] });
  });

  it('serves RFC 8414 authorization server metadata (and the OIDC alias)', async () => {
    for (const suffix of ['oauth-authorization-server', 'openid-configuration']) {
      const res = await fetch(`${mcp.url}/.well-known/${suffix}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        issuer: mcp.url,
        authorization_endpoint: `${mcp.url}/authorize`,
        token_endpoint: `${mcp.url}/token`,
        registration_endpoint: `${mcp.url}/register`,
        revocation_endpoint: `${mcp.url}/revoke`,
        code_challenge_methods_supported: ['S256'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      });
    }
  });

  it('Supabase dynamic client registration is off (the MCP is the only OAuth client)', async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/oauth/clients/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://localhost:1/cb'] }),
    });
    expect(res.status).toBe(403);
  });
});

describe('/register', () => {
  it('registers a public client with a sealed client_id and no secret', async () => {
    const { status, body } = await registerAgent(mcp.url, { client_name: 'Claude Code' });
    expect(status).toBe(201);
    expect(body.client_id).toMatch(/^wfc_/);
    expect(body).toMatchObject({ client_name: 'Claude Code', redirect_uris: [AGENT_REDIRECT_URI], token_endpoint_auth_method: 'none' });
    expect(body.client_secret).toBeUndefined();
  });

  it('issues a secret to confidential clients', async () => {
    const { status, body } = await registerAgent(mcp.url, { token_endpoint_auth_method: 'client_secret_post' });
    expect(status).toBe(201);
    expect(body.client_secret).toEqual(expect.any(String));
  });

  it.each([
    ['https://evil.example/cb'],
    ['https://chatgpt.com/aip/g-123abc/oauth/callback'],
    ['http://claude.ai/api/mcp/auth_callback'],
    ['https://claude.ai.evil.example/cb'],
    ['javascript:alert(1)'],
  ])('rejects the untrusted redirect URI %s', async (uri) => {
    const { status, body } = await registerAgent(mcp.url, { redirect_uris: [uri] });
    expect(status).toBe(400);
    expect(body.error).toBe('invalid_redirect_uri');
  });

  it('rejects a mix of trusted and untrusted redirect URIs', async () => {
    const { status } = await registerAgent(mcp.url, { redirect_uris: [AGENT_REDIRECT_URI, 'https://evil.example/cb'] });
    expect(status).toBe(400);
  });

  it('rejects missing redirect URIs and unsupported auth methods / grants', async () => {
    expect((await registerAgent(mcp.url, { redirect_uris: [] })).body.error).toBe('invalid_redirect_uri');
    expect((await registerAgent(mcp.url, { token_endpoint_auth_method: 'private_key_jwt' })).body.error).toBe('invalid_client_metadata');
    expect((await registerAgent(mcp.url, { grant_types: ['client_credentials'] })).body.error).toBe('invalid_client_metadata');
  });
});

describe('/authorize validation', () => {
  it('rejects an unknown or tampered client_id with a plain 400 (no redirect)', async () => {
    const res = await fetch(`${mcp.url}/authorize?client_id=wfc_nope&redirect_uri=${encodeURIComponent(AGENT_REDIRECT_URI)}`, { redirect: 'manual' });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('rejects a redirect_uri the client did not register', async () => {
    const { body } = await registerAgent(mcp.url);
    const q = new URLSearchParams({ client_id: body.client_id, redirect_uri: 'http://localhost:1/other', response_type: 'code' });
    const res = await fetch(`${mcp.url}/authorize?${q}`, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  const authorizeQuery = (clientId, over = {}) => new URLSearchParams(Object.fromEntries(Object.entries({
    client_id: clientId, redirect_uri: AGENT_REDIRECT_URI, response_type: 'code', state: 'xyz',
    code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', resource: mcp.url, ...over,
  }).filter(([, v]) => v !== undefined)));

  it.each([
    ['no PKCE', { code_challenge: undefined, code_challenge_method: undefined }],
    ['plain PKCE', { code_challenge_method: 'plain' }],
    ['no resource', { resource: undefined }],
    ['another resource (look-alike connector)', { resource: 'https://attacker.example/mcp' }],
    ['response_type=token', { response_type: 'token' }],
  ])('refuses %s with a plain 400 — no redirect before consent', async (_label, over) => {
    const { body } = await registerAgent(mcp.url);
    const res = await fetch(`${mcp.url}/authorize?${authorizeQuery(body.client_id, over)}`, { redirect: 'manual' });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects to Supabase as the upstream client and sets the nonce + agent cookies', async () => {
    const { body } = await registerAgent(mcp.url, { client_name: 'Cookie Agent' });
    const res = await fetch(`${mcp.url}/authorize?${authorizeQuery(body.client_id)}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location'));
    expect(loc.origin + loc.pathname).toBe(`${SUPABASE_URL}/auth/v1/oauth/authorize`);
    expect(loc.searchParams.get('client_id')).toBe(mcp.upstreamClientId);
    expect(loc.searchParams.get('redirect_uri')).toBe(`${mcp.url}/callback`);
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => /^wfmcp_[^=]+=/.test(c) && /HttpOnly/.test(c) && /Path=\/mcp/.test(c))).toBe(true);
    const agent = cookies.find((c) => c.startsWith('wedflow_mcp_agent='));
    expect(agent).toMatch(/Path=\/app\/oauth/);
    expect(JSON.parse(decodeURIComponent(agent.split(';')[0].split('=')[1]))).toEqual({ name: 'Cookie Agent', host: 'localhost:9998' });
  });
});

describe('full flow', () => {
  let agent;
  beforeAll(async () => {
    agent = await connectAgent(mcp.url, ownerSession, { client_name: 'E2E Agent' });
  }, 60_000);

  it('returns sealed tokens, not Supabase JWTs', () => {
    expect(agent.access_token).toMatch(/^wfa_/);
    expect(agent.refresh_token).toMatch(/^wfr_/);
    expect(agent.access_token.split('.')).toHaveLength(1);
    expect(agent).toMatchObject({ token_type: 'Bearer', scope: 'wedflow:read' });
    expect(agent.expires_in).toBeGreaterThan(3000);
  });

  it('records the connection (agent name, redirect host, upstream session, code used)', async () => {
    const conn = await latestConnection(owner.id);
    expect(conn).toMatchObject({ client_name: 'E2E Agent', redirect_host: 'localhost:9998', revoked_at: null });
    expect(conn.session_id).toEqual(expect.any(String));
    expect(conn.code_used_at).not.toBeNull();
  });

  it('the agent token works for MCP tool calls, scoped by RLS', async () => {
    const { status, body } = await mcpCall(agent.access_token);
    expect(status).toBe(200);
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.weddings.map((x) => [x.id, x.role])).toEqual([[w.id, 'owner']]);
  });

  it('Supabase rejects the agent token (no account takeover via /auth/v1/user, no REST)', async () => {
    const user = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, authorization: `Bearer ${agent.access_token}` } });
    expect([401, 403]).toContain(user.status);
    const put = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT', headers: { apikey: ANON, authorization: `Bearer ${agent.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'Hijacked!123' }),
    });
    expect([401, 403]).toContain(put.status);
    const rest = await fetch(`${SUPABASE_URL}/rest/v1/weddings?select=id`, { headers: { apikey: ANON, authorization: `Bearer ${agent.access_token}` } });
    expect(rest.status).toBe(401);
    // and the password really is unchanged
    const c = userClient();
    expect((await c.auth.signInWithPassword({ email: owner.email, password: PASSWORD })).error).toBeNull();
  });

  it('refreshes: new tokens work, the refresh token rotates', async () => {
    const { status, body } = await agentToken(mcp.url, {
      grant_type: 'refresh_token', refresh_token: agent.refresh_token, client_id: agent.clientId,
    });
    expect(status).toBe(200);
    expect(body.access_token).toMatch(/^wfa_/);
    expect(body.refresh_token).not.toBe(agent.refresh_token);
    expect((await mcpCall(body.access_token)).status).toBe(200);
  });

  it('refresh is bound to the client that got the token', async () => {
    const { body: otherClient } = await registerAgent(mcp.url);
    const { status, body } = await agentToken(mcp.url, {
      grant_type: 'refresh_token', refresh_token: agent.refresh_token, client_id: otherClient.client_id,
    });
    expect(status).toBe(400);
    expect(body.error).toBe('invalid_grant');
  });
});

describe('authorization code protection', () => {
  it('rejects a wrong PKCE verifier, then accepts the right one once', async () => {
    const { body: reg } = await registerAgent(mcp.url);
    const auth = await authorizeAgent(mcp.url, reg.client_id, ownerSession);
    const code = auth.redirect.searchParams.get('code');
    expect(auth.redirect.searchParams.get('state')).toBe(auth.state);
    expect(auth.redirect.searchParams.get('iss')).toBe(mcp.url);
    const base = { grant_type: 'authorization_code', code, redirect_uri: AGENT_REDIRECT_URI, client_id: reg.client_id };

    const bad = await agentToken(mcp.url, { ...base, code_verifier: 'x'.repeat(43) });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_grant');

    const good = await agentToken(mcp.url, { ...base, code_verifier: auth.verifier });
    expect(good.status).toBe(200);
  });

  it('a replayed code is rejected and revokes the connection it created', async () => {
    const agent = await connectAgent(mcp.url, ownerSession);
    const conn = await latestConnection(owner.id);
    const replay = await agentToken(mcp.url, {
      grant_type: 'authorization_code', code: agent.code, redirect_uri: AGENT_REDIRECT_URI,
      code_verifier: agent.verifier, client_id: agent.clientId,
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');
    expect((await connection(conn.id)).revoked_at).not.toBeNull();
    expect((await mcpCall(agent.access_token)).status).toBe(401);
  });

  it('a code is bound to its client and redirect_uri', async () => {
    const { body: reg } = await registerAgent(mcp.url);
    const { body: thief } = await registerAgent(mcp.url);
    const auth = await authorizeAgent(mcp.url, reg.client_id, ownerSession);
    const code = auth.redirect.searchParams.get('code');
    const stolen = await agentToken(mcp.url, {
      grant_type: 'authorization_code', code, code_verifier: auth.verifier, client_id: thief.client_id,
    });
    expect(stolen.body.error).toBe('invalid_grant');
    const wrongRedirect = await agentToken(mcp.url, {
      grant_type: 'authorization_code', code, code_verifier: auth.verifier, client_id: reg.client_id,
      redirect_uri: 'http://localhost:9998/elsewhere',
    });
    expect(wrongRedirect.body.error).toBe('invalid_grant');
  });

  it('confidential clients must present their secret', async () => {
    const { body: reg } = await registerAgent(mcp.url, { token_endpoint_auth_method: 'client_secret_basic' });
    const auth = await authorizeAgent(mcp.url, reg.client_id, ownerSession);
    const code = auth.redirect.searchParams.get('code');
    const params = { grant_type: 'authorization_code', code, code_verifier: auth.verifier, redirect_uri: AGENT_REDIRECT_URI };
    const noSecret = await agentToken(mcp.url, { ...params, client_id: reg.client_id });
    expect(noSecret.status).toBe(401);
    expect(noSecret.body.error).toBe('invalid_client');
    const basic = `Basic ${Buffer.from(`${reg.client_id}:${reg.client_secret}`).toString('base64')}`;
    expect((await agentToken(mcp.url, params, { authorization: basic })).status).toBe(200);
  });

  it('the callback refuses a browser without the nonce cookie (login CSRF)', async () => {
    const { body: reg } = await registerAgent(mcp.url);
    const auth = await authorizeAgent(mcp.url, reg.client_id, ownerSession, { sendCookies: false });
    expect(auth.callbackStatus).toBe(400);
    expect(auth.redirect).toBeNull();
    expect(auth.callbackBody).toMatch(/different browser/);
  });

  it('a user denying consent sends access_denied back to the agent', async () => {
    // A fresh user: Supabase auto-approves repeat consents for the same upstream client.
    const [, session] = await makeUser('denier');
    const { body: reg } = await registerAgent(mcp.url);
    const auth = await authorizeAgent(mcp.url, reg.client_id, session, { deny: true });
    expect(auth.redirect.searchParams.get('error')).toBe('access_denied');
    expect(auth.redirect.searchParams.get('state')).toBe(auth.state);
    expect(auth.redirect.searchParams.get('code')).toBeNull();
  });

  it('Supabase auto-approves a returning user (why the consent page always asks for MCP flows)', async () => {
    const { body: reg } = await registerAgent(mcp.url);
    const auth = await authorizeAgent(mcp.url, reg.client_id, ownerSession);
    expect(auth.details.authorization_id).toBeUndefined();
    expect(auth.details.redirect_url).toContain(`${mcp.url}/callback`);
  });
});

describe('revocation', () => {
  it('Settings → Disconnect (revoke_mcp_connection) cuts the agent off immediately', async () => {
    const agent = await connectAgent(mcp.url, ownerSession, { client_name: 'To Revoke' });
    const conn = await latestConnection(owner.id);
    expect((await mcpCall(agent.access_token)).status).toBe(200);

    // Another user can't revoke it.
    const denied = await otherSession.rpc('revoke_mcp_connection', { connection_id: conn.id });
    expect(denied.data).toBe(false);
    expect((await connection(conn.id)).revoked_at).toBeNull();

    const { data, error } = await ownerSession.rpc('revoke_mcp_connection', { connection_id: conn.id });
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect((await connection(conn.id)).revoked_at).not.toBeNull();
    expect((await mcpCall(agent.access_token)).status).toBe(401);
    const refresh = await agentToken(mcp.url, { grant_type: 'refresh_token', refresh_token: agent.refresh_token, client_id: agent.clientId });
    expect(refresh.body.error).toBe('invalid_grant');
  });

  it('revoking one agent leaves the user\'s other agents and app session alone', async () => {
    const a = await connectAgent(mcp.url, ownerSession);
    const connA = await latestConnection(owner.id);
    const b = await connectAgent(mcp.url, ownerSession);
    await ownerSession.rpc('revoke_mcp_connection', { connection_id: connA.id });
    expect((await mcpCall(a.access_token)).status).toBe(401);
    expect((await mcpCall(b.access_token)).status).toBe(200);
    const { data } = await ownerSession.from('weddings').select('id').eq('id', w.id);
    expect(data).toEqual([{ id: w.id }]);
  });

  it('users see only their own connections', async () => {
    const own = await ownerSession.from('mcp_connections').select('user_id');
    expect(own.error).toBeNull();
    expect(new Set(own.data.map((r) => r.user_id))).toEqual(new Set([owner.id]));
    const theirs = await otherSession.from('mcp_connections').select('id').eq('user_id', owner.id);
    expect(theirs.data).toEqual([]);
  });

  it('users cannot write connections or call the internal revoke', async () => {
    const ins = await ownerSession.from('mcp_connections').insert({ user_id: owner.id, client_name: 'x', redirect_host: 'x' });
    expect(ins.error).not.toBeNull();
    const conn = await latestConnection(owner.id);
    const internal = await otherSession.rpc('mcp_revoke_connection_internal', { connection_id: conn.id });
    expect(internal.error).not.toBeNull();
  });

  it('connecting again ends earlier approvals the agent never redeemed', async () => {
    const { data: stale } = await admin.from('mcp_connections').insert({
      user_id: owner.id, client_name: 'abandoned', redirect_host: 'localhost',
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    }).select('id').single();
    await connectAgent(mcp.url, ownerSession);
    expect((await connection(stale.id)).revoked_at).not.toBeNull();
  });

  it('/revoke (RFC 7009) with the refresh token disconnects the agent', async () => {
    const agent = await connectAgent(mcp.url, ownerSession);
    const res = await fetch(`${mcp.url}/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: agent.refresh_token, client_id: agent.clientId }),
    });
    expect(res.status).toBe(200);
    expect((await mcpCall(agent.access_token)).status).toBe(401);
  });
});
