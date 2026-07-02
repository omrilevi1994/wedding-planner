import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { newTableNames, tableUpdates, newGuests, wedding_id } = await req.json();

    // 1. Create all new tables in parallel
    const newTableIdMap = {};
    if (newTableNames && newTableNames.length > 0) {
      const createdTables = await Promise.all(
        newTableNames.map(tName =>
          base44.entities.Table.create({ wedding_id, name: tName, iplan_number: tName, capacity: 12 })
        )
      );
      for (let i = 0; i < newTableNames.length; i++) {
        newTableIdMap[`__new__${newTableNames[i]}`] = createdTables[i].id;
      }
    }

    const resolveTableId = (tid) => {
      if (!tid) return null;
      if (String(tid).startsWith('__new__')) return newTableIdMap[tid] || null;
      return tid;
    };

    // 2. Update existing guests table assignments + create new guests — all in parallel
    const updatePromises = (tableUpdates || []).map(upd =>
      base44.entities.Guest.update(upd.guestId, {
        table_id: resolveTableId(upd.table_id),
      })
    );

    const createPromises = (newGuests || []).map(ng =>
      base44.entities.Guest.create({
        wedding_id,
        first_name: ng.first_name,
        last_name: ng.last_name,
        phone: ng.phone || '',
        side: ng.side,
        relationship: ng.relationship,
        total_people: ng.total_people,
        table_id: resolveTableId(ng.table_id),
      })
    );

    await Promise.all([...updatePromises, ...createPromises]);

    return Response.json({
      tablesCreated: newTableNames?.length || 0,
      guestsUpdated: tableUpdates?.length || 0,
      guestsCreated: newGuests?.length || 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});