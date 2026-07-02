import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runInBatches(items, fn, batchSize = 5, delayMs = 300) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    if (i + batchSize < items.length) await sleep(delayMs);
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wedding_id = body.wedding_id;

  // Clear all guests' table_id (scoped to wedding if provided)
  const guests = wedding_id
    ? await base44.entities.Guest.filter({ wedding_id })
    : await base44.entities.Guest.list();
  const assignedGuests = guests.filter(g => g.table_id);
  await runInBatches(assignedGuests, (g) => base44.entities.Guest.update(g.id, { table_id: null }));

  // Delete all existing tables (scoped to wedding if provided)
  const tables = wedding_id
    ? await base44.entities.Table.filter({ wedding_id })
    : await base44.entities.Table.list();
  await runInBatches(tables, (t) => base44.entities.Table.delete(t.id));

  // Create tables 1-25
  const tableDefs = Array.from({ length: 25 }, (_, i) => {
    const num = i + 1;
    const capacity = (num === 13 || num === 16) ? 24 : 12;
    const shape = (num === 13 || num === 16) ? 'long' : 'circle';
    return { wedding_id, name: `שולחן ${num}`, iplan_number: String(num), capacity, shape, location_x: 0, location_y: 0 };
  });
  await runInBatches(tableDefs, (t) => base44.entities.Table.create(t));

  return Response.json({ success: true });
});