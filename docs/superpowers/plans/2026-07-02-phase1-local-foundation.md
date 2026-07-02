# Phase 1: Local Foundation (base44 → Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the wedding-planner app running entirely on a **local Supabase** (Docker) with the real base44 data imported, behind a compatibility shim, fully tested — no cloud credentials required.

**Architecture:** Rewrite only `src/api/base44Client.js` into a shim that mimics the base44 SDK surface on top of `@supabase/supabase-js`. A single SQL migration defines 12 tables + `profiles` with base44-compatible columns (`id text`, `created_date`, `created_by`, `created_by_id`, `is_sample`). RLS policies translate base44's rules. Node scripts pull data from the base44 REST API and import it into local Supabase, preserving IDs. Edge functions (Deno) replace base44 backend functions.

**Tech Stack:** Vite/React (existing), Supabase CLI + local stack (Docker), `@supabase/supabase-js`, Deno edge functions, Vitest (unit + integration), Playwright (smoke).

**Reference spec:** `docs/superpowers/specs/2026-07-02-base44-to-supabase-migration-design.md`

---

## File Structure

**Create:**
- `supabase/config.toml` — CLI-generated
- `supabase/migrations/0001_schema.sql` — 12 tables + profiles + indexes + updated_date trigger
- `supabase/migrations/0002_rls.sql` — RLS policies + helper functions
- `supabase/functions/bulkUpdateGuestStatus/index.ts`
- `supabase/functions/resetSeatingPlan/index.ts`
- `supabase/functions/iplanBulkImport/index.ts`
- `supabase/functions/inviteUserToWedding/index.ts`
- `supabase/functions/getWeddingUsers/index.ts`
- `supabase/functions/extractGuestData/index.ts`
- `supabase/functions/_shared/cors.ts`
- `src/lib/supabaseClient.js` — the raw Supabase client
- `src/api/entities-config.js` — entity name → table name map + numeric field coercion
- `src/api/base44Client.js` — REWRITE: the compatibility shim
- `scripts/pull-base44.mjs` — pull all entities from base44 REST → `.data-snapshots/*.json`
- `scripts/import-to-supabase.mjs` — load snapshots into Supabase (service role)
- `tests/unit/shim.test.js` — shim sort/filter parsing unit tests
- `tests/integration/crud.test.js` — CRUD + RLS against local Supabase
- `tests/integration/setup.js` — integration test harness (service-role client, seed/reset)
- `vitest.config.js`
- `.env.example`

(E2E Playwright smoke + GitHub Actions CI are deferred to the Phase 2 plan — they
need a deployed URL and real auth users to be meaningful.)

**Modify:**
- `.gitignore` — add `.env`, `.data-snapshots/`, `test-results/`
- `package.json` — add deps + scripts
- `src/pages/Guests.jsx` — repoint the AI-extract call (Task 12)

---

## Task 0: Tooling, deps, env scaffolding

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd /Users/omrilevi/Documents/straight-wedding-plan-pro
npm install @supabase/supabase-js
npm install -D supabase vitest dotenv
```
Expected: installs succeed; `npx supabase --version` prints a version.

- [ ] **Step 2: Add npm scripts**

In `package.json` `"scripts"`, add:
```json
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",
"functions:serve": "supabase functions serve --no-verify-jwt",
"data:pull": "node scripts/pull-base44.mjs",
"data:import": "node scripts/import-to-supabase.mjs",
"test:unit": "vitest run tests/unit",
"test:int": "vitest run tests/integration"
```

- [ ] **Step 3: Create `.env.example`**

```bash
# --- base44 (source of data) ---
BASE44_API_URL=https://straight-wedding-plan-pro.base44.app/api
BASE44_API_KEY=replace_me

# --- Supabase (local defaults printed by `supabase start`) ---
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=replace_with_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=replace_with_local_service_role_key

# --- Anthropic (only needed for extractGuestData) ---
ANTHROPIC_API_KEY=replace_me
```

- [ ] **Step 4: Update `.gitignore`**

Append:
```
.env
.data-snapshots/
test-results/
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 5: Initialize Supabase project**

