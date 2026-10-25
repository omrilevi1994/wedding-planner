import { describe, it, expect } from 'vitest';
import {
  getMcpServerUrl,
  claudeCodeCommand,
  parseAuthorizationId,
  redirectDisplayHost,
  isAuthorizationRedirect,
  classifyConsentError,
  normalizeScopes,
  isTrustedRedirect,
  isMcpCallback,
  readMcpAgentCookie,
  deniedMcpCallbackUrl,
} from '@/lib/mcp';

describe('getMcpServerUrl', () => {
  it('defaults to the mcp edge function on the Supabase project', () => {
    expect(getMcpServerUrl({ VITE_SUPABASE_URL: 'https://abc.supabase.co' }))
      .toBe('https://abc.supabase.co/functions/v1/mcp');
  });

  it('drops a trailing slash on the Supabase URL', () => {
    expect(getMcpServerUrl({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321/' }))
      .toBe('http://127.0.0.1:54321/functions/v1/mcp');
  });

  it('prefers VITE_MCP_URL when set', () => {
    expect(getMcpServerUrl({ VITE_MCP_URL: 'https://mcp.wedflow.app/', VITE_SUPABASE_URL: 'https://abc.supabase.co' }))
      .toBe('https://mcp.wedflow.app');
  });

  it('treats an empty VITE_MCP_URL as unset', () => {
    expect(getMcpServerUrl({ VITE_MCP_URL: '  ', VITE_SUPABASE_URL: 'https://abc.supabase.co' }))
      .toBe('https://abc.supabase.co/functions/v1/mcp');
  });

  it('uses the wedflow.live address in production builds', () => {
    expect(getMcpServerUrl({ PROD: true, VITE_SUPABASE_URL: 'https://abc.supabase.co' }))
      .toBe('https://wedflow.live/mcp');
  });

  it('still prefers VITE_MCP_URL in production builds', () => {
    expect(getMcpServerUrl({ PROD: true, VITE_MCP_URL: 'https://mcp.wedflow.app' }))
      .toBe('https://mcp.wedflow.app');
  });

  it('reads import.meta.env by default', () => {
    expect(getMcpServerUrl()).toBe(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/mcp`);
  });
});

describe('claudeCodeCommand', () => {
  it('builds the claude mcp add command', () => {
    expect(claudeCodeCommand('https://x.co/functions/v1/mcp'))
      .toBe('claude mcp add --transport http wedflow https://x.co/functions/v1/mcp');
  });
});

describe('parseAuthorizationId', () => {
  it('reads authorization_id from a query string', () => {
    expect(parseAuthorizationId('?authorization_id=3umyvafm5e67sd46tflqpt3ejky4hlpo'))
      .toBe('3umyvafm5e67sd46tflqpt3ejky4hlpo');
  });

  it('accepts URLSearchParams', () => {
    expect(parseAuthorizationId(new URLSearchParams({ authorization_id: 'abc_DEF-123' }))).toBe('abc_DEF-123');
  });

  it('returns null when missing or empty', () => {
    expect(parseAuthorizationId('')).toBeNull();
    expect(parseAuthorizationId('?foo=bar')).toBeNull();
    expect(parseAuthorizationId('?authorization_id=')).toBeNull();
  });

  it('rejects values that could alter the request path', () => {
    expect(parseAuthorizationId('?authorization_id=../../user')).toBeNull();
    expect(parseAuthorizationId('?authorization_id=abc%2Fconsent')).toBeNull();
    expect(parseAuthorizationId('?authorization_id=abc%3Fx%3D1')).toBeNull();
    expect(parseAuthorizationId(`?authorization_id=${'a'.repeat(129)}`)).toBeNull();
  });
});

describe('redirectDisplayHost', () => {
  it('shows host (with port) for http(s) URIs', () => {
    expect(redirectDisplayHost('http://localhost:9999/cb')).toBe('localhost:9999');
    expect(redirectDisplayHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
  });

  it('handles custom schemes', () => {
    expect(redirectDisplayHost('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe('anysphere.cursor-retrieval');
    expect(redirectDisplayHost('myapp:/callback')).toBe('myapp://callback');
  });

  it('falls back to the raw value / empty string', () => {
    expect(redirectDisplayHost('not a url')).toBe('not a url');
    expect(redirectDisplayHost(undefined)).toBe('');
  });
});

describe('isAuthorizationRedirect', () => {
  it('detects the already-consented redirect response', () => {
    expect(isAuthorizationRedirect({ redirect_url: 'http://localhost:9999/cb?code=x' })).toBe(true);
  });

  it('is false for consent details or nothing', () => {
    expect(isAuthorizationRedirect({ authorization_id: 'a', redirect_uri: 'http://x', client: {} })).toBe(false);
    expect(isAuthorizationRedirect(null)).toBe(false);
  });
});

describe('classifyConsentError', () => {
  // Shapes observed from the local Supabase Auth OAuth server.
  it('maps an unknown authorization id to not_found', () => {
    expect(classifyConsentError({ name: 'AuthApiError', message: 'authorization not found', status: 404, code: 'oauth_authorization_not_found' }))
      .toBe('not_found');
  });

  it('maps already-approved/denied requests to already_processed', () => {
    expect(classifyConsentError({ message: 'authorization request is no longer pending', status: 400, code: 'validation_failed' }))
      .toBe('already_processed');
    expect(classifyConsentError({ message: 'authorization request cannot be processed', status: 400, code: 'validation_failed' }))
      .toBe('already_processed');
  });

  it('maps expiry', () => {
    expect(classifyConsentError({ message: 'authorization request has expired', status: 400 })).toBe('expired');
  });

  it('maps a missing session', () => {
    expect(classifyConsentError({ name: 'AuthSessionMissingError', message: 'Auth session missing!' })).toBe('session');
  });

  it('falls back to unknown', () => {
    expect(classifyConsentError({ message: 'boom', status: 500 })).toBe('unknown');
    expect(classifyConsentError(null)).toBe('unknown');
  });
});

describe('normalizeScopes', () => {
  it('accepts arrays and space-separated strings', () => {
    expect(normalizeScopes(['openid', 'email'])).toEqual(['openid', 'email']);
    expect(normalizeScopes('openid  email ')).toEqual(['openid', 'email']);
    expect(normalizeScopes(undefined)).toEqual([]);
  });
});

describe('isTrustedRedirect', () => {
  it('allows the known agent platforms over https only', () => {
    expect(isTrustedRedirect('https://claude.ai/api/mcp/auth_callback', {})).toBe(true);
    expect(isTrustedRedirect('https://chatgpt.com/connector_platform_oauth_redirect', {})).toBe(true);
    expect(isTrustedRedirect('http://claude.ai/api/mcp/auth_callback', {})).toBe(false);
  });

  it('allows loopback and known app schemes (CLI / desktop agents)', () => {
    expect(isTrustedRedirect('http://localhost:54012/callback', {})).toBe(true);
    expect(isTrustedRedirect('http://127.0.0.1:9999/cb?code=x', {})).toBe(true);
    expect(isTrustedRedirect('http://[::1]:8080/cb', {})).toBe(true);
    expect(isTrustedRedirect('cursor://anysphere.cursor-mcp/oauth/callback', {})).toBe(true);
  });

  it('rejects unknown hosts, look-alikes and junk', () => {
    expect(isTrustedRedirect('https://evil.example/cb', {})).toBe(false);
    expect(isTrustedRedirect('https://claude.ai.evil.example/cb', {})).toBe(false);
    expect(isTrustedRedirect('https://evilclaude.ai/cb', {})).toBe(false);
    expect(isTrustedRedirect('https://chatgpt.com/aip/g-123/oauth/callback', {})).toBe(false);
    expect(isTrustedRedirect('https://claude.ai/anything-else', {})).toBe(false);
    expect(isTrustedRedirect('https://localhost.evil.example/cb', {})).toBe(false);
    expect(isTrustedRedirect('javascript:alert(1)', {})).toBe(false);
    expect(isTrustedRedirect('', {})).toBe(false);
    expect(isTrustedRedirect(undefined, {})).toBe(false);
  });

  it('accepts extra https hosts from VITE_MCP_TRUSTED_REDIRECT_HOSTS', () => {
    const env = { VITE_MCP_TRUSTED_REDIRECT_HOSTS: ' agents.example.com , other.example ' };
    expect(isTrustedRedirect('https://agents.example.com/cb', env)).toBe(true);
    expect(isTrustedRedirect('https://other.example/cb', env)).toBe(true);
    expect(isTrustedRedirect('http://agents.example.com/cb', env)).toBe(false);
  });
});

describe('MCP OAuth callback (agents connect through the MCP)', () => {
  const prod = { PROD: true };
  const local = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321' };

  it('recognises the MCP /callback as trusted', () => {
    expect(isMcpCallback('https://wedflow.live/mcp/callback?code=abc&state=s', prod)).toBe(true);
    expect(isTrustedRedirect('https://wedflow.live/mcp/callback?code=abc', prod)).toBe(true);
    expect(isMcpCallback('http://127.0.0.1:54321/functions/v1/mcp/callback', local)).toBe(true);
  });

  it('does not trust look-alikes', () => {
    expect(isMcpCallback('https://wedflow.live/mcp/callbackx', prod)).toBe(false);
    expect(isMcpCallback('https://wedflow.live/other/callback', prod)).toBe(false);
    expect(isMcpCallback('https://evil.example/mcp/callback', prod)).toBe(false);
    expect(isMcpCallback('http://wedflow.live/mcp/callback', prod)).toBe(false);
    expect(isMcpCallback('https://wedflow.live/mcp/callback#x', prod)).toBe(false);
    expect(isTrustedRedirect('https://wedflow.live/mcp/callbackx', prod)).toBe(false);
  });

  it('reads the agent cookie defensively', () => {
    const v = encodeURIComponent(JSON.stringify({ name: 'Claude', host: 'claude.ai' }));
    expect(readMcpAgentCookie(`a=1; wedflow_mcp_agent=${v}; b=2`)).toEqual({ name: 'Claude', host: 'claude.ai' });
    expect(readMcpAgentCookie('a=1')).toBeNull();
    expect(readMcpAgentCookie('wedflow_mcp_agent=%7Bbroken')).toBeNull();
    expect(readMcpAgentCookie(`wedflow_mcp_agent=${encodeURIComponent('{"name":5}')}`)).toBeNull();
    expect(readMcpAgentCookie('')).toBeNull();
  });

  it('turns a pre-issued code into a denial, keeping state', () => {
    const out = new URL(deniedMcpCallbackUrl('https://wedflow.live/mcp/callback?code=abc&state=xyz'));
    expect(out.searchParams.get('code')).toBeNull();
    expect(out.searchParams.get('error')).toBe('access_denied');
    expect(out.searchParams.get('state')).toBe('xyz');
  });
});
