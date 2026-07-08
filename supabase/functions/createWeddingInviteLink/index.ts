import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Roles a shareable link may grant. Deliberately excludes 'owner' — a link can never hand
// out ownership, only collaborator-level access. Mirrors inviteUserToWedding's INVITABLE_ROLES.
const LINKABLE_ROLES = ['coplanner', 'family', 'event_manager'];
const TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // --- Authenticate caller ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // --- Parse + validate body ---
    const { wedding_id, role = 'coplanner' } = await req.json();
    if (!wedding_id) {
      return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: corsHeaders });
    }
    if (!LINKABLE_ROLES.includes(role)) {
      return Response.json({ error: `role must be one of: ${LINKABLE_ROLES.join(', ')}` }, { status: 400, headers: corsHeaders });
    }

    // --- Authorize: wedding owner or platform admin (via service client) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles')
        .select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
    }

    // --- Generate an unguessable token (two concatenated UUIDv4s: ~244 bits of entropy) ---
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    const { error: insertError } = await service.from('wedding_invite_links').insert({
      id: crypto.randomUUID(),
      wedding_id,
      token,
      role,
      expires_at: expiresAt,
      created_by: user.email,
      created_by_id: user.id,
    });
    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500, headers: corsHeaders });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://wedflow.live';
    const url = `${appUrl}/app/join-wedding?token=${encodeURIComponent(token)}`;

    return Response.json({ url, token, role, expires_at: expiresAt }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
