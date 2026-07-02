import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const body = await req.json();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { updates } = body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return Response.json({ error: 'No updates provided' }, { status: 400 });
  }

  await base44.asServiceRole.entities.Guest.bulkUpdate(updates);

  return Response.json({ updated: updates.length });
});