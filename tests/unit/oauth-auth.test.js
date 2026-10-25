import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeJwtPayload, isOAuthClientToken, rejectOAuthClient } from '../../supabase/functions/_shared/auth.ts';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;

const SESSION = jwt({ sub: 'u1', role: 'authenticated', amr: [{ method: 'password' }] });
const OAUTH = jwt({
  sub: 'u1', role: 'authenticated', client_id: '5f0c7a2e-1111-4222-8333-444455556666', scope: 'openid email',
  amr: [{ method: 'oauth_provider/authorization_code' }], name: 'דנה ✓', // non-ASCII survives decoding
});

describe('decodeJwtPayload', () => {
  it('decodes a base64url payload (incl. UTF-8)', () => {
    const p = decodeJwtPayload(OAUTH);
    expect(p.sub).toBe('u1');
    expect(p.name).toBe('דנה ✓');
  });

  it('returns null for malformed tokens', () => {
    for (const bad of ['', 'abc', 'a.b', 'a.!!!.c', `x.${Buffer.from('not json').toString('base64url')}.y`,
      `x.${b64url([1, 2])}.y`, null, undefined]) {
      expect(decodeJwtPayload(bad)).toBeNull();
    }
  });
});

describe('isOAuthClientToken', () => {
  it('detects tokens with a client_id claim, with or without "Bearer "', () => {
    expect(isOAuthClientToken(OAUTH)).toBe(true);
    expect(isOAuthClientToken(`Bearer ${OAUTH}`)).toBe(true);
    expect(isOAuthClientToken(`bearer  ${OAUTH}`)).toBe(true);
  });

  it('is false for normal sessions, anon keys, empty/garbage input', () => {
    expect(isOAuthClientToken(SESSION)).toBe(false);
    expect(isOAuthClientToken(`Bearer ${SESSION}`)).toBe(false);
    expect(isOAuthClientToken(jwt({ role: 'anon' }))).toBe(false);
    expect(isOAuthClientToken(jwt({ sub: 'u1', client_id: '' }))).toBe(false);
    expect(isOAuthClientToken(jwt({ sub: 'u1', client_id: null }))).toBe(false);
    expect(isOAuthClientToken('')).toBe(false);
    expect(isOAuthClientToken(null)).toBe(false);
    expect(isOAuthClientToken('Bearer garbage')).toBe(false);
  });
});

describe('rejectOAuthClient', () => {
  const req = (auth) => new Request('http://x/fn', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  const cors = { 'Access-Control-Allow-Origin': 'http://localhost:5173' };

  it('returns a 403 JSON response with CORS headers for OAuth tokens', async () => {
    const res = rejectOAuthClient(req(`Bearer ${OAUTH}`), cors);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(await res.json()).toEqual({ error: 'AI agent tokens are read-only' });
  });

  it('returns null for normal sessions and missing headers', () => {
    expect(rejectOAuthClient(req(`Bearer ${SESSION}`), cors)).toBeNull();
    expect(rejectOAuthClient(req(null), cors)).toBeNull();
  });
});

describe('edge functions acting for a user reject OAuth tokens', () => {
  const FN_DIR = path.resolve(__dirname, '../../supabase/functions');
  // Public / webhook / OAuth-native functions that intentionally don't call rejectOAuthClient.
  const EXEMPT = new Set(['_shared', 'submitCalculatorLead', 'authEmailHook', 'mcp']);
  const fns = fs.readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !EXEMPT.has(d.name) && fs.existsSync(path.join(FN_DIR, d.name, 'index.ts')))
    .map((d) => d.name);

  it('covers the known user-facing functions', () => {
    expect(fns).toEqual(expect.arrayContaining([
      'bulkUpdateGuestStatus', 'createWeddingInviteLink', 'getWeddingUsers', 'inviteUserToWedding',
      'iplanBulkImport', 'joinWeddingViaLink', 'listWeddingInviteLinks', 'revokeWeddingInviteLink', 'sendEmail',
    ]));
  });

  it.each(fns)('%s calls rejectOAuthClient before reading the Authorization header', (name) => {
    const src = fs.readFileSync(path.join(FN_DIR, name, 'index.ts'), 'utf8');
    expect(src).toMatch(/import \{[^}]*rejectOAuthClient[^}]*\} from '\.\.\/_shared\/auth\.ts'/);
    const call = src.search(/rejectOAuthClient\(req\b/);
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(src.indexOf("headers.get('Authorization')"));
  });
});
