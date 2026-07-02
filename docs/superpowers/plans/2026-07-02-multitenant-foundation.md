# Multi-Tenant Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-model the app into a multi-tenant SaaS foundation: users self-serve sign up, create/own weddings, and collaborate via a `wedding_members` join table, with membership-based RLS — replacing the single-`profiles.wedding_id` model.

**Architecture:** A new `wedding_members` table (user↔wedding, role per membership) becomes the tenancy backbone. RLS switches from a single wedding to membership checks (`is_wedding_member`, `is_platform_admin`). To minimize frontend churn, `WeddingContext` synthesizes the `user` object (role/wedding_sides/max_guests) from the **active** membership, so components reading `useWedding().user` keep working. Self-serve signup + a "create wedding" onboarding replace the admin-approval gate.

**Tech Stack:** Supabase (Postgres + RLS + Auth), Vite/React, the existing `base44` compatibility shim, Vitest, Resend (SMTP).

**Reference spec:** `docs/superpowers/specs/2026-07-02-multitenant-foundation-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/0006_multitenant.sql` — owner_id, wedding_members, is_platform_admin, RLS helpers/policies, grants
- `supabase/migrations/0007_drop_legacy_profile_cols.sql` — drop old per-wedding profile columns (after backfill)
- `scripts/backfill-multitenant.mjs` — map existing data → memberships/owner, delete sample wedding
- `src/components/CreateWedding.jsx` — onboarding "create your wedding" screen
- `tests/integration/multitenant.test.js` — membership RLS + ownership + create-wedding tests
- `tests/unit/wedding-context.test.js` — active-membership synthesis unit test

**Modify:**
- `src/api/base44Client.js` — `auth.me()` shape; add `signUp`
- `src/lib/WeddingContext.jsx` — load memberships, synthesize `user`, expose `activeMembership`/`isPlatformAdmin`
- `src/lib/AuthContext.jsx` — drop approval gate (already gone; confirm)
- `src/App.jsx` — show onboarding when authenticated but zero memberships
- `src/components/Login.jsx` — add sign-up mode
- `src/Layout.jsx` — role checks use `isAdmin`/active membership
- `src/pages/UserManagement.jsx`, `src/pages/AdminDashboard.jsx` — read active membership / platform-admin

---

## Task 1: Schema + RLS migration

**Files:**
- Create: `supabase/migrations/0006_multitenant.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 1. weddings gain an owner
alter table weddings add column if not exists owner_id uuid references profiles(id);

-- 2. platform-admin flag on profiles
alter table profiles add column if not exists is_platform_admin boolean default false;

-- 3. membership backbone
create table if not exists wedding_members (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null,                         -- owner | coplanner | family | event_manager
  wedding_sides text[] default '{}',
  max_guests int,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  unique (wedding_id, user_id)
);
create index if not exists idx_wm_wedding on wedding_members(wedding_id);
create index if not exists idx_wm_user on wedding_members(user_id);
create trigger trg_wedding_members_updated before update on wedding_members
  for each row execute function set_updated_date();

-- 4. helpers (security definer to avoid recursive RLS)
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_wedding_member(wid text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from wedding_members where user_id = auth.uid() and wedding_id = wid);
$$;

create or replace function is_wedding_owner(wid text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from weddings where id = wid and owner_id = auth.uid());
$$;

-- 5. RLS on wedding_members
alter table wedding_members enable row level security;
create policy wm_read on wedding_members for select
  using (is_platform_admin() or user_id = auth.uid() or is_wedding_member(wedding_id));
create policy wm_manage on wedding_members for all
  using (is_platform_admin() or is_wedding_owner(wedding_id))
  with check (is_platform_admin() or is_wedding_owner(wedding_id));

-- 6. weddings policies (replace old ones)
drop policy if exists weddings_read on weddings;
drop policy if exists weddings_admin_write on weddings;
create policy weddings_read on weddings for select
  using (is_platform_admin() or is_wedding_member(id));
create policy weddings_insert on weddings for insert
  with check (owner_id = auth.uid());
create policy weddings_update on weddings for update
  using (is_platform_admin() or owner_id = auth.uid())
  with check (is_platform_admin() or owner_id = auth.uid());
create policy weddings_delete on weddings for delete
  using (is_platform_admin() or owner_id = auth.uid());

-- 7. wedding-scoped tables: swap single-wedding policy for membership policy
do $$
declare t text;
begin
  foreach t in array array['tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format('drop policy if exists %1$s_scoped on %1$s;', t);
    execute format($f$
      create policy %1$s_scoped on %1$s for all
      using (is_platform_admin() or is_wedding_member(wedding_id))
      with check (is_platform_admin() or is_wedding_member(wedding_id));
    $f$, t);
  end loop;
end $$;

-- 8. grants for the new table
grant all on wedding_members to anon, authenticated, service_role;
```

