import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Owner/platform-admin revokes a pending invite link by id (soft: sets revoked_at).
// Mirrors createWeddingInviteLink's authorization shape.
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const { id } = await req.json();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400, headers: cors });

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link } = await service.from('wedding_invite_links')
      .select('id, wedding_id, used_at, revoked_at').eq('id', id).maybeSingle();
    if (!link) return Response.json({ error: 'not_found' }, { status: 404, headers: cors });

    // Authorize: wedding owner or platform admin.
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', link.wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }

    if (link.used_at) return Response.json({ revoked: false, reason: 'already_used' }, { headers: cors });
    if (link.revoked_at) return Response.json({ revoked: false, reason: 'already_revoked' }, { headers: cors });

    const { error: updErr } = await service.from('wedding_invite_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id).is('used_at', null).is('revoked_at', null);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500, headers: cors });

    return Response.json({ revoked: true }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
