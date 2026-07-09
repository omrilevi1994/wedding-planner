import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // --- Authenticate caller (joining requires being signed in) ---
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
    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: 'token is required' }, { status: 400, headers: cors });
    }

    // --- Look up the link (service role bypasses RLS — this table has no select policy) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link, error: linkError } = await service.from('wedding_invite_links')
      .select('id, wedding_id, role, wedding_sides, max_guests, expires_at').eq('token', token).maybeSingle();
    if (linkError) {
      return Response.json({ error: linkError.message }, { status: 500, headers: cors });
    }
    if (!link) {
      return Response.json({ error: 'invalid_token', message: 'קישור ההזמנה אינו תקין' }, { status: 404, headers: cors });
    }
    if (new Date(link.expires_at).getTime() < Date.now()) {
      return Response.json({ error: 'expired_token', message: 'קישור ההזמנה פג תוקף' }, { status: 410, headers: cors });
    }

    // Defensive: a link can never grant ownership, regardless of what's stored.
    const role = link.role === 'owner' ? 'coplanner' : link.role;
    // Sides/guest-quota only make sense for (and are only ever set on) the 'family' role —
    // mirrors inviteUserToWedding, so a 'family' link restricts guest visibility the same way
    // a per-email 'family' invite does, instead of defaulting to unrestricted full access.
    const wedding_sides = role === 'family' ? (link.wedding_sides ?? []) : [];
    const max_guests = role === 'family' ? (link.max_guests ?? null) : null;

    // --- Join as a member (multi-use link: many different users may each join once) ---
    const { data: existingMembership } = await service.from('wedding_members')
      .select('id, role').eq('wedding_id', link.wedding_id).eq('user_id', user.id).maybeSingle();

    if (!existingMembership) {
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id: link.wedding_id, user_id: user.id, role, wedding_sides, max_guests });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: cors });
      }
    }

    const { data: wedding } = await service.from('weddings')
      .select('couple_names').eq('id', link.wedding_id).maybeSingle();

    return Response.json({
      wedding_id: link.wedding_id,
      couple_names: wedding?.couple_names ?? null,
      role: existingMembership?.role ?? role,
      already_member: !!existingMembership,
    }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
