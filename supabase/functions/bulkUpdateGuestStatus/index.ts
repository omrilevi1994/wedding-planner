import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

  const { updates, wedding_id } = await req.json();
  if (!Array.isArray(updates) || updates.length === 0)
    return Response.json({ error: 'No updates provided' }, { status: 400, headers: cors });
  if (!wedding_id)
    return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: cors });

  // Only owner/coplanner may bulk-update guests (defense-in-depth alongside RLS 0017).
  const { data: membership } = await supabase
    .from('wedding_members').select('role').eq('wedding_id', wedding_id).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'coplanner'].includes(membership.role))
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

  // Whitelist to the columns this sync legitimately updates; require id (update-only, no inserts).
  const ALLOWED = ['phone', 'status', 'confirmed_people', 'total_people'];
  const clean = [];
  for (const u of updates) {
    if (!u || typeof u !== 'object' || !u.id)
      return Response.json({ error: 'each update needs an id' }, { status: 400, headers: cors });
    const row = { id: u.id };
    for (const k of ALLOWED) if (k in u) row[k] = u[k];
    clean.push(row);
  }

  try {
    const { error } = await supabase.from('guests').upsert(clean);
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
    return Response.json({ updated: clean.length }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
