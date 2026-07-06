import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    const { wedding_id } = await req.json();
    if (!wedding_id) {
      return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: corsHeaders });
    }

    // --- Authorize: any member of the wedding, or platform admin ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: membership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).maybeSingle();
    if (!membership) {
      const { data: profile } = await service.from('profiles')
        .select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
    }

    // --- Fetch members with profile info (service role bypasses profiles RLS) ---
    const { data, error } = await service.from('wedding_members')
      .select('id, role, wedding_sides, max_guests, user_id, profiles(full_name, email)')
      .eq('wedding_id', wedding_id)
      .order('created_date', { ascending: true });
    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
    return Response.json(data ?? [], { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
