// ONE-TIME storage path migration. Run ONCE against the target (cloud) database AFTER
// deploying migration 0016 and the client changes, with service-role env loaded:
//   node scripts/migrate-storage-paths.mjs
// Idempotent: re-running skips rows already holding a "<wedding_id>/<file>" path.
// Orphaned (unreferenced) root objects are logged, never deleted.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BUCKET = 'uploads';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

const TARGETS = [
  { table: 'expenses', col: 'receipt_url' },
  { table: 'vendors', col: 'contract_file_url' },
  { table: 'checklist_items', col: 'image_url' },
];

function flatPathFromUrl(value) {
  const i = value.indexOf(PUBLIC_MARKER);
  if (i === -1) return null; // already a path, or not an uploads URL
  return decodeURIComponent(value.slice(i + PUBLIC_MARKER.length));
}

const referenced = new Set();
let moved = 0, skipped = 0;

for (const { table, col } of TARGETS) {
  const { data, error } = await admin.from(table).select(`id, wedding_id, ${col}`);
  if (error) throw error;
  for (const row of data) {
    const value = row[col];
    if (!value) { skipped++; continue; }
    const flat = flatPathFromUrl(value);
    if (!flat) { referenced.add(value); skipped++; continue; }      // already migrated (a path)
    if (flat.includes('/')) { referenced.add(flat); skipped++; continue; } // already foldered
    const newPath = `${row.wedding_id}/${flat}`;
    const mv = await admin.storage.from(BUCKET).move(flat, newPath);
    if (mv.error && !/exists|not found/i.test(mv.error.message)) throw mv.error;
    const up = await admin.from(table).update({ [col]: newPath }).eq('id', row.id);
    if (up.error) throw up.error;
    referenced.add(newPath);
    moved++;
    console.log(`moved ${flat} -> ${newPath}`);
  }
}

// Report unreferenced (orphaned) objects at the bucket root — logged, NOT deleted.
const { data: rootObjs } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
const orphans = (rootObjs ?? []).filter((o) => o.id && !referenced.has(o.name));
for (const o of orphans) console.warn(`ORPHAN (left in place): ${o.name}`);

console.log(`done: moved=${moved} skipped=${skipped} orphans=${orphans.length}`);
