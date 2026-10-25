// Unit tests for the MCP OAuth server's pure pieces: sealing and the trusted-redirect rules.
import { describe, it, expect } from 'vitest';
import { createKeys, open, seal, sha256, safeEqual, clientSecretFor } from '../../supabase/functions/mcp/seal.ts';
import { isTrustedRedirect as serverTrusted, redirectHost } from '../../supabase/functions/mcp/trust.ts';
import { authorizationServerMetadata } from '../../supabase/functions/mcp/oauth.ts';
import { isTrustedRedirect as consentTrusted } from '@/lib/mcp';

const SECRET = 'x'.repeat(40);

describe('seal / open', () => {
  it('round-trips a payload', async () => {
    const keys = await createKeys(SECRET);
    const t = await seal(keys, 'access', { at: 'jwt', cid: 'c1' });
    expect(t).toMatch(/^wfa_[A-Za-z0-9_-]+$/);
    expect(await open(keys, 'access', t)).toEqual({ at: 'jwt', cid: 'c1' });
  });

  it('binds the type: a code cannot be opened as an access token', async () => {
    const keys = await createKeys(SECRET);
    const code = await seal(keys, 'code', { cid: 'c1' });
    expect(await open(keys, 'access', code)).toBeNull();
    expect(await open(keys, 'access', `wfa_${code.slice(4)}`)).toBeNull();
  });

  it('rejects tampering, other keys and garbage', async () => {
    const keys = await createKeys(SECRET);
    const t = await seal(keys, 'refresh', { rt: 'r' });
    const flipped = t.slice(0, 10) + (t[10] === 'A' ? 'B' : 'A') + t.slice(11);
    expect(await open(keys, 'refresh', flipped)).toBeNull();
    expect(await open(await createKeys('y'.repeat(40)), 'refresh', t)).toBeNull();
    for (const bad of [null, 42, '', 'wfr_', 'wfr_!!!', 'eyJhbGciOi.x.y']) expect(await open(keys, 'refresh', bad)).toBeNull();
  });

  it('honours exp', async () => {
    const keys = await createKeys(SECRET);
    const t = await seal(keys, 'state', { exp: 1_000 });
    expect(await open(keys, 'state', t, 999)).toEqual({ exp: 1_000 });
    expect(await open(keys, 'state', t, 1_000)).toBeNull();
  });

  it('refuses a short secret', async () => {
    await expect(createKeys('short')).rejects.toThrow(/at least 32/);
  });

  it('derives stable client secrets and compares in constant time', async () => {
    const keys = await createKeys(SECRET);
    expect(await clientSecretFor(keys, 'wfc_a')).toBe(await clientSecretFor(keys, 'wfc_a'));
    expect(await clientSecretFor(keys, 'wfc_a')).not.toBe(await clientSecretFor(keys, 'wfc_b'));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('computes RFC 7636 S256 challenges', async () => {
    // Appendix B example.
    expect(await sha256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('trusted redirects', () => {
  const cases = [
    ['https://claude.ai/api/mcp/auth_callback', true],
    ['https://claude.com/x', true],
    ['https://chatgpt.com/connector/oauth/abc', true],
    ['https://chat.openai.com/aip/x/oauth/callback', true],
    ['http://localhost:33418/callback', true],
    ['http://127.0.0.1:9999/cb', true],
    ['http://[::1]:9999/cb', true],
    ['cursor://anysphere.cursor-retrieval/oauth/callback', true],
    ['vscode://x/cb', true],
    ['http://claude.ai/cb', false],
    ['https://claude.ai.evil.example/cb', false],
    ['https://evil.example/cb', false],
    ['javascript:alert(1)', false],
    ['https://claude.ai/cb#frag', false],
    ['not a url', false],
  ];

  it.each(cases)('%s → %s (server and consent page agree)', (uri, expected) => {
    expect(serverTrusted(uri)).toBe(expected);
    expect(consentTrusted(uri, {})).toBe(expected);
  });

  it('extra hosts are https-only on both sides', () => {
    expect(serverTrusted('https://agent.example/cb', ['agent.example'])).toBe(true);
    expect(consentTrusted('https://agent.example/cb', { VITE_MCP_TRUSTED_REDIRECT_HOSTS: 'agent.example' })).toBe(true);
    expect(serverTrusted('http://agent.example/cb', ['agent.example'])).toBe(false);
  });

  it('shows a short destination', () => {
    expect(redirectHost('http://localhost:33418/callback')).toBe('localhost:33418');
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
  });
});

describe('authorization server metadata', () => {
  it('advertises only what the server supports', () => {
    expect(authorizationServerMetadata('https://wedflow.live/mcp')).toMatchObject({
      issuer: 'https://wedflow.live/mcp',
      token_endpoint: 'https://wedflow.live/mcp/token',
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      scopes_supported: ['wedflow:read'],
    });
  });
});
