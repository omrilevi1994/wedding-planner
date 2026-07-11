import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Roles a shareable link may grant. Deliberately excludes 'owner' — a link can never hand
// out ownership, only collaborator-level access. Mirrors inviteUserToWedding's INVITABLE_ROLES.
const LINKABLE_ROLES = ['coplanner', 'family', 'event_manager'];
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (safety net; single-use is the real control)

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // --- Authenticate caller ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    // --- Parse + validate body ---
    const { wedding_id, role = 'coplanner', wedding_sides = [], max_guests = null } = await req.json();
    if (!wedding_id) {
      return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: cors });
    }
    // Sides/guest-quota only apply to (and are only ever stored for) the 'family' role —
    // matches inviteUserToWedding, where non-family roles always get unrestricted access.
    const linkWeddingSides = role === 'family' ? wedding_sides : [];
    const linkMaxGuests = role === 'family' ? max_guests : null;

    // --- Authorize: wedding owner (collaborator roles) or platform admin (any role) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    const { data: profile } = await service.from('profiles')
      .select('is_platform_admin').eq('id', user.id).maybeSingle();
    const isOwner = !!ownerMembership;
    const isPlatformAdmin = !!profile?.is_platform_admin;
    if (!isOwner && !isPlatformAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }
    // Only platform admins may mint owner-granting links (they transfer ownership on redeem).
    const allowedRoles = isPlatformAdmin ? ['owner', ...LINKABLE_ROLES] : LINKABLE_ROLES;
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: `role must be one of: ${allowedRoles.join(', ')}` }, { status: 400, headers: cors });
    }

    // --- Generate an unguessable token (two concatenated UUIDv4s: ~244 bits of entropy) ---
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    const { error: insertError } = await service.from('wedding_invite_links').insert({
      id: crypto.randomUUID(),
      wedding_id,
      token,
      role,
      wedding_sides: linkWeddingSides,
      max_guests: linkMaxGuests,
      expires_at: expiresAt,
      created_by: user.email,
      created_by_id: user.id,
    });
    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500, headers: cors });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://wedflow.live';
    const url = `${appUrl}/app/join-wedding?token=${encodeURIComponent(token)}`;

    return Response.json({ url, token, role, expires_at: expiresAt }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
