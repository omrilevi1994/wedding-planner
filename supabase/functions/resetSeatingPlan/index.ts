import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { wedding_id } = await req.json();
  if (!wedding_id) return Response.json({ error: 'wedding_id required' }, { status: 400, headers: corsHeaders });
  // Clear table assignments, then delete tables for this wedding
  const { error: e1 } = await supabase.from('guests').update({ table_id: null }).eq('wedding_id', wedding_id);
  if (e1) return Response.json({ error: e1.message }, { status: 400, headers: corsHeaders });
  const { error: e2 } = await supabase.from('tables').delete().eq('wedding_id', wedding_id);
  if (e2) return Response.json({ error: e2.message }, { status: 400, headers: corsHeaders });

  // Re-create tables 1-25 (tables 13 & 16 seat 24, the rest 12) — matches the UI promise
  const newTables = Array.from({ length: 25 }, (_, i) => {
    const n = i + 1;
    return {
      wedding_id,
      name: `שולחן ${n}`,
      iplan_number: String(n),
      capacity: (n === 13 || n === 16) ? 24 : 12,
    };
  });
  const { error: e3 } = await supabase.from('tables').insert(newTables);
  if (e3) return Response.json({ error: e3.message }, { status: 400, headers: corsHeaders });

  return Response.json({ reset: true, tablesCreated: newTables.length }, { headers: corsHeaders });
});
