# fabel-5 Security Hardening — Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation plan
**Scope:** Full hardening pass — 2 CRITICAL, 1 HIGH, 1 MEDIUM, and all LOW findings from the fabel-5 security diagnosis.

## Background

A security review of the Supabase-backed wedding planner found the multi-tenant model
fundamentally sound (RLS on every wedding-scoped table; browser only ever holds the public
anon key) but with two holes that break cross-wedding isolation, plus role-blind
authorization inside a wedding and several hardening gaps.

This spec turns that diagnosis into concrete fixes. Each numbered item is an **independent
work unit** with its own migration/edit and its own test, landing on `main` in risk order
(matches the one-agent-per-bug workflow). Migration numbers continue from the current head
(`0014`).

### Decisions locked during brainstorming

- **Scope:** everything, including LOW-severity hardening.
- **Existing data:** there are real uploaded files in the `uploads` bucket with public URLs
  in live DB rows → a one-time data migration is required (not go-forward-only).
- **Role enforcement:** comprehensive, at the **RLS layer** (not edge-function-only), so
  client-side operations are also protected.
- **Role fidelity:** tiered writes + per-side guest filtering in RLS; the `max_guests`
  quota **stays UI-enforced** (an accepted, documented gap — no fragile quota trigger).
- **Storage read model:** store the object **path** in DB columns and mint a short-lived
  **signed URL** at render/click time (bucket goes private).
- **CORS:** env-driven allowlist (`ALLOWED_ORIGINS`), default localhost.
- **Password floor:** raise to 8 characters.

### Effective role model (extracted from current UI)

| Role | Intended capability |
|---|---|
| `owner` | Full control + member management + delete wedding |
| `coplanner` | Full write on wedding data; no member mgmt, no danger zone |
| `family` | Only guests on their `wedding_sides`, capped by `max_guests` |
| `event_manager` | Locked to WeddingMode (day-of); toggles `checklist_items.completed` |

`is_platform_admin()` is a master bypass across the whole schema (unchanged; intentional).

---

## 1. CRITICAL — Profiles privilege escalation

**File:** `supabase/migrations/0015_protect_profile_privileged_cols.sql`

**Root cause:** `profiles_self_update` (0008_fix_profiles_rls.sql:16) has a `USING` clause but
no `WITH CHECK`. Postgres reuses `USING` (`id = auth.uid()`) to validate the new row, so a
user can PATCH any other column on their own row — including `is_platform_admin`, which is
the platform-wide master bypass. Exploit is one line in the browser console with the app's
own client.

**Fix:**
- Add a `BEFORE UPDATE` trigger `protect_profile_privileged_cols()` on `profiles`: if the
  caller is not already a platform admin, force `NEW.is_platform_admin := OLD.is_platform_admin`
  and `NEW.email := OLD.email`. Security definer, `search_path = public`.
- Recreate `profiles_self_update` with `WITH CHECK (id = auth.uid() OR is_platform_admin())`
  as defense-in-depth.

Trigger (rather than `WITH CHECK` column-pinning alone) because it is robust against
OLD/NEW comparison edge cases and simultaneously closes the **email-column /
invite-squatting** LOW finding (a user can no longer repoint their profile email at an
unregistered address).

**Test:** a non-admin `update({ is_platform_admin: true })` on their own row leaves the flag
`false`; a non-admin email change is rejected/ignored; an existing platform admin can still
set the flag and change emails.

---

## 2. CRITICAL — Storage privatization

The `uploads` bucket is `public = true` with a SELECT policy of `using (bucket_id = 'uploads')`
(no auth, no wedding scoping), and files live at flat, guessable paths `${Date.now()}-${name}`
(0003_storage.sql, wedflowClient.js:131). So every wedding's receipts, contracts, and
checklist images are world-readable and enumerable via `storage.from('uploads').list('')`.
The DB columns holding the URLs are correctly RLS-scoped, but the file bytes are not.

Four parts:

### 2a. Migration — `supabase/migrations/0016_storage_private.sql`
- `update storage.buckets set public = false where id = 'uploads';`
- Drop `"public read uploads"` and `"auth upload"`.
- New policies on `storage.objects` for the `uploads` bucket, all gated on
  `is_platform_admin() OR is_wedding_member((storage.foldername(name))[1])`:
  - `insert` (to `authenticated`)
  - `select`
  - `update`
  - `delete`

  `(storage.foldername(name))[1]` is the first path segment = `wedding_id`.

