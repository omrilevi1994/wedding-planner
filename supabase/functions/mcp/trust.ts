// Where the MCP's OAuth server may send authorization codes. Mirrors isTrustedRedirect in
// src/lib/mcp.js (the consent page's copy); tests/unit/mcp-oauth.test.js keeps them in sync.
// Known agent platforms' connector callbacks, plus loopback / native-app redirects on the
// user's own machine (Claude Code, Cursor, …). Extra https hosts (any path) come from
// MCP_TRUSTED_REDIRECT_HOSTS.

// Agent platforms and the callback paths their MCP connectors use. Paths are pinned so a
// user-built integration on the same host (e.g. a custom GPT's /aip/… OAuth callback, whose
// token URL its author controls) can't receive WedFlow codes.
export const TRUSTED_REDIRECTS: Record<string, (path: string) => boolean> = {
  'claude.ai': (p) => p === '/api/mcp/auth_callback',
  'claude.com': (p) => p === '/api/mcp/auth_callback',
  'chatgpt.com': (p) => /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(p) || p === '/connector_platform_oauth_redirect',
};
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const TRUSTED_APP_SCHEMES = ['cursor:', 'vscode:'];

export function parseHostList(value: string | undefined | null): string[] {
  return String(value || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function isTrustedRedirect(uri: string, extraHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (TRUSTED_APP_SCHEMES.includes(u.protocol)) return true;
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTNAMES.includes(u.hostname)) return true;
  if (u.protocol !== 'https:' || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (TRUSTED_REDIRECTS[host]) return TRUSTED_REDIRECTS[host](u.pathname);
  return extraHosts.includes(host);
}

/** Short human-meaningful destination for display ("claude.ai", "localhost:33418", "cursor://…"). */
export function redirectHost(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.host) return u.host;
    const first = u.pathname.replace(/^\/+/, '').split('/')[0];
    return `${u.protocol}//${first}`;
  } catch {
    return uri;
  }
}
