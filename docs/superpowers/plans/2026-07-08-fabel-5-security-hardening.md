# fabel-5 Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two cross-wedding isolation holes (profile privilege escalation, world-readable uploads), add RLS-level role enforcement inside a wedding, and land all remaining hardening findings from the fabel-5 security review.

**Architecture:** Postgres RLS is the authoritative authorization layer. Fixes are delivered as sequential migrations (`0015`–`0018`) continuing from the current head `0014`, plus edge-function guards, a client upload/read rework to signed URLs, a one-time storage data-migration script, and config/dependency cleanup. Each work unit is independently testable and lands on `main` in risk order.

**Tech Stack:** Supabase (Postgres 17, RLS, Storage, Edge Functions on Deno 2), React (Vite), vitest (integration tests run against the local Supabase stack).

## Global Constraints

- Migration files continue the existing sequence; next numbers are `0015`, `0016`, `0017`, `0018`. Never renumber or edit shipped migrations.
- Every `security definer` function MUST set `search_path = public` (or its declared schema).
- Integration tests run against the **local** Supabase stack: ensure it is up (`npm run db:start`), apply migrations with `supabase db reset`, then `npm run test:int`. Env (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) is loaded from `.env` via dotenv.
- UI copy is Hebrew; preserve existing tone and RTL.
- Keep everything within Supabase/Vercel/Resend free tiers.
- `is_platform_admin()` remaining a full master bypass is intentional — do not restrict it.
- **Accepted gaps (do not implement):** `max_guests` quota stays UI-enforced (no DB trigger); orphaned storage files are logged, not deleted.
- Commit after every task. Do not push or open PRs from this plan — integration/merge is handled at execution time.

## File Structure

**Migrations (create):**
- `supabase/migrations/0015_protect_profile_privileged_cols.sql` — profile escalation trigger + policy WITH CHECK.
- `supabase/migrations/0016_storage_private.sql` — private bucket + wedding-scoped storage policies.
- `supabase/migrations/0017_role_rls.sql` — role helpers + tiered write policies.
- `supabase/migrations/0018_hardening.sql` — `set_created_by` search_path + anon RPC revoke.

**Edge functions (modify):**
- `supabase/functions/bulkUpdateGuestStatus/index.ts` — role check + column whitelist.
- `supabase/functions/iplanBulkImport/index.ts` — role check.
- `supabase/functions/_shared/cors.ts` — env-driven CORS (becomes a function).
- All 8 functions — switch to `corsHeaders(req)`.

**Client (modify/create):**
- `src/api/wedflowClient.js` — `buildUploadPath`, `UploadFile({file, weddingId})`, `getSignedUrl`.
- `src/lib/signedFile.jsx` (create) — `useSignedUrl` hook + `SignedFileLink`/`SignedImage` components.
- Upload/read sites: `ExpenseForm.jsx`, `Expenses.jsx`, `VendorForm.jsx`, `Vendors.jsx`, `Checklist.jsx`, `WeddingDayChecklist.jsx`.
- `src/pages/Guests.jsx` — pass `wedding_id` to `bulkUpdateGuestStatus`.
- `src/pages/AcceptInvite.jsx` — password floor 6 → 8.

**Config / scripts (modify/create):**
- `supabase/config.toml` — per-function `verify_jwt`, `minimum_password_length = 8`.
- `scripts/migrate-storage-paths.mjs` (create) — one-time data migration.
- `package.json` — drop `@stripe/*`.

**Tests (create/modify):**
- `tests/integration/setup.js` — add exported `makeUser` helper.
- `tests/integration/security.test.js` (create) — escalation, storage scoping, role tiers, anon RPC.
- `tests/unit/upload-path.test.js` (create) — `buildUploadPath`.

---

## Task 1: Profile privilege-escalation fix (migration 0015)

**Files:**
- Modify: `tests/integration/setup.js`
- Test: `tests/integration/security.test.js` (create)
- Create: `supabase/migrations/0015_protect_profile_privileged_cols.sql`

**Interfaces:**
- Produces: `makeUser(email, password?)` from `setup.js` → `{ id, client }` where `client` is an anon-key Supabase client signed in as that user. Used by Tasks 2 and 6.

- [ ] **Step 1: Add the `makeUser` helper to the test setup**

Append to `tests/integration/setup.js`:

```js
export async function makeUser(email, password = 'Passw0rd!1') {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/integration/security.test.js`. Include all imports the later tasks also need at the top so no task inserts a mid-file import:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, makeUser, makeWedding } from './setup.js';

