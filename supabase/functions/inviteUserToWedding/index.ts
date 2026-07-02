import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const { data: me } = await caller.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'event_manager')
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

  const { email, role = 'user', wedding_id, wedding_sides = [], max_guests = null } = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  await admin.from('profiles').update({ role, wedding_id, wedding_sides, max_guests, is_approved: true })
    .eq('id', invite.user.id);
  return Response.json({ invited: email }, { headers: corsHeaders });
});
