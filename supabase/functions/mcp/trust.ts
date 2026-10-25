// Where the MCP's OAuth server may send authorization codes. Mirrors isTrustedRedirect in
// src/lib/mcp.js (the consent page's copy); tests/unit/mcp-oauth.test.js keeps them in sync.
// Known agent platforms, plus loopback / native-app redirects on the user's own machine
// (Claude Code, Cursor, …). Extra https hosts come from MCP_TRUSTED_REDIRECT_HOSTS.

export const TRUSTED_REDIRECT_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com', 'chat.openai.com'];
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const TRUSTED_APP_SCHEMES = ['cursor:', 'vscode:'];

export function parseHostList(value: string | undefined | null): string[] {
  return String(value || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function isTrustedRedirect(uri: string, extraHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (TRUSTED_APP_SCHEMES.includes(u.protocol)) return true;
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTNAMES.includes(u.hostname)) return true;
  if (u.protocol !== 'https:') return false;
  return [...TRUSTED_REDIRECT_HOSTS, ...extraHosts].includes(u.hostname.toLowerCase());
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
