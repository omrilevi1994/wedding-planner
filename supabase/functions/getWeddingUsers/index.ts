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
  const { wedding_id } = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.from('profiles').select('*').eq('wedding_id', wedding_id);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json(data, { headers: corsHeaders });
});