### 2b. Upload path — `src/api/wedflowClient.js`
- `UploadFile({ file, weddingId })` → `path = ${weddingId}/${crypto.randomUUID()}-${file.name}`.
- **Store the object path** in the DB column (not a public URL). Return `{ file_path }`.
- Add `getSignedUrl(path)` to the `Core` integration: `createSignedUrl(path, 3600)` (1-hour
  TTL — long enough for a viewing session, short enough that a leaked URL expires).
- Three call sites pass `weddingId` and persist the path:
  `src/components/expenses/ExpenseForm.jsx`, `src/components/vendors/VendorForm.jsx`,
  `src/pages/Checklist.jsx`.

### 2c. Read sites — resolve signed URLs at render/click time
Every place that renders a stored file reference switches from using a public URL directly
to resolving a signed URL from the stored path:
- `src/components/expenses/ExpenseForm.jsx`, `src/pages/Expenses.jsx` (`receipt_url`)
- `src/components/vendors/VendorForm.jsx`, `src/pages/Vendors.jsx` (`contract_file_url`)
- `src/pages/Checklist.jsx`, `src/components/wedding-mode/WeddingDayChecklist.jsx` (`image_url`)

Links resolve on click; images resolve on mount (small shared hook/util).

### 2d. One-time data migration script (Node + service role)
For each `expenses.receipt_url`, `vendors.contract_file_url`, `checklist_items.image_url`
that holds a legacy public URL:
1. Parse the flat object path from the URL.
2. Look up the row's `wedding_id`.
3. `storage.from('uploads').move(oldPath, ${weddingId}/${oldPath})`.
4. Rewrite the DB column to the new path.

Files present in the bucket but referenced by no row are **logged and left in place** for
manual review — not auto-deleted. Script is idempotent (skip rows already holding a
`weddingId/…` path). Run manually as part of the deploy for this change.

**Test:** as a non-member, fetching a signed/guessed path under another wedding's folder is
denied; `list('')` and `list('<other-wedding-id>')` return nothing.

---

## 3. HIGH — RLS role layer

**File:** `supabase/migrations/0017_role_rls.sql`

**Root cause:** wedding-scoped policies authorize on membership only
(0006_multitenant.sql:61); roles are enforced only in the UI. So the lowest-privilege
`family` member can, with their normal token, directly wipe the seating plan (client-side
deletes/updates on `tables`/`guests`) or rewrite every guest.

**Fix:**
- Helpers (security definer, `search_path = public`):
  - `wedding_role(wid text)` → the caller's `role` in that wedding (or null).
  - `can_write_wedding(wid text)` → `is_platform_admin() OR wedding_role(wid) IN ('owner','coplanner')`.
  - `wedding_member_sides(wid text)` → the caller's `wedding_sides` for that wedding.
- Replace each wedding-scoped `_scoped FOR ALL` policy with a `SELECT` policy (any member)
  plus write policies:
  - Default tables (`expenses`, `payments`, `gifts`, `vendors`, `tables`,
    `checklist_groups`, `wedding_settings`, `activity_logs`): writes require
    `can_write_wedding(wedding_id)`.
  - `guests`: `can_write_wedding(wedding_id)` **OR** (`wedding_role = 'family'` AND
    `side = ANY(wedding_member_sides(wedding_id))`). Applies to INSERT/UPDATE/DELETE.
  - `checklist_items`: writes require `can_write_wedding(wedding_id)` **OR**
    `wedding_role = 'event_manager'` (day-of `completed` toggles).
- `SELECT` on all wedding-scoped tables remains: `is_platform_admin() OR is_wedding_member(wedding_id)`.

**Consequence:** client-side seating reset by `family`/`event_manager` is now blocked at the
DB — no new edge function needed.

**Accepted gap:** `max_guests` quota is *not* enforced in RLS (a family member could, at the
DB level, insert more than their quota of same-side guests). This remains UI-enforced by
design; documented here so it is a known limitation, not a silent one.

**Edge-function role checks:** `bulkUpdateGuestStatus` and `iplanBulkImport` add a
`can_write` role check up front (owner/coplanner/platform-admin), returning 403 otherwise —
defense-in-depth alongside RLS.

