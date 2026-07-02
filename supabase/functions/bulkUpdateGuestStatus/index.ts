import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { updates } = await req.json();
  if (!Array.isArray(updates) || updates.length === 0)
    return Response.json({ error: 'No updates provided' }, { status: 400, headers: corsHeaders });

  const { error } = await supabase.from('guests').upsert(updates);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json({ updated: updates.length }, { headers: corsHeaders });
});
