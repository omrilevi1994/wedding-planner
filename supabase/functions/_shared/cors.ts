// Env-driven CORS. ALLOWED_ORIGINS is a comma-separated list set in Supabase function
// secrets, e.g. "https://your-app.vercel.app,http://localhost:5173". Defaults to localhost
// dev when unset. The request Origin is echoed only if allow-listed; otherwise the first
// configured origin is returned (so disallowed origins are not granted access).
const DEFAULT_ORIGINS = ['http://localhost:5173'];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return DEFAULT_ORIGINS;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = allowedOrigins();
  const allowedOrigin = allow.includes(origin) ? origin : allow[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
