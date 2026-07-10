import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Owner/platform-admin lists a wedding's invite links WITHOUT the token (tokens are only ever
// returned once, at creation). Returns a derived status per link.
function statusOf(l: { used_at: string | null; revoked_at: string | null; expires_at: string }): string {
  if (l.revoked_at) return 'revoked';
  if (l.used_at) return 'used';
  if (new Date(l.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

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

    const { wedding_id } = await req.json();
    if (!wedding_id) return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: cors });

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Authorize: wedding owner or platform admin.
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }

    // NOTE: token is deliberately NOT selected.
    const { data: rows, error } = await service.from('wedding_invite_links')
      .select('id, role, wedding_sides, max_guests, created_by, created_date, expires_at, used_at, used_by, revoked_at')
      .eq('wedding_id', wedding_id).order('created_date', { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });

    const links = (rows ?? []).map((l) => ({ ...l, status: statusOf(l) }));
    return Response.json({ links }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