Run:
```bash
npx supabase init
```
Expected: creates `supabase/config.toml`. Answer "N" if asked to generate VS Code settings.

- [ ] **Step 6: Start local Supabase and capture keys**

Run:
```bash
npx supabase start
```
Expected: prints `API URL`, `anon key`, `service_role key`. Copy `.env.example` → `.env` and paste the printed `anon key` and `service_role key`, and the base44 key `d0254da0a4804923baf40e4c021e97dc`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example supabase/config.toml
git commit -m "chore: add supabase local stack, test tooling, env scaffolding"
```

---

## Task 1: Database schema

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

- [ ] **Step 1: Write the schema migration**

Create `supabase/migrations/0001_schema.sql`. Every table uses base44-compatible
columns. `id text primary key` preserves base44 IDs. `updated_date` is maintained
by a trigger.

```sql
-- Shared updated_date trigger
create or replace function set_updated_date()
returns trigger language plpgsql as $$
begin new.updated_date = now(); return new; end; $$;

-- System columns macro is inlined per table (id/created_date/updated_date/created_by/created_by_id/is_sample)

create table weddings (
  id text primary key default gen_random_uuid()::text,
  couple_names text not null,
  wedding_date date,
  venue text,
  event_manager_name text,
  reception_time text,
  ceremony_time text,
  budget_target numeric,
  expected_guests numeric,
  currency text default '₪',
  cost_calc_mode text default 'confirmed',
  status text default 'active',
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'user',        -- admin | user | event_manager
  wedding_id text references weddings(id) on delete set null,
  wedding_sides text[] default '{}',
  max_guests int,
  is_approved boolean default false,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table tables (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  name text not null,
  capacity numeric not null,
  iplan_number text,
  shape text,
  location_x numeric,
  location_y numeric,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table guests (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  side text not null,
  relationship text,
  status text,
  total_people numeric default 1,
  confirmed_people numeric,
  gift_amount numeric,
  gift_received boolean default false,
  notes text,
  table_id text references tables(id) on delete set null,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table expenses (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric not null,
  status text not null,
  paid_by_party text,
  payment_method text,
  paid_date date,
  due_date date,
  has_deposit boolean,
  deposit_amount numeric,
  deposit_due_date date,
  deposit_paid_date date,
  deposit_status text,
  probability numeric,
  notes text,
  receipt_url text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table payments (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  expense_id text references expenses(id) on delete cascade,
  expense_vendor text,
  amount numeric not null,
  due_date date,
  status text,
  paid_date date,
  paid_by text,
  probability numeric,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table gifts (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  guest_id text references guests(id) on delete set null,
  description text not null,
  event text,
  amount numeric,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table vendors (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  category text not null,
  estimated_cost numeric,
  total_cost numeric,
  contract_details text,
  contract_file_url text,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table checklist_groups (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  title text not null,
  "order" numeric not null,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table checklist_items (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  title text not null,
  "group" text references checklist_groups(id) on delete set null,
  completed boolean default false,
  notes text,
  "order" numeric,
  image_url text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table wedding_settings (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  wedding_date date,
  venue text,
  event_manager_name text,
  reception_time text,
  ceremony_time text,
  budget_target numeric,
  expected_guests numeric,
  currency text,
  cost_calc_mode text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table activity_logs (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  user_email text,
  user_name text,
  action_type text,
  entity_type text,
  entity_id text,
  entity_name text,
  description text,
  details text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

-- updated_date triggers
do $$
declare t text;
begin
  foreach t in array array['weddings','profiles','tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_date();', t);
  end loop;
end $$;

-- Indexes on hot filter columns
create index idx_guests_wedding on guests(wedding_id);
create index idx_guests_table on guests(table_id);
create index idx_guests_status on guests(status);
create index idx_tables_wedding on tables(wedding_id);
create index idx_expenses_wedding on expenses(wedding_id);
create index idx_payments_wedding on payments(wedding_id);
create index idx_payments_expense on payments(expense_id);
create index idx_gifts_wedding on gifts(wedding_id);
create index idx_vendors_wedding on vendors(wedding_id);
create index idx_cgroups_wedding on checklist_groups(wedding_id);
create index idx_citems_wedding on checklist_items(wedding_id);
create index idx_citems_group on checklist_items("group");
create index idx_settings_wedding on wedding_settings(wedding_id);
create index idx_alogs_wedding on activity_logs(wedding_id);
create index idx_profiles_wedding on profiles(wedding_id);

-- Auto-create a profile row when an auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
```

- [ ] **Step 2: Apply and verify the schema**

Run:
```bash
npx supabase db reset
```
Expected: migration applies with no errors; ends with "Finished supabase db reset".

- [ ] **Step 3: Verify tables exist**

Run:
```bash
npx supabase db reset >/dev/null 2>&1 && \
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"select count(*) from information_schema.tables where table_schema='public';"
```
Expected: count = 12.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat(db): schema for 12 entities + profiles, indexes, triggers"
```

---

## Task 2: RLS policies

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

Base44 rules: wedding-scoped read/write when `profiles.wedding_id` matches the
row's `wedding_id`, plus full admin bypass. `weddings` is readable by all
authenticated users but writable only by admins.

- [ ] **Step 1: Write the RLS migration**

```sql
-- Helpers (security definer to read profiles without recursive RLS)
create or replace function auth_role() returns text
language sql stable security definer set search_path=public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function auth_wedding_id() returns text
language sql stable security definer set search_path=public as $$
  select wedding_id from profiles where id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable as $$ select auth_role() = 'admin'; $$;

-- Enable RLS on all tables
do $$
declare t text;
begin
  foreach t in array array['weddings','profiles','tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop execute format('alter table %I enable row level security;', t); end loop;
end $$;

-- weddings: read = any authenticated; write = admin only
create policy weddings_read on weddings for select using (auth.uid() is not null);
create policy weddings_admin_write on weddings for all
  using (is_admin()) with check (is_admin());

-- profiles: user reads/updates own row; admin all
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_admin());
create policy profiles_admin_write on profiles for all
  using (is_admin()) with check (is_admin());

-- wedding-scoped tables: same policy shape for each
do $$
declare t text;
begin
  foreach t in array array['tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format($f$
      create policy %1$s_scoped on %1$s for all
      using (is_admin() or wedding_id = auth_wedding_id())
      with check (is_admin() or wedding_id = auth_wedding_id());
    $f$, t);
  end loop;
end $$;
```

- [ ] **Step 2: Apply and verify RLS enabled**

Run:
```bash
npx supabase db reset >/dev/null 2>&1 && \
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"select count(*) from pg_tables where schemaname='public' and rowsecurity=true;"
```
Expected: count = 12.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat(db): RLS policies (wedding-scoped + admin bypass)"
```

---

## Task 3: Supabase client + entity config

**Files:**
- Create: `src/lib/supabaseClient.js`, `src/api/entities-config.js`

- [ ] **Step 1: Create the raw client**

`src/lib/supabaseClient.js`:
```javascript
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

- [ ] **Step 2: Create entity → table map + numeric fields**

`src/api/entities-config.js`:
```javascript
// Maps base44 entity names to Postgres table names
export const TABLE_MAP = {
  Wedding: 'weddings',
  Guest: 'guests',
  Table: 'tables',
  Expense: 'expenses',
  Payment: 'payments',
  Gift: 'gifts',
  Vendor: 'vendors',
  ChecklistGroup: 'checklist_groups',
  ChecklistItem: 'checklist_items',
  WeddingSetting: 'wedding_settings',
  ActivityLog: 'activity_logs',
  User: 'profiles',
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabaseClient.js src/api/entities-config.js
git commit -m "feat(api): supabase client + entity table map"
```

---

## Task 4: Compatibility shim — sort/filter parsing (TDD)

**Files:**
- Create: `src/api/base44Client.js` (partial — helpers), `tests/unit/shim.test.js`, `vitest.config.js`

- [ ] **Step 1: Write vitest config**

`vitest.config.js`:
```javascript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 2: Write the failing unit test**

`tests/unit/shim.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { parseSort } from '@/api/base44Client';

describe('parseSort', () => {
  it('ascending by default', () => {
    expect(parseSort('name')).toEqual({ column: 'name', ascending: true });
  });
  it('descending with leading dash', () => {
    expect(parseSort('-created_date')).toEqual({ column: 'created_date', ascending: false });
  });
  it('returns null for empty', () => {
    expect(parseSort(undefined)).toBeNull();
  });
});
```

Add path alias to `vitest.config.js`:
```javascript
import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:unit`
Expected: FAIL — `parseSort` not exported.

- [ ] **Step 4: Implement `parseSort` in the shim skeleton**

Create `src/api/base44Client.js` (this file grows in later tasks):
```javascript
import { supabase } from '@/lib/supabaseClient';
import { TABLE_MAP } from '@/api/entities-config';

// base44 sort strings: 'field' asc, '-field' desc
export function parseSort(sortBy) {
  if (!sortBy) return null;
  const ascending = !sortBy.startsWith('-');
  const column = ascending ? sortBy : sortBy.slice(1);
  return { column, ascending };
}
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:unit`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/base44Client.js tests/unit/shim.test.js vitest.config.js
git commit -m "feat(shim): parseSort with base44 sort-string semantics + test"
```

---

## Task 5: Compatibility shim — entities CRUD

**Files:**
- Modify: `src/api/base44Client.js`

- [ ] **Step 1: Implement the entities proxy**

Append to `src/api/base44Client.js`:
```javascript
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function entityApi(entityName) {
  const table = TABLE_MAP[entityName];
  return {
    async list(sortBy) {
      let q = supabase.from(table).select('*');
      const s = parseSort(sortBy);
      if (s) q = q.order(s.column, { ascending: s.ascending });
      return unwrap(await q);
    },
    async filter(query = {}, sortBy) {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(query)) q = q.eq(k, v);
      const s = parseSort(sortBy);
      if (s) q = q.order(s.column, { ascending: s.ascending });
      return unwrap(await q);
    },
    async get(id) {
      return unwrap(await supabase.from(table).select('*').eq('id', id).single());
    },
    async create(data) {
      return unwrap(await supabase.from(table).insert(data).select().single());
    },
    async update(id, data) {
      return unwrap(await supabase.from(table).update(data).eq('id', id).select().single());
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
    async bulkCreate(rows) {
      return unwrap(await supabase.from(table).insert(rows).select());
    },
    async bulkUpdate(updates) {
      // updates: [{id, ...fields}] — upsert on primary key
      return unwrap(await supabase.from(table).upsert(updates).select());
    },
  };
}

const entities = new Proxy({}, {
  get: (_t, name) => entityApi(String(name)),
});
```

- [ ] **Step 2: Add an integration test for CRUD**

(Covered fully in Task 10 against local Supabase; no separate unit test here since
CRUD requires a live DB. Proceed.)

- [ ] **Step 3: Commit**

```bash
git add src/api/base44Client.js
git commit -m "feat(shim): entities CRUD/list/filter/bulk backed by supabase"
```

---

## Task 6: Compatibility shim — auth, storage, functions, integrations

**Files:**
- Modify: `src/api/base44Client.js`

- [ ] **Step 1: Implement auth backed by Supabase + profiles**

Append:
```javascript
const auth = {
  // Returns the base44-shaped user: merged auth user + profile fields
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single();
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? user.email,
      role: profile?.role ?? 'user',
      wedding_id: profile?.wedding_id ?? null,
      wedding_sides: profile?.wedding_sides ?? [],
      max_guests: profile?.max_guests ?? null,
      is_approved: profile?.is_approved ?? false,
    };
  },
  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  },
  async logout() {
    await supabase.auth.signOut();
  },
  redirectToLogin() {
    window.location.href = '/login';
  },
};
```

- [ ] **Step 2: Implement storage, functions, integrations, appLogs, users**

Append:
```javascript
const BUCKET = 'uploads';

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const path = `${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
    async ExtractDataFromUploadedFile(payload) {
      const { data, error } = await supabase.functions.invoke('extractGuestData', { body: payload });
      if (error) throw error;
      return data;
    },
  },
};

const functions = {
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  },
};

const appLogs = { logUserInApp: async () => {} }; // no-op

const users = {
  async inviteUser(payload) {
    const { data, error } = await supabase.functions.invoke('inviteUserToWedding', { body: payload });
    if (error) throw error;
    return data;
  },
};

export const base44 = { entities, auth, integrations, functions, appLogs, users };
export default base44;
```

- [ ] **Step 3: Add the storage bucket migration**

Create `supabase/migrations/0003_storage.sql`:
```sql
insert into storage.buckets (id, name, public) values ('uploads','uploads', true)
on conflict (id) do nothing;

create policy "auth upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads');
create policy "public read uploads" on storage.objects for select
  using (bucket_id = 'uploads');
```

- [ ] **Step 4: Apply and verify build**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
npm run test:unit
npm run build
```
Expected: unit tests PASS; Vite build succeeds (shim compiles).

- [ ] **Step 5: Commit**

```bash
git add src/api/base44Client.js supabase/migrations/0003_storage.sql
git commit -m "feat(shim): auth, storage, functions, integrations; uploads bucket"
```

---

## Task 7: Edge functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts` and the 6 function `index.ts` files

- [ ] **Step 1: Shared CORS helper**

`supabase/functions/_shared/cors.ts`:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

- [ ] **Step 2: `bulkUpdateGuestStatus` (port)**

`supabase/functions/bulkUpdateGuestStatus/index.ts`:
```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { updates } = await req.json();
  if (!Array.isArray(updates) || updates.length === 0)
    return Response.json({ error: 'No updates provided' }, { status: 400, headers: corsHeaders });

  const { error } = await supabase.from('guests').upsert(updates);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json({ updated: updates.length }, { headers: corsHeaders });
});
```

- [ ] **Step 3: `resetSeatingPlan` (port)**

`supabase/functions/resetSeatingPlan/index.ts`:
```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { wedding_id } = await req.json();
  if (!wedding_id) return Response.json({ error: 'wedding_id required' }, { status: 400, headers: corsHeaders });
  // Clear table assignments, then delete tables for this wedding
  const { error: e1 } = await supabase.from('guests').update({ table_id: null }).eq('wedding_id', wedding_id);
  if (e1) return Response.json({ error: e1.message }, { status: 400, headers: corsHeaders });
  const { error: e2 } = await supabase.from('tables').delete().eq('wedding_id', wedding_id);
  if (e2) return Response.json({ error: e2.message }, { status: 400, headers: corsHeaders });
  return Response.json({ reset: true }, { headers: corsHeaders });
});
```

- [ ] **Step 4: `iplanBulkImport` (port — mirrors local base44 source)**

`supabase/functions/iplanBulkImport/index.ts`:
```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { guests } = await req.json();  // array of guest rows to insert
  if (!Array.isArray(guests)) return Response.json({ error: 'guests[] required' }, { status: 400, headers: corsHeaders });
  const { data, error } = await supabase.from('guests').insert(guests).select();
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json({ imported: data.length }, { headers: corsHeaders });
});
```

> Before finalizing behavior, cross-check against `base44/functions/iplanBulkImport/entry.ts` in the repo (it exists) and mirror its exact field handling.

- [ ] **Step 5: `inviteUserToWedding` (reimplement, admin-only)**

`supabase/functions/inviteUserToWedding/index.ts`:
```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const { data: me } = await caller.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'event_manager')
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

  const { email, role = 'user', wedding_id, wedding_sides = [], max_guests = null } = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  await admin.from('profiles').update({ role, wedding_id, wedding_sides, max_guests, is_approved: true })
    .eq('id', invite.user.id);
  return Response.json({ invited: email }, { headers: corsHeaders });
});
```

- [ ] **Step 6: `getWeddingUsers` (reimplement)**

`supabase/functions/getWeddingUsers/index.ts`:
```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization')!;
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  const { wedding_id } = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.from('profiles').select('*').eq('wedding_id', wedding_id);
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json(data, { headers: corsHeaders });
});
```

- [ ] **Step 7: `extractGuestData` (Claude)**

`supabase/functions/extractGuestData/index.ts`:
```typescript
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const { file_url, text } = await req.json();
  const prompt = `Extract wedding guests from the following data as a JSON array of
objects with keys first_name, last_name, phone, side, total_people. Return ONLY JSON.\n\n${text ?? file_url}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await resp.json();
  const textOut = json.content?.[0]?.text ?? '[]';
  let rows = [];
  try { rows = JSON.parse(textOut); } catch { rows = []; }
  return Response.json({ output: rows }, { headers: corsHeaders });
});
```

- [ ] **Step 8: Serve functions and smoke-invoke one**

Run (in a second terminal): `npm run functions:serve`
Then:
```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/extractGuestData \
  -H "Content-Type: application/json" \
  -d '{"text":"John Doe 050-1234567 חתן 2"}'
```
Expected: JSON `{ "output": [ ... ] }` (requires `ANTHROPIC_API_KEY` set in `supabase/.env`; if unset, expect an auth error from Anthropic — acceptable at this step).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions
git commit -m "feat(functions): port 3 base44 fns, add invite/getUsers/extractGuestData"
```

---

## Task 8: Pull data from base44

**Files:**
- Create: `scripts/pull-base44.mjs`

- [ ] **Step 1: Write the pull script**

`scripts/pull-base44.mjs`:
```javascript
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
```

- [ ] **Step 2: Run the pull**

Run: `npm run data:pull`
Expected: prints counts matching the spec (Guest: 352, etc.); files appear in `.data-snapshots/`.

- [ ] **Step 3: Commit (script only — snapshots are git-ignored)**

```bash
git add scripts/pull-base44.mjs
git commit -m "feat(data): base44 REST pull script"
```

---

## Task 9: Import data into local Supabase

**Files:**
- Create: `scripts/import-to-supabase.mjs`

- [ ] **Step 1: Write the import script**

Insert parents before children; map `User` → `profiles` (without auth linkage for
now — profiles get linked to auth users at cloud go-live). Drop base44-only fields
not in our schema.

`scripts/import-to-supabase.mjs`:
```javascript
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
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

const pick = (row, cols) => Object.fromEntries(cols.filter(c => c in row).map(c => [c, row[c]]));

for (const [entity, table] of ORDER) {
  const raw = JSON.parse(await readFile(`.data-snapshots/${entity}.json`, 'utf8'));
  const rows = raw.map(r => pick(r, COLS[table]));
  if (rows.length === 0) { console.log(`${table}: 0`); continue; }
  // chunk to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500));
    if (error) { console.error(`${table} error:`, error.message); process.exit(1); }
  }
  console.log(`${table}: ${rows.length}`);
}
```

- [ ] **Step 2: Reset DB and run import**

Run:
```bash
npx supabase db reset
npm run data:import
```
Expected: prints per-table counts matching the pull; no errors.

- [ ] **Step 3: Verify referential integrity**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"select count(*) as orphan_guests from guests g left join tables t on g.table_id=t.id where g.table_id is not null and t.id is null;"
```
Expected: `orphan_guests = 0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-to-supabase.mjs
git commit -m "feat(data): import snapshots into supabase, id-preserving"
```

---

## Task 10: Integration tests (CRUD + RLS) against local Supabase

**Files:**
- Create: `tests/integration/setup.js`, `tests/integration/crud.test.js`

- [ ] **Step 1: Test harness (service-role client)**

`tests/integration/setup.js`:
```javascript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export async function makeWedding() {
  const { data, error } = await admin.from('weddings')
    .insert({ couple_names: 'Test Couple', wedding_date: '2027-01-01' }).select().single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Write CRUD + integrity tests**

`tests/integration/crud.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, makeWedding } from './setup.js';

let weddingId;
beforeAll(async () => { weddingId = (await makeWedding()).id; });

describe('guests CRUD', () => {
  it('creates and reads a guest with a preserved id', async () => {
    const { data: created } = await admin.from('guests')
      .insert({ id: 'test-guest-1', wedding_id: weddingId, first_name: 'A', last_name: 'B', side: 'חתן' })
      .select().single();
    expect(created.id).toBe('test-guest-1');
    const { data: got } = await admin.from('guests').select('*').eq('id','test-guest-1').single();
    expect(got.first_name).toBe('A');
  });

  it('updates and deletes', async () => {
    await admin.from('guests').update({ status: 'אישר' }).eq('id','test-guest-1');
    const { data } = await admin.from('guests').select('status').eq('id','test-guest-1').single();
    expect(data.status).toBe('אישר');
    await admin.from('guests').delete().eq('id','test-guest-1');
    const { data: gone } = await admin.from('guests').select('*').eq('id','test-guest-1');
    expect(gone.length).toBe(0);
  });
});

describe('imported data sanity', () => {
  it('has the expected guest count from base44', async () => {
    const { count } = await admin.from('guests').select('*', { count: 'exact', head: true });
    expect(count).toBeGreaterThanOrEqual(352);
  });
});
```

- [ ] **Step 3: Run integration tests**

Run:
```bash
npx supabase db reset >/dev/null 2>&1 && npm run data:import >/dev/null && npm run test:int
```
Expected: PASS. (The count test assumes the import ran; the reset+import prefix guarantees it.)

- [ ] **Step 4: RLS isolation test**

Append to `tests/integration/crud.test.js`:
```javascript
import { createClient } from '@supabase/supabase-js';
describe('RLS', () => {
  it('anon cannot read guests', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data } = await anon.from('guests').select('*').limit(1);
    expect(data?.length ?? 0).toBe(0); // RLS blocks unauthenticated reads
  });
});
```

Run: `npm run test:int`
Expected: PASS (anon sees 0 rows).

- [ ] **Step 5: Commit**

```bash
git add tests/integration
git commit -m "test(int): CRUD, id preservation, import sanity, RLS isolation"
```

---

## Task 11: Wire env + run the app locally

**Files:**
- Modify: none (uses `.env`)

- [ ] **Step 1: Confirm Vite reads Supabase env**

Ensure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (local values).

- [ ] **Step 2: Start the app**

Run: `npm run dev`
Expected: Vite serves at `http://localhost:5173` with no console import errors.

- [ ] **Step 3: Manual smoke (documented, no auth yet)**

Because RLS blocks unauthenticated reads, create a temporary local test user to
verify end-to-end:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"select email from auth.users limit 1;"
```
If empty, create one via Supabase Studio (`http://127.0.0.1:54323` → Authentication →
Add user), then set that profile to admin:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"update profiles set role='admin' where email='<the email>';"
```
Log in through the app and confirm the dashboard loads guests/expenses.

- [ ] **Step 4: Commit (if any config changed)**

```bash
git add -A && git commit -m "chore: local run verified" --allow-empty
```

---

## Task 12: Repoint AI extract call & final Phase-1 verification

**Files:**
- Modify: `src/pages/Guests.jsx:447`

- [ ] **Step 1: Confirm the call already routes through the shim**

The shim's `integrations.Core.ExtractDataFromUploadedFile` invokes the
`extractGuestData` edge function, so `src/pages/Guests.jsx` needs no change if it
calls `base44.integrations.Core.ExtractDataFromUploadedFile(...)`. Verify:

Run: `grep -n "ExtractDataFromUploadedFile" src/pages/Guests.jsx`
Expected: one call on the `base44.integrations.Core` object. If the payload shape
differs from `{ file_url }` / `{ text }`, adjust `extractGuestData` to match.

- [ ] **Step 2: Full Phase-1 verification**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
npm run data:import
npm run test:unit && npm run test:int
npm run build
```
Expected: import OK; all tests PASS; production build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: Phase 1 local foundation complete (app on local supabase)"
```

---

## Phase 1 Done — Definition of Done

- Local Supabase runs the full schema + RLS.
- The app runs against local Supabase via the shim, no base44 SDK calls at runtime.
- All 352 guests + related data imported with IDs and relationships intact.
- Unit + integration tests pass; production build succeeds.
- Edge functions serve locally.

**Phase 2 (cloud go-live) is a separate plan**, written once you provide the
Supabase project + token, Vercel token, Anthropic key, and Google OAuth creds. It
covers: create cloud project, push migrations + functions, migrate data to cloud,
link profiles to real auth users, enable Google + email auth, deploy to Vercel,
run the manual smoke checklist, and author the reusable skills
(`supabase-schema-change`, `deploy`, `run-local`, `base44-data-import`).
