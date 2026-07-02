import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws; // Node < 22 has no native WebSocket
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// entity -> table, in dependency order
const ORDER = [
  ['Wedding','weddings'],
  ['Table','tables'],
  ['Guest','guests'],
  ['Expense','expenses'],
  ['Payment','payments'],
  ['Gift','gifts'],
  ['Vendor','vendors'],
  ['ChecklistGroup','checklist_groups'],
  ['ChecklistItem','checklist_items'],
  ['WeddingSetting','wedding_settings'],
  ['ActivityLog','activity_logs'],
];

// columns each table actually has (drop anything else from base44 payloads)
const COLS = {
  weddings: ['id','couple_names','wedding_date','venue','event_manager_name','reception_time','ceremony_time','budget_target','expected_guests','currency','cost_calc_mode','status','notes','created_date','updated_date','created_by','created_by_id','is_sample'],
  tables: ['id','wedding_id','name','capacity','iplan_number','shape','location_x','location_y','created_date','updated_date','created_by','created_by_id','is_sample'],
  guests: ['id','wedding_id','first_name','last_name','phone','side','relationship','status','total_people','confirmed_people','gift_amount','gift_received','notes','table_id','created_date','updated_date','created_by','created_by_id','is_sample'],
  expenses: ['id','wedding_id','vendor','category','amount','status','paid_by_party','payment_method','paid_date','due_date','has_deposit','deposit_amount','deposit_due_date','deposit_paid_date','deposit_status','probability','notes','receipt_url','created_date','updated_date','created_by','created_by_id','is_sample'],
  payments: ['id','wedding_id','expense_id','expense_vendor','amount','due_date','status','paid_date','paid_by','probability','notes','created_date','updated_date','created_by','created_by_id','is_sample'],
  gifts: ['id','wedding_id','guest_id','description','event','amount','notes','created_date','updated_date','created_by','created_by_id','is_sample'],
  vendors: ['id','wedding_id','name','contact_person','phone','email','category','estimated_cost','total_cost','contract_details','contract_file_url','notes','created_date','updated_date','created_by','created_by_id','is_sample'],
  checklist_groups: ['id','wedding_id','title','order','created_date','updated_date','created_by','created_by_id','is_sample'],
  checklist_items: ['id','wedding_id','title','group','completed','notes','order','image_url','created_date','updated_date','created_by','created_by_id','is_sample'],
  wedding_settings: ['id','wedding_id','wedding_date','venue','event_manager_name','reception_time','ceremony_time','budget_target','expected_guests','currency','cost_calc_mode','created_date','updated_date','created_by','created_by_id','is_sample'],
  activity_logs: ['id','wedding_id','user_email','user_name','action_type','entity_type','entity_id','entity_name','description','details','created_date','updated_date','created_by','created_by_id','is_sample'],
};

// base44 stores "" for unset date/number fields, which Postgres rejects.
// Coerce empty strings to null on the way in.
const clean = (v) => (v === '' ? null : v);
const pick = (row, cols) =>
  Object.fromEntries(cols.filter(c => c in row).map(c => [c, clean(row[c])]));

// FK columns to validate against already-imported parents; dangling refs (parent
// was hard/soft-deleted in base44) are nulled so the child row still imports.
const FKS = {
  guests: { table_id: 'tables' },
  payments: { expense_id: 'expenses' },
  gifts: { guest_id: 'guests' },
  checklist_items: { group: 'checklist_groups' },
};

const ids = {}; // table -> Set of imported ids

for (const [entity, table] of ORDER) {
  const raw = JSON.parse(await readFile(`.data-snapshots/${entity}.json`, 'utf8'));
  const rows = raw.map(r => pick(r, COLS[table]));
  if (rows.length === 0) { console.log(`${table}: 0`); continue; }

  // null dangling FK references
  let nulled = 0;
  for (const [col, parent] of Object.entries(FKS[table] || {})) {
    const valid = ids[parent] || new Set();
    for (const row of rows) {
      if (row[col] != null && !valid.has(row[col])) { row[col] = null; nulled++; }
    }
  }

  // chunk to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500));
    if (error) { console.error(`${table} error:`, error.message); process.exit(1); }
  }
  ids[table] = new Set(rows.map(r => r.id));
  console.log(`${table}: ${rows.length}${nulled ? ` (${nulled} dangling FK nulled)` : ''}`);
}
