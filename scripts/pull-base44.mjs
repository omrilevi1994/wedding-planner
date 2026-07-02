import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = process.env.BASE44_API_URL;
const KEY = process.env.BASE44_API_KEY;
const ENTITIES = ['Wedding','Guest','Table','Expense','Payment','Gift','Vendor',
  'ChecklistGroup','ChecklistItem','WeddingSetting','ActivityLog','User'];

async function pull(entity) {
  const all = [];
  let skip = 0; const limit = 100;
  while (true) {
    const res = await fetch(`${BASE}/entities/${entity}?limit=${limit}&skip=${skip}`,
      { headers: { api_key: KEY } });
    if (!res.ok) throw new Error(`${entity} ${res.status}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
}

await mkdir('.data-snapshots', { recursive: true });
for (const e of ENTITIES) {
  const rows = await pull(e);
  await writeFile(`.data-snapshots/${e}.json`, JSON.stringify(rows, null, 2));
  console.log(`${e}: ${rows.length}`);
}