- [ ] **Step 2: Apply locally and verify structures**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
"select
  (select count(*) from information_schema.columns where table_name='weddings' and column_name='owner_id') as owner_col,
  (select count(*) from information_schema.tables where table_name='wedding_members') as wm_table,
  (select count(*) from information_schema.columns where table_name='profiles' and column_name='is_platform_admin') as pa_col;"
```
Expected: `1|1|1`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_multitenant.sql
git commit -m "feat(db): multi-tenant schema + membership RLS"
```

---

## Task 2: Backfill existing data

**Files:**
- Create: `scripts/backfill-multitenant.mjs`

Maps the imported base44 data into the new model. Idempotent. Uses the service-role client (bypasses RLS).

- [ ] **Step 1: Write the backfill script**

```javascript
import 'dotenv/config';
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws;
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, svc, { auth: { persistSession: false } });

const OWNER_EMAIL = 'omrilevi1994@gmail.com';        // platform admin + owner of kept wedding
const KEEP_COUPLE = 'דניאל ועומרי';                  // wedding to preserve (match couple_names)
const DROP_COUPLE = 'בר ותמיר';                      // sample wedding to delete

// 1. resolve auth users by email -> id
const { data: { users } } = await supabase.auth.admin.listUsers();
const idByEmail = Object.fromEntries(users.map(u => [u.email, u.id]));

// 2. identify weddings
const { data: weddings } = await supabase.from('weddings').select('id, couple_names');
const keep = weddings.find(w => (w.couple_names || '').includes('דניאל'));
const drop = weddings.find(w => (w.couple_names || '').includes('בר'));
if (!keep) throw new Error('kept wedding not found');

// 3. delete the sample wedding (cascade removes its child rows)
if (drop) {
  await supabase.from('weddings').delete().eq('id', drop.id);
  console.log('deleted sample wedding', drop.couple_names);
}

// 4. set platform admin + owner
const ownerId = idByEmail[OWNER_EMAIL];
if (!ownerId) throw new Error(`owner auth user missing: ${OWNER_EMAIL}`);
await supabase.from('profiles').update({ is_platform_admin: true }).eq('id', ownerId);
await supabase.from('weddings').update({ owner_id: ownerId }).eq('id', keep.id);
await supabase.from('wedding_members').upsert(
  { wedding_id: keep.id, user_id: ownerId, role: 'owner' },
  { onConflict: 'wedding_id,user_id' });
console.log('owner set:', OWNER_EMAIL);

// 5. map remaining users to members, sourced from the base44 snapshot
//    (legacy per-wedding columns are dropped by migration 0007, so read them here).
const snap = JSON.parse(await readFile('.data-snapshots/User.json', 'utf8'));
for (const u of snap) {
  const uid = idByEmail[u.email];
  if (!uid || uid === ownerId) continue;
  if (u.wedding_id !== keep.id) continue;             // only members of the kept wedding
  const role = u.role === 'event_manager' ? 'event_manager'
             : u.role === 'admin' ? 'coplanner'
             : 'family';
  await supabase.from('wedding_members').upsert({
    wedding_id: keep.id,
    user_id: uid,
    role,
    wedding_sides: u.wedding_sides || [],
    max_guests: u.max_guests ?? null,
  }, { onConflict: 'wedding_id,user_id' });
  console.log(`member: ${u.email} -> ${role}`);
}
console.log('backfill done');
```

