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
    const { data: profile } = await service.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
    const isPlatformAdmin = !!profile?.is_platform_admin;
    if (!ownerMembership && !isPlatformAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }

    // NOTE: token is deliberately NOT selected. created_by_id is selected only to filter
    // admin-created links below and is stripped from the response.
    const { data: rows, error } = await service.from('wedding_invite_links')
      .select('id, role, wedding_sides, max_guests, created_by, created_by_id, created_date, expires_at, used_at, used_by, revoked_at')
      .eq('wedding_id', wedding_id).order('created_date', { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });

    // Links created by a platform admin (e.g. ownership-transfer 'owner' links) are only visible
    // to platform admins — a wedding owner must not see them in their invite-links list.
    let visible = rows ?? [];
    if (!isPlatformAdmin && visible.length > 0) {
      const creatorIds = [...new Set(visible.map((l) => l.created_by_id).filter((id): id is string => !!id))];
      let adminCreatorIds = new Set<string>();
      if (creatorIds.length > 0) {
        const { data: adminProfiles } = await service.from('profiles')
          .select('id').in('id', creatorIds).eq('is_platform_admin', true);
        adminCreatorIds = new Set((adminProfiles ?? []).map((p) => p.id));
      }
      visible = visible.filter((l) => !l.created_by_id || !adminCreatorIds.has(l.created_by_id));
    }

    const links = visible.map(({ created_by_id: _omit, ...l }) => ({ ...l, status: statusOf(l) }));
    return Response.json({ links }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
