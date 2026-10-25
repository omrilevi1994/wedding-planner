// OAuth (AI agent / MCP) tokens are read-only. Supabase Auth's OAuth server issues access
// tokens that are normal user JWTs plus a `client_id` claim; app sessions never have one.
// Edge functions that act on a user's behalf call rejectOAuthClient() first so an agent
// token can't reach the service-role code paths behind them (RLS side: migration 0026).
// Pure helpers (no Deno globals) so vitest can import this file.

/** Decode a JWT payload WITHOUT verifying it. Returns null if malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** True if the bearer token (or "Bearer <token>" header) is an OAuth client access token. */
export function isOAuthClientToken(authHeaderOrToken: string | null | undefined): boolean {
  if (!authHeaderOrToken) return false;
  const token = String(authHeaderOrToken).replace(/^Bearer\s+/i, '').trim();
  const payload = decodeJwtPayload(token);
  const clientId = payload?.client_id;
  return typeof clientId === 'string' ? clientId !== '' : clientId != null;
}

/**
 * 403 for OAuth (AI agent) tokens, null otherwise. Signature is not checked here: a forged
 * token without `client_id` still has to pass the caller's auth.getUser() verification.
 */
export function rejectOAuthClient(req: Request, corsHeaders: Record<string, string> = {}): Response | null {
  if (!isOAuthClientToken(req.headers.get('Authorization'))) return null;
  return Response.json({ error: 'AI agent tokens are read-only' }, { status: 403, headers: corsHeaders });
}