- [ ] **Step 2: Add npm script**

In `package.json` `"scripts"`, add:
```json
"data:backfill": "node scripts/backfill-multitenant.mjs"
```

- [ ] **Step 3: Run locally (after import + user seed) and verify**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
npm run data:import >/dev/null
# seed auth users (existing helper pattern from Phase 1) then:
npm run data:backfill
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
"select (select count(*) from wedding_members) as members,
        (select count(*) from weddings) as weddings,
        (select count(*) from weddings where owner_id is not null) as owned;"
```
Expected: `members >= 1`, `weddings = 1` (sample dropped), `owned = 1`.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-multitenant.mjs package.json
git commit -m "feat(data): backfill multi-tenant memberships + owner"
```

---

## Task 3: Drop legacy profile columns

**Files:**
- Create: `supabase/migrations/0007_drop_legacy_profile_cols.sql`

- [ ] **Step 1: Write the migration**

```sql
-- legacy per-wedding fields now live in wedding_members; role replaced by is_platform_admin
alter table profiles drop column if exists wedding_id;
alter table profiles drop column if exists wedding_sides;
alter table profiles drop column if exists max_guests;
alter table profiles drop column if exists is_approved;
alter table profiles drop column if exists role;
```

- [ ] **Step 2: Update `handle_new_user` (0001 defined it inserting only id/email/full_name — no change needed; verify it doesn't reference dropped cols)**

Run: `grep -n "handle_new_user" supabase/migrations/0001_schema.sql`
Expected: the function inserts `(id, email, full_name)` only — no dropped columns referenced. If it does reference them, add a corrective `create or replace function handle_new_user` here.

- [ ] **Step 3: Apply and verify columns gone**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"alter table profiles drop column if exists wedding_id, drop column if exists wedding_sides, drop column if exists max_guests, drop column if exists is_approved, drop column if exists role;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
"select count(*) from information_schema.columns where table_name='profiles' and column_name in ('wedding_id','wedding_sides','max_guests','is_approved','role');"
```
Expected: `0`.

> Note: because 0007 drops these columns at reset time, the backfill (Task 2)
> already sources legacy role/sides/cap from `.data-snapshots/User.json`, not from
> `profiles`. On a fresh `db reset` the order is: migrations 0001–0007 apply →
> import → seed auth users → backfill (reads the snapshot).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_drop_legacy_profile_cols.sql
git commit -m "feat(db): drop legacy per-wedding profile columns"
```

---

## Task 4: Shim `auth.me()` + `signUp`

**Files:**
- Modify: `src/api/base44Client.js`

- [ ] **Step 1: Update `auth.me()` to the new shape**

Replace the `me()` method body:
```javascript
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single();
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? user.email,
      is_platform_admin: profile?.is_platform_admin ?? false,
    };
  },
```

- [ ] **Step 2: Add `signUp` to the auth object**

Add after `signInWithPassword`:
```javascript
  async signUp({ email, password, full_name }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name } },
    });
    if (error) throw error;
    return data;
  },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/api/base44Client.js
git commit -m "feat(shim): auth.me returns platform flag; add signUp"
```

---

## Task 5: WeddingContext — memberships + synthesized user (TDD)

**Files:**
- Modify: `src/lib/WeddingContext.jsx`
- Create: `tests/unit/wedding-context.test.js`

- [ ] **Step 1: Write the failing unit test for the pure helper**

`tests/unit/wedding-context.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { synthUser } from '@/lib/WeddingContext';

const profile = { id: 'u1', email: 'a@b.com', full_name: 'A', is_platform_admin: false };

describe('synthUser', () => {
  it('merges active membership role/limits onto the profile', () => {
    const m = { role: 'family', wedding_sides: ['חתן'], max_guests: 10 };
    const u = synthUser(profile, m);
    expect(u).toMatchObject({ id: 'u1', role: 'family', wedding_sides: ['חתן'], max_guests: 10 });
  });
  it('null membership yields no role', () => {
    expect(synthUser(profile, null).role).toBeUndefined();
  });
  it('platform admin flag carries through', () => {
    expect(synthUser({ ...profile, is_platform_admin: true }, null).is_platform_admin).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test:unit`
Expected: FAIL — `synthUser` not exported.

- [ ] **Step 3: Rewrite WeddingContext**

Replace `src/lib/WeddingContext.jsx` with:
```javascript
import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const WeddingContext = createContext();
const STORAGE_KEY = 'activeWeddingId';

// Pure: merge the active membership's per-wedding fields onto the profile.
export function synthUser(profile, membership) {
  if (!profile) return null;
  return {
    ...profile,
    role: membership?.role,
    wedding_sides: membership?.wedding_sides ?? [],
    max_guests: membership?.max_guests ?? null,
  };
}

export const WeddingProvider = ({ children }) => {
  const { user: authUser, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);   // [{wedding, role, wedding_sides, max_guests}]
  const [weddings, setWeddings] = useState([]);
  const [activeWeddingId, setActiveWeddingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isPlatformAdmin = !!profile?.is_platform_admin;
  const activeMembership = memberships.find(m => m.wedding_id === activeWeddingId) || null;
  const user = synthUser(profile, activeMembership);
  // owner/coplanner (or platform admin) have full admin rights within the wedding
  const isAdmin = isPlatformAdmin || ['owner', 'coplanner'].includes(activeMembership?.role);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated || !authUser) {
      setProfile(null); setMemberships([]); setWeddings([]); setActiveWeddingId(null);
      setIsLoading(false); return;
    }
    setIsLoading(true);
    (async () => {
      try {
        setProfile(await base44.auth.me());
        // memberships joined to their weddings
        const { data: rows } = await supabase
          .from('wedding_members')
          .select('wedding_id, role, wedding_sides, max_guests, weddings(*)')
          .eq('user_id', authUser.id);
        if (cancelled) return;
        const ms = rows || [];
        setMemberships(ms.map(({ weddings, ...m }) => m));
        const ws = ms.map(r => r.weddings).filter(Boolean);
        setWeddings(ws);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && ws.some(w => w.id === stored)) setActiveWeddingId(stored);
        else if (ws.length > 0) setActiveWeddingId(ws[0].id);
        else setActiveWeddingId(null);
      } catch (e) {
        console.error('WeddingContext load failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, authUser?.id]);

  const selectWedding = (id) => {
    setActiveWeddingId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY);
  };

  const refreshWeddings = async () => {
    if (!authUser) return;
    const { data: rows } = await supabase
      .from('wedding_members')
      .select('wedding_id, role, wedding_sides, max_guests, weddings(*)')
      .eq('user_id', authUser.id);
    const ms = rows || [];
    setMemberships(ms.map(({ weddings, ...m }) => m));
    setWeddings(ms.map(r => r.weddings).filter(Boolean));
  };

  const activeWedding = weddings.find(w => w.id === activeWeddingId) || null;

  return (
    <WeddingContext.Provider value={{
      user, profile, isAdmin, isPlatformAdmin,
      memberships, activeMembership,
      weddings, activeWedding, activeWeddingId,
      hasNoWeddings: !isLoading && weddings.length === 0,
      selectWedding, refreshWeddings, isLoading,
    }}>
      {children}
    </WeddingContext.Provider>
  );
};

export const useWedding = () => {
  const ctx = useContext(WeddingContext);
  if (!ctx) throw new Error('useWedding must be used within WeddingProvider');
  return ctx;
};
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm run test:unit`
Expected: PASS (synthUser tests + prior parseSort tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/WeddingContext.jsx tests/unit/wedding-context.test.js
git commit -m "feat(context): membership-based weddings + synthesized user"
```

---

## Task 6: Layout & consumers use active membership

**Files:**
- Modify: `src/Layout.jsx`, `src/pages/UserManagement.jsx`, `src/pages/AdminDashboard.jsx`

- [ ] **Step 1: Layout — replace legacy `role==='admin'` checks with `isAdmin`**

In `src/Layout.jsx`, pull `isAdmin` from context (already destructured) and change the two legacy checks:
```javascript
// was: if (user && user.role !== 'admin' && !isEventManager) {
if (user && !isAdmin && !isEventManager) {
```
and
```javascript
// was: const hasAccessToPage = isAdmin || ...   (keep; isAdmin now membership-derived)
```
`isEventManager = user?.role === 'event_manager'` still works (role preserved on synthesized user). No other change.

- [ ] **Step 2: UserManagement — gate on platform admin / owner**

In `src/pages/UserManagement.jsx`, replace any `user.role === 'admin'` gate with `isAdmin` (from `useWedding()`), and ensure it lists members via `getWeddingUsers` for the active wedding (already wired). Confirm the invite call passes `{ email, role, wedding_id: activeWeddingId }` (done in Phase 1).

- [ ] **Step 3: AdminDashboard — platform-admin only**

In `src/pages/AdminDashboard.jsx`, guard the page with `isPlatformAdmin` from `useWedding()`; if not platform admin, render the existing "no access" path. (Cross-tenant listing UI stays minimal here; full console is sub-project #3.)

- [ ] **Step 4: Build + verify no references to removed fields**

Run:
```bash
npm run build
grep -rn "\.is_approved\|user\.role === 'admin'\|user?.role === 'admin'" src || echo "clean"
```
Expected: build OK; grep prints "clean".

- [ ] **Step 5: Commit**

```bash
git add src/Layout.jsx src/pages/UserManagement.jsx src/pages/AdminDashboard.jsx
git commit -m "feat(ui): consumers read membership-derived role/admin"
```

---

## Task 7: Onboarding — CreateWedding + wire into App

**Files:**
- Create: `src/components/CreateWedding.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: CreateWedding component**

`src/components/CreateWedding.jsx`:
```javascript
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useWedding } from '@/lib/WeddingContext';

export default function CreateWedding() {
  const { user } = useAuth();
  const { refreshWeddings, selectWedding } = useWedding();
  const [coupleNames, setCoupleNames] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const wedding = await base44.entities.Wedding.create({
        couple_names: coupleNames,
        wedding_date: weddingDate || null,
        owner_id: user.id,
        status: 'active',
      });
      const { error: mErr } = await supabase.from('wedding_members')
        .insert({ wedding_id: wedding.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;
      await refreshWeddings();
      selectWedding(wedding.id);
    } catch (err) {
      setError(err?.message || 'שגיאה ביצירת החתונה');
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-3">
        <h1 className="text-2xl font-bold text-slate-800 text-center">יצירת חתונה</h1>
        <p className="text-sm text-slate-500 text-center mb-4">בואו נתחיל לתכנן</p>
        <input required value={coupleNames} onChange={e => setCoupleNames(e.target.value)}
          placeholder="שמות בני הזוג"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
        <input type="date" value={weddingDate} onChange={e => setWeddingDate(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50">
          {busy ? 'יוצר…' : 'צור חתונה'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Show onboarding in App when authenticated with no weddings**

In `src/App.jsx`, inside `AuthenticatedApp`, add `CreateWedding` gating. Import it and use `useWedding().hasNoWeddings`:
```javascript
import CreateWedding from '@/components/CreateWedding';
import { useWedding } from '@/lib/WeddingContext';
```
After the `authError` block and before the main `<Routes>`:
```javascript
  const { hasNoWeddings, isLoading: weddingsLoading } = useWedding();
  if (weddingsLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (hasNoWeddings) return <CreateWedding />;
```

- [ ] **Step 3: Build + commit**

Run: `npm run build` (expect success), then:
```bash
git add src/components/CreateWedding.jsx src/App.jsx
git commit -m "feat(onboarding): create-wedding screen for users with no weddings"
```

---

## Task 8: Sign-up mode on Login

**Files:**
- Modify: `src/components/Login.jsx`

- [ ] **Step 1: Add a sign-up toggle**

In `src/components/Login.jsx`, add `const [mode, setMode] = useState('signin')` and `const [fullName, setFullName] = useState('')`. In `submit`, branch:
```javascript
    try {
      if (mode === 'signup') {
        await base44.auth.signUp({ email, password, full_name: fullName });
      } else {
        await base44.auth.signInWithPassword({ email, password });
      }
    } catch (err) { setError(err?.message || 'שגיאה'); setBusy(false); }
```
Render a name field when `mode === 'signup'`, swap the button label (`הרשמה`/`התחברות`), and add a toggle link:
```jsx
{mode === 'signup' && (
  <input required value={fullName} onChange={e => setFullName(e.target.value)}
    placeholder="שם מלא"
    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
)}
...
<button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
  className="w-full text-sm text-slate-500 mt-2">
  {mode === 'signup' ? 'כבר יש לי חשבון' : 'אין לי חשבון — הרשמה'}
</button>
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` (expect success), then:
```bash
git add src/components/Login.jsx
git commit -m "feat(auth): sign-up mode on login screen"
```

---

## Task 9: Integration tests (membership RLS + create-wedding)

**Files:**
- Create: `tests/integration/multitenant.test.js`

- [ ] **Step 1: Write the tests**

`tests/integration/multitenant.test.js`:
```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin } from './setup.js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;

async function makeUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!1', email_confirm: true });
  const c = createClient(url, anon, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: 'Passw0rd!1' });
  return { id: data.user.id, client: c };
}

let alice, bob, weddingId;
beforeAll(async () => {
  alice = await makeUser(`alice-${Date.now()}@t.local`);
  bob = await makeUser(`bob-${Date.now()}@t.local`);
});

describe('multi-tenant RLS', () => {
  it('a user can create a wedding they own and read it', async () => {
    const { data: w, error } = await alice.client.from('weddings')
      .insert({ couple_names: 'Alice & X', owner_id: alice.id, status: 'active' }).select().single();
    expect(error).toBeNull();
    weddingId = w.id;
    await alice.client.from('wedding_members').insert({ wedding_id: w.id, user_id: alice.id, role: 'owner' });
    const { data: seen } = await alice.client.from('weddings').select('*').eq('id', w.id);
    expect(seen.length).toBe(1);
  });

  it('a non-member cannot see the wedding or its guests', async () => {
    const { data: w } = await bob.client.from('weddings').select('*').eq('id', weddingId);
    expect(w.length).toBe(0);
    await admin.from('guests').insert({ id: `g-${Date.now()}`, wedding_id: weddingId, first_name: 'A', last_name: 'B', side: 'חתן' });
    const { data: g } = await bob.client.from('guests').select('*').eq('wedding_id', weddingId);
    expect(g.length).toBe(0);
  });

  it('only the owner can delete the wedding', async () => {
    await bob.client.from('weddings').delete().eq('id', weddingId);       // no-op under RLS
    const { data: still } = await admin.from('weddings').select('id').eq('id', weddingId);
    expect(still.length).toBe(1);
    await alice.client.from('weddings').delete().eq('id', weddingId);
    const { data: gone } = await admin.from('weddings').select('id').eq('id', weddingId);
    expect(gone.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run integration tests**

Run:
```bash
npx supabase db reset >/dev/null 2>&1 && npm run test:int
```
Expected: PASS (multitenant + prior crud tests).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/multitenant.test.js
git commit -m "test(int): membership RLS, ownership, create-wedding"
```

---

## Task 10: Local end-to-end verification

- [ ] **Step 1: Full local rebuild + data path**

Run:
```bash
npx supabase db reset >/dev/null 2>&1
npm run data:import
# seed the base44 auth users (Phase 1 pattern), then:
npm run data:backfill
npm run test:unit && npm run test:int && npm run build
```
Expected: import OK; backfill OK; all tests pass; build OK.

- [ ] **Step 2: Manual browser smoke (local)**

Run `npm run dev`, then:
- Sign up a brand-new email → lands on **CreateWedding** → create → dashboard (empty wedding).
- Log in as `omrilevi1994@gmail.com` (seeded) → sees "דניאל ועומרי" with real data; WeddingSelector lists it.
- Confirm a second created wedding also appears in the selector.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: multi-tenant foundation verified locally" --allow-empty
```

---

## Task 11: Resend SMTP (cloud auth email)

**Files:** none (Supabase config)

**Prerequisite:** user provides a Resend API key + a verified sender (or uses Resend's onboarding domain for testing).

- [ ] **Step 1: Configure SMTP via Management API**

Run (values from the user's Resend account):
```bash
set -a; source .env.deploy; set +a
python3 - <<'PY'
import os,json,urllib.request
ref=os.environ['SUPABASE_PROJECT_REF']; tok=os.environ['SUPABASE_ACCESS_TOKEN']
body={
 "smtp_admin_email":"onboarding@resend.dev",   # replace with verified sender
 "smtp_host":"smtp.resend.com","smtp_port":465,
 "smtp_user":"resend","smtp_pass":os.environ["RESEND_API_KEY"],
 "smtp_sender_name":"WedFlow","mailer_autoconfirm":False,
 "rate_limit_email_sent":100
}
req=urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/config/auth",
  data=json.dumps(body).encode(),
  headers={"Authorization":f"Bearer {tok}","Content-Type":"application/json","User-Agent":"supabase-cli"},method="PATCH")
print("HTTP", urllib.request.urlopen(req).status, "→ SMTP configured")
PY
```
Expected: `HTTP 200 → SMTP configured`.

- [ ] **Step 2: Verify a signup email sends**

Sign up with a real address on the deployed site; confirm the verification email arrives.

---

## Task 12: Deploy to cloud

**Files:** none (deploy)

- [ ] **Step 1: Snapshot cloud data (safety) then push migrations**

Safety net: dump the cloud tables to JSON before the destructive migration (0007
drops columns; the backfill deletes the sample wedding). base44 still holds the
original data too.
```bash
set -a; source .env.deploy; set +a
mkdir -p .cloud-backup
node --input-type=module <<'EOF'
import 'dotenv/config'; import ws from 'ws'; globalThis.WebSocket=ws;
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
const s=createClient(process.env.CLOUD_SUPABASE_URL, process.env.CLOUD_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
for (const t of ['weddings','profiles','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs','tables']) {
  const { data } = await s.from(t).select('*');
  await writeFile(`.cloud-backup/${t}.json`, JSON.stringify(data||[], null, 2));
  console.log(t, (data||[]).length);
}
EOF
```
Add `.cloud-backup/` to `.gitignore`. Then apply 0006 + 0007 to cloud via the
Management API query endpoint (same pattern as the Phase-1 schema push:
concatenate the two new migration files, POST to `/database/query` with a
`User-Agent` header). Expected: HTTP 201.

- [ ] **Step 2: Backfill cloud**

Run:
```bash
VITE_SUPABASE_URL="$CLOUD_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$CLOUD_SERVICE_ROLE_KEY" npm run data:backfill
```
Expected: owner set, members mapped, sample wedding deleted.

- [ ] **Step 3: Redeploy frontend**

Run:
```bash
npx vercel deploy --prod --yes --scope omrilevi1994s-projects --token "$VERCEL_TOKEN"
```
Expected: READY.

- [ ] **Step 4: Verify live**

Load the production site → log in as omrilevi1994 (Google) → sees "דניאל ועומרי"; sign up a fresh account → CreateWedding → dashboard.

---

## Definition of Done

- `wedding_members` model + membership RLS live (local + cloud).
- Self-serve signup + create-wedding onboarding works; approval gate gone.
- Existing wedding preserved with Omri as owner; sample wedding deleted; legacy profile columns dropped.
- Unit + integration tests pass; build clean; deployed and verified.
- Resend SMTP sending verification emails.

## Out of scope (later sub-projects)
- Email invites, role management UI, delete-wedding UI, backup/export (#2).
- Platform-admin console UI (#3).
- Billing / feature flags (#4).
- Role-based write restrictions within a wedding (#2).
