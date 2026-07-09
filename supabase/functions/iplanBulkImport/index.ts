import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const { newTableNames, tableUpdates, newGuests, wedding_id } = await req.json();

    // Bulk seating import is destructive; require an owner/coplanner role even though RLS
    // (0017) already blocks lower roles from writing tables/guests.
    const { data: membership } = await supabase
      .from('wedding_members').select('role').eq('wedding_id', wedding_id).eq('user_id', user.id).maybeSingle();
    if (!membership || !['owner', 'coplanner'].includes(membership.role))
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

    // 1. Create all new tables in parallel
    const newTableIdMap: Record<string, string> = {};
    if (newTableNames && newTableNames.length > 0) {
      const createdTables = await Promise.all(
        newTableNames.map((tName: string) =>
          supabase.from('tables')
            .insert({ wedding_id, name: tName, iplan_number: tName, capacity: 12 })
            .select().single()
        )
      );
      for (let i = 0; i < newTableNames.length; i++) {
        const { data, error } = createdTables[i];
        if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
        newTableIdMap[`__new__${newTableNames[i]}`] = data.id;
      }
    }

    const resolveTableId = (tid: string | null | undefined): string | null => {
      if (!tid) return null;
      if (String(tid).startsWith('__new__')) return newTableIdMap[tid] || null;
      return tid;
    };

    // 2. Update existing guests table assignments + create new guests — all in parallel
    const updatePromises = (tableUpdates || []).map((upd: { guestId: string; table_id: string }) =>
      supabase.from('guests')
        .update({ table_id: resolveTableId(upd.table_id) })
        .eq('id', upd.guestId)
    );

    const createPromises = (newGuests || []).map((ng: Record<string, unknown>) =>
      supabase.from('guests').insert({
        wedding_id,
        first_name: ng.first_name,
        last_name: ng.last_name,
        phone: ng.phone || '',
        side: ng.side,
        relationship: ng.relationship,
        total_people: ng.total_people,
        table_id: resolveTableId(ng.table_id as string | null | undefined),
      })
    );

    const results = await Promise.all([...updatePromises, ...createPromises]);
    for (const r of results) {
      if (r.error) return Response.json({ error: r.error.message }, { status: 400, headers: cors });
    }

    return Response.json({
      tablesCreated: newTableNames?.length || 0,
      guestsUpdated: tableUpdates?.length || 0,
      guestsCreated: newGuests?.length || 0,
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: cors });
  }
});
