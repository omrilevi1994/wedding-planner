import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // --- Authenticate caller (joining requires being signed in) ---
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
    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: 'token is required' }, { status: 400, headers: corsHeaders });
    }

    // --- Look up the link (service role bypasses RLS — this table has no select policy) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link, error: linkError } = await service.from('wedding_invite_links')
      .select('id, wedding_id, role, expires_at').eq('token', token).maybeSingle();
    if (linkError) {
      return Response.json({ error: linkError.message }, { status: 500, headers: corsHeaders });
    }
    if (!link) {
      return Response.json({ error: 'invalid_token', message: 'קישור ההזמנה אינו תקין' }, { status: 404, headers: corsHeaders });
    }
    if (new Date(link.expires_at).getTime() < Date.now()) {
      return Response.json({ error: 'expired_token', message: 'קישור ההזמנה פג תוקף' }, { status: 410, headers: corsHeaders });
    }

    // Defensive: a link can never grant ownership, regardless of what's stored.
    const role = link.role === 'owner' ? 'coplanner' : link.role;

    // --- Join as a member (multi-use link: many different users may each join once) ---
    const { data: existingMembership } = await service.from('wedding_members')
      .select('id, role').eq('wedding_id', link.wedding_id).eq('user_id', user.id).maybeSingle();

    if (!existingMembership) {
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id: link.wedding_id, user_id: user.id, role });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: corsHeaders });
      }
    }

    const { data: wedding } = await service.from('weddings')
      .select('couple_names').eq('id', link.wedding_id).maybeSingle();

    return Response.json({
      wedding_id: link.wedding_id,
      couple_names: wedding?.couple_names ?? null,
      role: existingMembership?.role ?? role,
      already_member: !!existingMembership,
    }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
