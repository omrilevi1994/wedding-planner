import 'dotenv/config';
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws;
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, svc, { auth: { persistSession: false } });

const OWNER_EMAIL = 'omrilevi1994@gmail.com';
const KEEP_MATCH = 'דניאל';   // kept wedding: couple_names contains this
const DROP_MATCH = 'בר';      // sample wedding to delete

const { data: { users } } = await supabase.auth.admin.listUsers();
const idByEmail = Object.fromEntries(users.map(u => [u.email, u.id]));

const { data: weddings } = await supabase.from('weddings').select('id, couple_names');
const keep = weddings.find(w => (w.couple_names || '').includes(KEEP_MATCH));
const drop = weddings.find(w => (w.couple_names || '').includes(DROP_MATCH));
if (!keep) throw new Error('kept wedding not found');

if (drop) {
  await supabase.from('weddings').delete().eq('id', drop.id);
  console.log('deleted sample wedding:', drop.couple_names);
}

const ownerId = idByEmail[OWNER_EMAIL];
if (!ownerId) throw new Error(`owner auth user missing: ${OWNER_EMAIL}`);
await supabase.from('profiles').update({ is_platform_admin: true }).eq('id', ownerId);
await supabase.from('weddings').update({ owner_id: ownerId }).eq('id', keep.id);
await supabase.from('wedding_members').upsert(
  { wedding_id: keep.id, user_id: ownerId, role: 'owner' },
  { onConflict: 'wedding_id,user_id' });
console.log('owner set:', OWNER_EMAIL);

const snap = JSON.parse(await readFile('.data-snapshots/User.json', 'utf8'));
for (const u of snap) {
  const uid = idByEmail[u.email];
  if (!uid || uid === ownerId) continue;
  if (u.wedding_id !== keep.id) continue;
  const role = u.role === 'event_manager' ? 'event_manager'
             : u.role === 'admin' ? 'coplanner' : 'family';
  await supabase.from('wedding_members').upsert({
    wedding_id: keep.id, user_id: uid, role,
    wedding_sides: u.wedding_sides || [], max_guests: u.max_guests ?? null,
  }, { onConflict: 'wedding_id,user_id' });
  console.log(`member: ${u.email} -> ${role}`);
}
console.log('backfill done');