**Test (`tests/integration/security.test.js`):**
- `family` cannot write `tables`, `expenses`, or a guest on a side outside their
  `wedding_sides`; **can** write a guest on their own side.
- `event_manager` cannot write `guests`/`expenses`; **can** toggle a `checklist_items` row.
- `coplanner`/`owner` have full write.

---

## 4. MEDIUM — `bulkUpdateGuestStatus` hardening

**File:** `supabase/functions/bulkUpdateGuestStatus/index.ts`

Currently does a blind `upsert(updates)` on arbitrary objects (index.ts:19): any column on
any guest can be set, new rows can be inserted, and there is no try/catch.

**Fix:**
- Whitelist each update object to the columns the sole caller (WIWI RSVP sync) legitimately
  sets: `phone`, `status`, `confirmed_people`, `total_people`. (The `guests` table has NO
  `rsvp_status` column — the diagnosis's guessed whitelist was wrong.)
- Require `id` on every entry; reject the request if any entry lacks one (update-only — no
  implicit inserts).
- Wrap the DB call in try/catch and return a clean 400 on failure.
- Add the `owner`/`coplanner` role check (item 3), which needs `wedding_id` plumbed through
  from the caller (`Guests.jsx`).

**Test:** a request without `id` is rejected; extra columns are stripped; a valid batch
succeeds for owner/coplanner and is 403 for lower roles.

---

## 5. LOW — Hardening

**Migration `supabase/migrations/0018_hardening.sql`:**
- Pin `search_path = public` on `set_created_by()` (0005_created_by.sql) — every other
  definer function already has one.
- `REVOKE EXECUTE` on the membership/role helpers (`is_wedding_member`, `is_wedding_owner`,
  `wedding_role`, `can_write_wedding`, `wedding_member_sides`, `is_platform_admin`) from
  `anon` **only**. `authenticated` must retain EXECUTE because RLS policies evaluate these
  during authenticated queries; revoking from `authenticated` would break RLS. The helpers
  key off `auth.uid()` and only ever report the caller's own status, so the practical leak
  is negligible — this closes the anon-facing RPC surface as defense-in-depth.

**CORS — `supabase/functions/_shared/cors.ts`:**
- Replace the static wildcard object with `corsHeaders(req)` that reads `ALLOWED_ORIGINS`
  (comma-separated env var), echoes the request `Origin` if it is in the list, and denies
  otherwise. Default to `http://localhost:5173` (dev) when the env var is unset.
- Update every function to call `corsHeaders(req)` for both the preflight and the response.
- Operator sets the real Vercel origin in Supabase function secrets at deploy time.

**`supabase/config.toml`:**
- Pin `verify_jwt` per function: `authEmailHook = false` (webhook; verifies its own signature
  and fails closed), all other functions `true`.
- Set `minimum_password_length = 8`.

**Client:** raise the invite-accept password minimum from 6 to 8 (validation + copy).

**`package.json`:** drop the unused `@stripe/*` dependencies — no Stripe billing is wired up;
shrinks the bundle. (Verified: no `@stripe` imports in `src/`.)

---

## Testing & tooling

- Test runner: vitest — `npm run test:unit`, `npm run test:int`.
- RLS/role and storage-denial assertions live in a new `tests/integration/security.test.js`
  against the local Supabase stack.
- The `supabase-schema-change` skill covers the migration → RLS → grants → test loop; the
  `run-local` skill starts the stack; the `deploy` skill pushes migrations + functions and
  deploys the frontend. The storage data-migration script (2d) is run manually during the
  deploy of item 2.

## Implementation order

1. #1 Profiles trigger (`0015`) — smallest, ships first.
2. #2 Storage privatization (`0016` + client + data script).
3. #3 RLS role layer (`0017`) + edge role checks.
4. #4 `bulkUpdateGuestStatus` hardening.
5. #5 LOW hardening (`0018` + CORS + config + client + package cleanup).

## Out of scope / accepted gaps

- `max_guests` quota enforcement stays in the UI (no DB trigger).
- Unreferenced ("orphaned") storage files are logged, not auto-deleted.
- `is_platform_admin()` remaining a full master bypass is intentional.
