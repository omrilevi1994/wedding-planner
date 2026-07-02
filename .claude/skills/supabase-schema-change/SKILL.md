---
name: supabase-schema-change
description: "Add or alter an entity/table in the Supabase-backed wedding-planner (table + RLS + grants + shim + test). Use when adding a field or a new entity."
---

# Supabase schema change

Use this when adding a column to an existing table, or introducing a brand-new
entity/table, in the Supabase-backed wedding planner. Follow the conventions
already established by migrations `0001`–`0004`.

## Conventions to preserve

Every domain table carries the base44-compatible **system columns**:

```sql
id           text primary key default gen_random_uuid()::text,
-- ...domain columns...
wedding_id   text references weddings(id) on delete cascade,  -- scoped tables
created_date timestamptz default now(),
updated_date timestamptz default now(),
created_by   text,
created_by_id text,
is_sample    boolean default false
```

RLS helpers (defined in `0002_rls.sql`, already available):
`auth_role()`, `auth_wedding_id()`, `is_admin()`.

## Steps

### 1. Create a new numbered migration

Add the next file in `supabase/migrations/` (existing: `0001_schema.sql`,
`0002_rls.sql`, `0003_storage.sql`, `0004_grants.sql`). Name it e.g.
`0005_add_seatings.sql`.

**Altering an existing table** — add the column only:

```sql
alter table guests add column dietary_notes text;
```

**Adding a new entity** — full table + index + RLS + grants:

```sql
-- supabase/migrations/0005_add_seatings.sql

create table seatings (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  name text not null,
  -- ...domain columns...
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

-- index on wedding_id (all scoped queries filter by it)
create index seatings_wedding_id_idx on seatings (wedding_id);

-- keep updated_date fresh (trigger fn defined in 0001)
create trigger seatings_set_updated_date
  before update on seatings
  for each row execute function set_updated_date();

-- enable RLS + wedding-scoped policy with admin bypass
alter table seatings enable row level security;

create policy seatings_scoped on seatings for all
  using (is_admin() or wedding_id = auth_wedding_id())
  with check (is_admin() or wedding_id = auth_wedding_id());

-- grant to the API roles (RLS is the gate; service_role bypasses it)
grant all on seatings to anon, authenticated, service_role;
```

The default privileges from `0004_grants.sql` cover future objects, but grant
explicitly in the same migration so a fresh `db reset` is order-independent.

### 2. If a new entity, register it in the shim and importer

The shim (`src/api/base44Client.js`) is a generic Proxy over `TABLE_MAP`, so the
only shim change needed is the map entry.

Add to `TABLE_MAP` in `src/api/entities-config.js`:

```js
export const TABLE_MAP = {
  // ...existing...
  Seating: 'seatings',
};
```

Add to both `ORDER` and `COLS` in `scripts/import-to-supabase.mjs`
(place in `ORDER` after its FK parents so foreign keys resolve):

```js
const ORDER = [
  // ...existing...
  ['Seating', 'seatings'],
];

const COLS = {
  // ...existing...
  seatings: ['id','wedding_id','name','created_date','updated_date','created_by','created_by_id','is_sample'],
};
```

If the new entity references another table, add a `FKS` entry too so dangling
refs are nulled on import.

### 3. Reset the local database

```bash
npx supabase db reset
```

This replays every migration against the local stack.

### 4. Add an integration test

Create a test in `tests/integration/` (see `crud.test.js` for the pattern; it
uses the `admin` client and `makeWedding()` from `./setup.js`):

```js
// tests/integration/seatings.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, makeWedding } from './setup.js';

let weddingId;
beforeAll(async () => { weddingId = (await makeWedding()).id; });

describe('seatings CRUD', () => {
  it('creates and reads a seating with a preserved id', async () => {
    const { data: created } = await admin.from('seatings')
      .insert({ id: 'test-seating-1', wedding_id: weddingId, name: 'Head table' })
      .select().single();
    expect(created.id).toBe('test-seating-1');
  });
});

describe('RLS', () => {
  it('anon cannot read seatings', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data } = await anon.from('seatings').select('*').limit(1);
    expect(data?.length ?? 0).toBe(0); // RLS blocks unauthenticated reads
  });
});
```

### 5. Run the integration tests

```bash
npm run test:int
```

## Checklist

- [ ] New numbered migration in `supabase/migrations/`
- [ ] System columns present (id/created_date/updated_date/created_by/created_by_id/is_sample)
- [ ] `create index ..._wedding_id_idx` on `wedding_id`
- [ ] RLS enabled + wedding-scoped policy with `is_admin()` bypass
- [ ] `grant all ... to anon, authenticated, service_role`
- [ ] (new entity) `TABLE_MAP` in `src/api/entities-config.js`
- [ ] (new entity) `ORDER` + `COLS` in `scripts/import-to-supabase.mjs`
- [ ] `npx supabase db reset` succeeds
- [ ] Integration test in `tests/integration/`
- [ ] `npm run test:int` passes