describe('profiles privilege escalation', () => {
  let user;
  beforeAll(async () => { user = await makeUser(`esc-${Date.now()}@t.local`); });

  it('a non-admin cannot make themselves platform admin', async () => {
    await user.client.from('profiles').update({ is_platform_admin: true }).eq('id', user.id);
    const { data } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    expect(data.is_platform_admin).toBe(false);
  });

  it('a non-admin cannot change their profile email (invite-squatting)', async () => {
    await user.client.from('profiles').update({ email: `squatter-${Date.now()}@t.local` }).eq('id', user.id);
    const { data } = await admin.from('profiles').select('email').eq('id', user.id).single();
    expect(data.email).toContain('esc-');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:int -- security`
Expected: FAIL — both assertions fail because the current policy lets the user set `is_platform_admin` and `email` on their own row.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0015_protect_profile_privileged_cols.sql`:

```sql
-- CRITICAL: 0008's profiles_self_update has USING but no WITH CHECK, so USING (id = auth.uid())
-- is reused to validate the new row — letting a user set ANY column on their own row,
-- including is_platform_admin (the schema-wide master bypass) and email (invite-squatting).
-- A BEFORE UPDATE trigger pins the privileged columns for non-admins; the WITH CHECK is
-- defense-in-depth.

create or replace function protect_profile_privileged_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    new.is_platform_admin := old.is_platform_admin;
    new.email := old.email;
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_profile_privileged_cols on profiles;
create trigger trg_protect_profile_privileged_cols
  before update on profiles
  for each row execute function protect_profile_privileged_cols();

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or is_platform_admin())
  with check (id = auth.uid() or is_platform_admin());
```

- [ ] **Step 5: Apply migrations and re-run the test**

Run: `supabase db reset && npm run test:int -- security`
Expected: PASS — `is_platform_admin` stays `false`; `email` retains the original `esc-…` value.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/setup.js tests/integration/security.test.js supabase/migrations/0015_protect_profile_privileged_cols.sql
git commit -m "fix(security): block profile privilege escalation and email squatting (0015)"
```

---

## Task 2: Storage privatization (migration 0016)

**Files:**
- Test: `tests/integration/security.test.js` (extend)
- Create: `supabase/migrations/0016_storage_private.sql`

**Interfaces:**
- Consumes: `makeUser` (Task 1), `makeWedding` (existing in `setup.js`).
- Produces: object path convention `${weddingId}/<file>`; storage policies gated on `is_wedding_member((storage.foldername(name))[1])`.

- [ ] **Step 1: Write the failing test**

Append this block to `tests/integration/security.test.js` (all imports are already at the top from Task 1):

```js
describe('storage wedding-scoping', () => {
  let alice, bob;
  beforeAll(async () => {
    alice = await makeUser(`sa-${Date.now()}@t.local`);
    bob = await makeUser(`sb-${Date.now()}@t.local`);
  });

  it('a non-member cannot download another wedding\'s file', async () => {
    const w = await makeWedding();
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: alice.id, role: 'owner' });
    const path = `${w.id}/secret-${Date.now()}.txt`;

    const up = await alice.client.storage.from('uploads').upload(path, new Blob(['secret']));
    expect(up.error).toBeNull();

    const dl = await bob.client.storage.from('uploads').download(path);
    expect(dl.data).toBeNull();

    const list = await bob.client.storage.from('uploads').list('');
    expect((list.data ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:int -- security`
Expected: FAIL — with the public bucket + unscoped read policy, bob's `download` returns data (not null) and `list('')` returns entries.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0016_storage_private.sql`:

```sql
-- CRITICAL: the uploads bucket was public with an anon-readable, wedding-blind SELECT policy,
-- and files lived at flat guessable paths. Make it private and scope every operation to
-- membership of the wedding named by the first path segment: <wedding_id>/<file>.

update storage.buckets set public = false where id = 'uploads';

drop policy if exists "public read uploads" on storage.objects;
drop policy if exists "auth upload" on storage.objects;

create policy "uploads_member_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_select" on storage.objects for select to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));

create policy "uploads_member_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads'
    and (is_platform_admin() or is_wedding_member((storage.foldername(name))[1])));
```

- [ ] **Step 4: Apply migrations and re-run the test**

Run: `supabase db reset && npm run test:int -- security`
Expected: PASS — alice's upload to her wedding's folder succeeds; bob's `download` returns null and `list('')` is empty.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/security.test.js supabase/migrations/0016_storage_private.sql
git commit -m "fix(security): make uploads bucket private and wedding-scoped (0016)"
```

---

## Task 3: Upload path + signed-URL helper (client)

**Files:**
- Modify: `src/api/wedflowClient.js:126-138`
- Test: `tests/unit/upload-path.test.js` (create)

**Interfaces:**
- Produces:
  - `buildUploadPath(weddingId, fileName)` → `"${weddingId}/${uuid}-${fileName}"` (exported).
  - `wedflow.integrations.Core.UploadFile({ file, weddingId })` → `{ file_path }` (stores the path, not a URL).
  - `wedflow.integrations.Core.getSignedUrl(path)` → `Promise<string | null>` (1-hour signed URL).
- Consumes: bucket path convention from Task 2.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/upload-path.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildUploadPath } from '@/api/wedflowClient';

describe('buildUploadPath', () => {
  it('prefixes the wedding id and preserves the filename', () => {
    const p = buildUploadPath('wed-123', 'receipt.pdf');
    expect(p.startsWith('wed-123/')).toBe(true);
    expect(p.endsWith('-receipt.pdf')).toBe(true);
  });

  it('produces a unique path each call', () => {
    const a = buildUploadPath('w', 'f.png');
    const b = buildUploadPath('w', 'f.png');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- upload-path`
Expected: FAIL — `buildUploadPath` is not exported from `wedflowClient`.

- [ ] **Step 3: Rework the upload integration**

Replace the `BUCKET`/`integrations` block in `src/api/wedflowClient.js` (currently lines 126-138) with:

```js
const BUCKET = 'uploads';

// Files are stored under a per-wedding folder so Storage RLS can scope them (see 0016).
// We persist the object PATH (not a public URL); reads mint a short-lived signed URL.
export function buildUploadPath(weddingId, fileName) {
  return `${weddingId}/${crypto.randomUUID()}-${fileName}`;
}

const integrations = {
  Core: {
    async UploadFile({ file, weddingId }) {
      if (!weddingId) throw new Error('weddingId is required to upload a file');
      const path = buildUploadPath(weddingId, file.name);
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      return { file_path: path };
    },
    async getSignedUrl(path) {
      if (!path) return null;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- upload-path`
Expected: PASS.

- [ ] **Step 5: Update the three upload call sites to pass `weddingId` and store the path**

In `src/components/expenses/ExpenseForm.jsx`: add `import { useWedding } from '@/lib/WeddingContext';`, add `const { activeWeddingId } = useWedding();` inside the component, and change the upload handler (lines ~74-75):

```js
const { file_path } = await wedflow.integrations.Core.UploadFile({ file, weddingId: activeWeddingId });
setFormData({ ...formData, receipt_url: file_path });
```

In `src/components/vendors/VendorForm.jsx`: add the same import and `const { activeWeddingId } = useWedding();`, and change the handler (lines ~50-51):

```js
const { file_path } = await wedflow.integrations.Core.UploadFile({ file, weddingId: activeWeddingId });
setFormData(prev => ({ ...prev, contract_file_url: file_path }));
```

In `src/pages/Checklist.jsx` (has `activeWeddingId` already), change the handler (lines ~117-119):

```js
const { file_path } = await wedflow.integrations.Core.UploadFile({ file, weddingId: activeWeddingId });
updateMutation.mutate({ id: item.id, data: { ...item, image_url: file_path } });
```

- [ ] **Step 6: Run all unit tests**

Run: `npm run test:unit`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/api/wedflowClient.js tests/unit/upload-path.test.js src/components/expenses/ExpenseForm.jsx src/components/vendors/VendorForm.jsx src/pages/Checklist.jsx
git commit -m "feat(storage): upload to per-wedding folder and store object path (client)"
```

---

## Task 4: Resolve signed URLs at read sites

**Files:**
- Create: `src/lib/signedFile.jsx`
- Modify: `src/pages/Expenses.jsx:325-330`, `src/components/expenses/ExpenseForm.jsx:355-360`, `src/pages/Vendors.jsx:228-233`, `src/components/vendors/VendorForm.jsx:181-186`, `src/pages/Checklist.jsx:186,409-414`, `src/components/wedding-mode/WeddingDayChecklist.jsx:122-128`

**Interfaces:**
- Consumes: `wedflow.integrations.Core.getSignedUrl` (Task 3); DB columns now hold object paths.
- Produces: `useSignedUrl(path)`, `<SignedFileLink path className>…</SignedFileLink>`, `<SignedImage path …/>`.

- [ ] **Step 1: Create the signed-file helpers**

Create `src/lib/signedFile.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { wedflow } from '@/api/wedflowClient';

// Resolves a stored object path to a short-lived signed URL (bucket is private; see 0016).
export function useSignedUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    wedflow.integrations.Core.getSignedUrl(path)
      .then((u) => { if (active) setUrl(u); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [path]);
  return url;
}

export function SignedFileLink({ path, className, children }) {
  const url = useSignedUrl(path);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

export function SignedImage({ path, ...props }) {
  const url = useSignedUrl(path);
  if (!url) return null;
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={url} {...props} />;
}
```

- [ ] **Step 2: Swap the receipt/contract link sites**

In `src/pages/Expenses.jsx`, add `import { SignedFileLink } from '@/lib/signedFile';` and replace the `<a href={expense.receipt_url} …>…</a>` (around line 327) with a `<SignedFileLink path={expense.receipt_url} className={…}>…</SignedFileLink>`, keeping the same inner label/icon.

In `src/components/expenses/ExpenseForm.jsx`, replace the current-receipt preview link (around line 357) the same way, using `path={formData.receipt_url}`.

In `src/pages/Vendors.jsx`, add the import and replace the `<a href={vendor.contract_file_url} …>` (around line 230) with `<SignedFileLink path={vendor.contract_file_url} …>`.

In `src/components/vendors/VendorForm.jsx`, replace the contract preview link (around line 181) with `<SignedFileLink path={formData.contract_file_url} …>`.

- [ ] **Step 3: Swap the checklist image sites**

In `src/pages/Checklist.jsx`, add `import { SignedImage } from '@/lib/signedFile';` and replace the two `<img src={…image_url} …/>` usages (around lines 186 and 412) with `<SignedImage path={previewItem.image_url} …/>` and `<SignedImage path={item.image_url} …/>` respectively, preserving existing `className`/`onClick` props.

In `src/components/wedding-mode/WeddingDayChecklist.jsx`, add the import and replace the `<img src={item.image_url} …/>` (around line 124) with `<SignedImage path={item.image_url} …/>`, preserving the `onClick` that sets `selectedImage`. The enlarged-preview modal that used `selectedImage` as a raw URL should store the path in state and render it via `<SignedImage path={selectedImage} …/>`.

- [ ] **Step 4: Verify in the running app**

Start the dev server (preview_start with the app config), sign in, open an expense/vendor/checklist item, upload a file, and confirm the link/image renders (a signed URL is fetched). Check the console for no storage 400/403s. Take a screenshot as proof.

- [ ] **Step 5: Run unit tests (guard against import/build breakage)**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/signedFile.jsx src/pages/Expenses.jsx src/components/expenses/ExpenseForm.jsx src/pages/Vendors.jsx src/components/vendors/VendorForm.jsx src/pages/Checklist.jsx src/components/wedding-mode/WeddingDayChecklist.jsx
git commit -m "feat(storage): render uploaded files via short-lived signed URLs"
```

---

## Task 5: One-time storage data-migration script

**Files:**
- Create: `scripts/migrate-storage-paths.mjs`

**Interfaces:**
- Consumes: legacy DB columns holding full public URLs (`expenses.receipt_url`, `vendors.contract_file_url`, `checklist_items.image_url`); bucket path convention from Task 2.
- Produces: those columns rewritten to `${wedding_id}/<flat-name>` object paths; objects moved accordingly. Idempotent.

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-storage-paths.mjs`:

```js
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
```

- [ ] **Step 2: Syntax check (no destructive action)**

Run: `node -c scripts/migrate-storage-paths.mjs`
Expected: no syntax errors. Do NOT run the script itself against the local (empty) DB — it is a deploy-time step (see the Verification summary).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-storage-paths.mjs
git commit -m "chore(storage): one-time script to move legacy files into per-wedding folders"
```

---

## Task 6: RLS role layer (migration 0017)

**Files:**
- Test: `tests/integration/security.test.js` (extend)
- Create: `supabase/migrations/0017_role_rls.sql`

**Interfaces:**
- Consumes: `is_platform_admin()`, `is_wedding_member(text)` (from 0006); `makeUser`, `makeWedding` (setup).
- Produces: `wedding_role(text)`, `can_write_wedding(text)`, `wedding_member_sides(text)`; SELECT-by-member + write-by-role policies on all wedding-scoped tables. Consumed by Task 7 (edge role checks) and Task 8 (anon revoke).

- [ ] **Step 1: Write the failing tests**

Append this block to `tests/integration/security.test.js`:

```js
describe('role-based write authorization', () => {
  let owner, family, em, w;
  beforeAll(async () => {
    owner = await makeUser(`ro-${Date.now()}@t.local`);
    family = await makeUser(`rf-${Date.now()}@t.local`);
    em = await makeUser(`re-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert([
      { wedding_id: w.id, user_id: owner.id, role: 'owner' },
      { wedding_id: w.id, user_id: family.id, role: 'family', wedding_sides: ['חתן'] },
      { wedding_id: w.id, user_id: em.id, role: 'event_manager' },
    ]);
  });

  it('family cannot write expenses', async () => {
    const { error } = await family.client.from('expenses')
      .insert({ id: `e-${Date.now()}`, wedding_id: w.id, vendor: 'V', category: 'x', amount: 5, status: 'pending' });
    expect(error).not.toBeNull();
  });

  it('family can add a guest on their own side but not another side', async () => {
    const ok = await family.client.from('guests')
      .insert({ id: `gf-${Date.now()}`, wedding_id: w.id, first_name: 'A', last_name: 'B', side: 'חתן' });
    expect(ok.error).toBeNull();
    const bad = await family.client.from('guests')
      .insert({ id: `gb-${Date.now()}`, wedding_id: w.id, first_name: 'C', last_name: 'D', side: 'כלה' });
    expect(bad.error).not.toBeNull();
  });

  it('event_manager can toggle a checklist item but not write guests', async () => {
    // checklist_items only requires title (the group column is "group" and is nullable).
    const item = await admin.from('checklist_items')
      .insert({ id: `ci-${Date.now()}`, wedding_id: w.id, title: 'X', completed: false })
      .select().single();
    const toggle = await em.client.from('checklist_items').update({ completed: true }).eq('id', item.data.id);
    expect(toggle.error).toBeNull();
    const { data: after } = await admin.from('checklist_items').select('completed').eq('id', item.data.id).single();
    expect(after.completed).toBe(true);

    const badGuest = await em.client.from('guests')
      .insert({ id: `ge-${Date.now()}`, wedding_id: w.id, first_name: 'E', last_name: 'M', side: 'חתן' });
    expect(badGuest.error).not.toBeNull();
  });

  it('owner has full write', async () => {
    const { error } = await owner.client.from('expenses')
      .insert({ id: `eo-${Date.now()}`, wedding_id: w.id, vendor: 'V', category: 'y', amount: 9, status: 'pending' });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:int -- security`
Expected: FAIL — under membership-only RLS, `family` and `event_manager` writes currently succeed (`error` is null where the test expects non-null).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0017_role_rls.sql`:

```sql
-- HIGH: RLS authorized on membership only; roles lived in the UI, so any member (even
-- 'family'/'event_manager') could write or destroy any wedding data via the client.
-- Add role helpers and split each wedding-scoped policy into member-SELECT + role-gated write.
-- NOTE: max_guests quota is intentionally NOT enforced here (stays UI-enforced).

create or replace function wedding_role(wid text) returns text
language sql stable security definer set search_path = public as $$
  select role from wedding_members where user_id = auth.uid() and wedding_id = wid;
$$;

create or replace function can_write_wedding(wid text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or wedding_role(wid) in ('owner','coplanner');
$$;

create or replace function wedding_member_sides(wid text) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(wedding_sides, '{}') from wedding_members
   where user_id = auth.uid() and wedding_id = wid;
$$;

-- Default tables: any member reads; only owner/coplanner (or platform admin) writes.
-- The permissive member-SELECT policy is OR'd with the FOR ALL write policy, so members who
-- are not writers can still read but not INSERT/UPDATE/DELETE.
do $$
declare t text;
begin
  foreach t in array array['tables','expenses','payments','gifts','vendors','checklist_groups','wedding_settings','activity_logs']
  loop
    execute format('drop policy if exists %1$s_scoped on %1$s;', t);
    execute format('create policy %1$s_select on %1$s for select using (is_platform_admin() or is_wedding_member(wedding_id));', t);
    execute format('create policy %1$s_write on %1$s for all using (can_write_wedding(wedding_id)) with check (can_write_wedding(wedding_id));', t);
  end loop;
end $$;

-- guests: owner/coplanner full write; family may write ONLY rows on their own sides.
drop policy if exists guests_scoped on guests;
create policy guests_select on guests for select
  using (is_platform_admin() or is_wedding_member(wedding_id));
create policy guests_write on guests for all
  using (
    can_write_wedding(wedding_id)
    or (wedding_role(wedding_id) = 'family' and side = any(wedding_member_sides(wedding_id)))
  )
  with check (
    can_write_wedding(wedding_id)
    or (wedding_role(wedding_id) = 'family' and side = any(wedding_member_sides(wedding_id)))
  );

-- checklist_items: owner/coplanner full write; event_manager may write (day-of toggles).
drop policy if exists checklist_items_scoped on checklist_items;
create policy checklist_items_select on checklist_items for select
  using (is_platform_admin() or is_wedding_member(wedding_id));
create policy checklist_items_write on checklist_items for all
  using (can_write_wedding(wedding_id) or wedding_role(wedding_id) = 'event_manager')
  with check (can_write_wedding(wedding_id) or wedding_role(wedding_id) = 'event_manager');
```

- [ ] **Step 4: Apply migrations and re-run the tests**

Run: `supabase db reset && npm run test:int -- security`
Expected: PASS — family blocked on expenses and other-side guests but allowed on own-side guests; event_manager can toggle checklist but not write guests; owner unrestricted.

- [ ] **Step 5: Run the full integration suite (guard existing CRUD/multitenant)**

Run: `npm run test:int`
Expected: PASS — existing owner/service-role-driven CRUD still works.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/security.test.js supabase/migrations/0017_role_rls.sql
git commit -m "feat(security): enforce wedding roles in RLS (tiered writes + per-side guests) (0017)"
```

---

## Task 7: Edge-function role check + bulk-update whitelist

**Files:**
- Modify: `supabase/functions/bulkUpdateGuestStatus/index.ts`
- Modify: `src/pages/Guests.jsx:351`
- Modify: `supabase/functions/iplanBulkImport/index.ts`

**Interfaces:**
- Consumes: `can_write_wedding` semantics (Task 6) — re-checked here via the user's own token as defense-in-depth.
- Whitelist note: the sole caller (WIWI RSVP sync, `Guests.jsx:341`) sends
  `{ id, phone, status, confirmed_people, total_people }`. `guests` has NO `rsvp_status`
  column, so the whitelist is those four fields (not the diagnosis's guessed `rsvp_status`).

- [ ] **Step 1: Harden `bulkUpdateGuestStatus`**

Replace the body of `supabase/functions/bulkUpdateGuestStatus/index.ts` (lines 15-21, from `const { updates } = ...` through the final return) with:

```ts
  const { updates, wedding_id } = await req.json();
  if (!Array.isArray(updates) || updates.length === 0)
    return Response.json({ error: 'No updates provided' }, { status: 400, headers: corsHeaders });
  if (!wedding_id)
    return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: corsHeaders });

  // Only owner/coplanner may bulk-update guests (defense-in-depth alongside RLS 0017).
  const { data: membership } = await supabase
    .from('wedding_members').select('role').eq('wedding_id', wedding_id).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'coplanner'].includes(membership.role))
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

  // Whitelist to the columns this sync legitimately updates; require id (update-only, no inserts).
  const ALLOWED = ['phone', 'status', 'confirmed_people', 'total_people'];
  const clean = [];
  for (const u of updates) {
    if (!u || typeof u !== 'object' || !u.id)
      return Response.json({ error: 'each update needs an id' }, { status: 400, headers: corsHeaders });
    const row = { id: u.id };
    for (const k of ALLOWED) if (k in u) row[k] = u[k];
    clean.push(row);
  }

  try {
    const { error } = await supabase.from('guests').upsert(clean);
    if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
    return Response.json({ updated: clean.length }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
```

- [ ] **Step 2: Pass `wedding_id` from the caller**

In `src/pages/Guests.jsx` (the WIWI sync handler, line 351), change the invoke call to:

```jsx
        await wedflow.functions.invoke('bulkUpdateGuestStatus', { updates, wedding_id: activeWeddingId });
```

(`activeWeddingId` is already in scope from `useWedding()` at the top of the component.)

- [ ] **Step 3: Add a role check to `iplanBulkImport`**

In `supabase/functions/iplanBulkImport/index.ts`, immediately after `const { newTableNames, tableUpdates, newGuests, wedding_id } = await req.json();` (line 14), insert:

```ts
    // Bulk seating import is destructive; require an owner/coplanner role even though RLS
    // (0017) already blocks lower roles from writing tables/guests.
    const { data: membership } = await supabase
      .from('wedding_members').select('role').eq('wedding_id', wedding_id).eq('user_id', user.id).maybeSingle();
    if (!membership || !['owner', 'coplanner'].includes(membership.role))
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
```

- [ ] **Step 4: Verify the functions serve without error**

Run: `supabase functions serve bulkUpdateGuestStatus --no-verify-jwt` (Ctrl-C after it reports "Serving"), then the same for `iplanBulkImport`.
Expected: each boots and prints a serving line with no TypeScript/Deno load errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bulkUpdateGuestStatus/index.ts src/pages/Guests.jsx supabase/functions/iplanBulkImport/index.ts
git commit -m "fix(security): role-check + column-whitelist bulk guest ops"
```

---

## Task 8: LOW hardening migration (0018)

**Files:**
- Test: `tests/integration/security.test.js` (extend)
- Create: `supabase/migrations/0018_hardening.sql`

**Interfaces:**
- Consumes: helpers from 0006 and 0017.
- Produces: `set_created_by()` with pinned `search_path`; membership/role helpers revoked from `anon`.

- [ ] **Step 1: Write the failing test**

Append this block to `tests/integration/security.test.js` (the `createClient` import is already at the top from Task 1):

```js
describe('anon RPC oracle is closed', () => {
  it('anon cannot call membership helpers', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc('is_platform_admin');
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:int -- security`
Expected: FAIL — anon currently has EXECUTE, so `.rpc('is_platform_admin')` returns `false` with no error.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0018_hardening.sql`:

```sql
-- LOW: pin search_path on the one definer function that lacked it.
create or replace function set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.jwt()->>'email'; end if;
  if new.created_by_id is null then new.created_by_id := auth.uid()::text; end if;
  return new;
end; $$;

-- LOW: remove membership/role helpers from the anon RPC surface. `authenticated` KEEPS
-- execute because RLS policies evaluate these during authenticated queries; revoking from
-- authenticated would break RLS. These helpers key off auth.uid() and only ever report the
-- caller's own status, so the practical leak is negligible — this is defense-in-depth.
revoke execute on function is_platform_admin() from anon;
revoke execute on function is_wedding_member(text) from anon;
revoke execute on function is_wedding_owner(text) from anon;
revoke execute on function wedding_role(text) from anon;
revoke execute on function can_write_wedding(text) from anon;
revoke execute on function wedding_member_sides(text) from anon;
```

- [ ] **Step 4: Apply migrations and re-run the test**

Run: `supabase db reset && npm run test:int -- security`
Expected: PASS — anon `.rpc('is_platform_admin')` now returns a permission-denied error.

- [ ] **Step 5: Full integration suite (confirm authenticated RLS still works)**

Run: `npm run test:int`
Expected: PASS — authenticated queries relying on these helpers in policies are unaffected.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/security.test.js supabase/migrations/0018_hardening.sql
git commit -m "fix(security): pin set_created_by search_path; drop anon RPC on membership helpers (0018)"
```

---

## Task 9: Env-driven CORS

**Files:**
- Modify: `supabase/functions/_shared/cors.ts`
- Modify: all 8 functions (`bulkUpdateGuestStatus`, `iplanBulkImport`, `createWeddingInviteLink`, `joinWeddingViaLink`, `getWeddingUsers`, `inviteUserToWedding`, `sendEmail`, `authEmailHook`)

**Interfaces:**
- Produces: `corsHeaders(req: Request)` (was a static object) reading `ALLOWED_ORIGINS`.

- [ ] **Step 1: Rewrite the shared CORS module**

Replace the entire contents of `supabase/functions/_shared/cors.ts` with:

```ts
// Env-driven CORS. ALLOWED_ORIGINS is a comma-separated list set in Supabase function
// secrets, e.g. "https://your-app.vercel.app,http://localhost:5173". Defaults to localhost
// dev when unset. The request Origin is echoed only if allow-listed; otherwise the first
// configured origin is returned (so disallowed origins are not granted access).
const DEFAULT_ORIGINS = ['http://localhost:5173'];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return DEFAULT_ORIGINS;
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = allowedOrigins();
  const allowedOrigin = allow.includes(origin) ? origin : allow[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}
```

- [ ] **Step 2: Update every function to compute `cors` per request**

The import line `import { corsHeaders } from '../_shared/cors.ts';` stays (it now imports the function). In each of the 8 function files, add `const cors = corsHeaders(req);` as the first statement inside `Deno.serve(async (req) => {` (before the OPTIONS check and any `try {`), then replace every remaining `headers: corsHeaders` with `headers: cors` in that file.

Example, `bulkUpdateGuestStatus/index.ts` top:

```ts
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const authHeader = req.headers.get('Authorization')!;
  // ... all subsequent `headers: corsHeaders` become `headers: cors`
```

- [ ] **Step 3: Verify CORS behavior with a preflight**

Serve one function in the background: `supabase functions serve getWeddingUsers`. Then:

```bash
curl -s -i -X OPTIONS http://localhost:54321/functions/v1/getWeddingUsers \
  -H "Origin: http://localhost:5173" | grep -i access-control-allow-origin
```
Expected: `access-control-allow-origin: http://localhost:5173`.

```bash
curl -s -i -X OPTIONS http://localhost:54321/functions/v1/getWeddingUsers \
  -H "Origin: https://evil.example" | grep -i access-control-allow-origin
```
Expected: `access-control-allow-origin: http://localhost:5173` (NOT `https://evil.example`).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/*/index.ts
git commit -m "fix(security): env-driven CORS allowlist across edge functions"
```

---

## Task 10: config.toml verify_jwt + password floor

**Files:**
- Modify: `supabase/config.toml:182` and the functions section
- Modify: `src/pages/AcceptInvite.jsx:51-53`

**Interfaces:**
- Produces: per-function `verify_jwt`; `minimum_password_length = 8`; client invite password floor of 8.

- [ ] **Step 1: Raise the password floor and pin per-function JWT verification in config**

In `supabase/config.toml`, change line 182 from `minimum_password_length = 6` to:

```toml
minimum_password_length = 8
```

Then append this functions block at the end of the file:

```toml
[functions.authEmailHook]
# Auth webhook: verifies its own signature and must accept unauthenticated calls from GoTrue.
verify_jwt = false

[functions.bulkUpdateGuestStatus]
verify_jwt = true
[functions.iplanBulkImport]
verify_jwt = true
[functions.createWeddingInviteLink]
verify_jwt = true
[functions.joinWeddingViaLink]
verify_jwt = true
[functions.getWeddingUsers]
verify_jwt = true
[functions.inviteUserToWedding]
verify_jwt = true
[functions.sendEmail]
verify_jwt = true
```

- [ ] **Step 2: Raise the client-side invite password floor to 8**

In `src/pages/AcceptInvite.jsx`, change the check at lines 51-53 to:

```jsx
    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
```

- [ ] **Step 3: Verify the password floor is enforced by Auth**

Restart the local stack so the auth config reloads: `supabase stop && supabase start`. Then run this throwaway check (e.g. `node --input-type=module` with dotenv, or a temp script):

```js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { error } = await c.auth.signUp({ email: `pw-${Date.now()}@t.local`, password: 'short12' }); // 7 chars
console.log(error?.message); // expect a "Password should be at least 8 characters" style error
```
Expected: a non-null password-length error.

- [ ] **Step 4: Run unit tests (AcceptInvite import guard)**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml src/pages/AcceptInvite.jsx
git commit -m "fix(security): raise password floor to 8; pin per-function verify_jwt"
```

---

## Task 11: Drop unused Stripe dependencies

**Files:**
- Modify: `package.json:53-54`

**Interfaces:** none.

- [ ] **Step 1: Confirm there are no Stripe imports**

Run: `grep -rn "@stripe\|stripe-js\|Stripe" src/`
Expected: no matches (already verified — `@stripe/*` is unused).

- [ ] **Step 2: Remove the dependencies**

Run: `npm uninstall @stripe/react-stripe-js @stripe/stripe-js`
Expected: the two lines are removed from `package.json` and `package-lock.json` updates.

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: build completes with no missing-module errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: drop unused @stripe dependencies"
```

---

## Verification summary (run before declaring done)

- [ ] `supabase db reset && npm run test:int` — all integration tests pass (escalation, storage scoping, role tiers, anon RPC, existing CRUD/multitenant).
- [ ] `npm run test:unit` — all unit tests pass.
- [ ] `npm run build` — production build succeeds.
- [ ] Manual app pass (preview): upload + view a receipt/contract/checklist image via signed URLs; confirm a `family`/`event_manager` user cannot perform an owner-only action in the UI and gets no console RLS errors on allowed actions.
- [ ] Deploy-time only: after 0016 + client changes ship, run `node scripts/migrate-storage-paths.mjs` once against the cloud DB, and set `ALLOWED_ORIGINS` in Supabase function secrets to your Vercel origin.
