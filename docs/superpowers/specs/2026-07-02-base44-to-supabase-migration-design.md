# Migration: base44 → Supabase + Vercel

**Date:** 2026-07-02
**Status:** Approved design, pending spec review
**Owner:** Omri Levi

## 1. Goal

Move the wedding-planner app off base44 (a hosted BaaS) onto a self-owned,
free-tier stack: **Supabase** (database, auth, storage, edge functions) +
**Vercel** (frontend hosting). All current functionality must keep working, the
real data must be migrated, and the result must be fast, reliable, and tested.

## 2. Constraints & success criteria

- **Free:** Stay within Supabase Free (500MB DB, 1GB storage, 2 edge-function
  invocation limits) and Vercel Hobby tiers. No paid add-ons. A guardrail note
  in the repo documents the free-tier limits and how to watch them.
- **All functionality works:** Every page and feature that works on base44 today
  works after migration. Verified by tests + a manual smoke checklist.
- **Fast:** Frontend served from Vercel CDN; DB queries indexed on the columns
  the app filters by (`wedding_id`, `table_id`, `status`, `order`).
- **Reliable:** Automated tests (unit + integration against local Supabase, plus
  a small e2e smoke suite). CI runs them on every push.
- **Repeatable:** Recurring operational workflows are captured as Claude skills
  (see §11) so future changes are consistent.
- **Agent-operable:** After a one-time credential setup by the user, the whole
  stack is driven via CLI (Supabase CLI, Vercel CLI) non-interactively.

## 3. Target architecture

```
┌──────────────┐        ┌─────────────────────────────────────────┐
│    Vercel    │        │              Supabase (free)             │
│ (Hobby, free)│        │                                          │
│  Vite/React  │──────▶ │  Postgres  (12 tables + RLS policies)    │
│   frontend   │  HTTPS │  Auth      (Google + email/password)     │
│  (static)    │        │  Storage   (receipts, vendor files)      │
│              │        │  Edge Fns  (Deno: ported + new)          │
└──────────────┘        └─────────────────────────────────────────┘
```

- Frontend: static Vite build, deployed to Vercel. Env: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.
- Backend: Supabase project. Secrets for edge functions: `ANTHROPIC_API_KEY`
  (AI import), service-role key (auto), Telegram token (future).

## 4. Compatibility-shim strategy (core idea)

All ~90 backend calls route through `src/api/base44Client.js`. We rewrite **only
that file** to expose the same API surface backed by Supabase, so component code
is essentially untouched.

Surface the shim must reimplement (measured from current usage):

- `entities.<Name>.list(sort)` — `.get(id)`, `.filter(query, sort)`,
  `.create(data)`, `.update(id, data)`, `.delete(id)`, `.bulkCreate(arr)`,
  `.bulkUpdate(arr)`
- `auth.me()`, `auth.logout()`, `auth.isAuthenticated()`, `auth.redirectToLogin()`
- `integrations.Core.UploadFile({ file })` → returns `{ file_url }`
- `integrations.Core.ExtractDataFromUploadedFile({...})` → edge fn (Claude)
- `functions.invoke(name, body)` → `supabase.functions.invoke`
- `appLogs.logUserInApp()` → no-op
- `users.inviteUser(...)` → edge fn (admin invite)

**Sort syntax compatibility:** base44 uses a string sort arg where a leading `-`
means descending (`'-created_date'`, `'order'`, `'name'`, `'due_date'`). The shim
parses this into Supabase `.order(col, { ascending })`.

**Filter compatibility:** base44 `filter(query)` takes an object of equality
matches (e.g. `{ wedding_id }`). The shim maps each key to `.eq(key, value)`.

## 5. Data model

Each of the 12 entity `.jsonc` schemas → one Postgres table:

`weddings, guests, tables, expenses, payments, gifts, checklist_groups,
checklist_items, vendors, wedding_settings, activity_logs, profiles`

(`profiles` replaces base44's `User` entity for app-level fields; auth identity
lives in Supabase `auth.users`.)

**System-field compatibility (critical):** confirmed from live base44 records,
every row carries these system fields, which the frontend reads. Tables expose
these exact columns:

- `id text primary key` — see ID strategy below
- `created_date timestamptz default now()`
- `updated_date timestamptz default now()` (trigger-updated)
- `created_by text` — creating user's **email** (frontend reads this)
- `created_by_id text` — creating user's **id** (present in REST payloads)
- `is_sample boolean default false` — base44 demo-data flag present on all rows;
  preserved so we can distinguish/clean sample records after migration

**ID strategy:** base44 IDs are opaque strings and are referenced across tables
(`wedding_id`, `table_id`, checklist `group`). To migrate with zero remapping, use
`id text primary key` and **import exported rows keeping their original IDs**. New
rows generated after migration use `gen_random_uuid()::text`.

**Indexes:** on `wedding_id` for every wedding-scoped table, plus `guests.table_id`,
`guests.status`, `checklist_items.group`, and `order` columns used for sorting.

## 6. Auth & RLS

- Supabase Auth providers: **Google OAuth + email/password**, enabled from the
  start.
- `profiles` table keyed by `auth.uid()`, modeled on the live base44 `User`
  entity (6 users: 2 admin, 3 user, 1 event_manager):
  - `role` (admin | user | event_manager) — matches base44's enum
  - `wedding_id text` (null for top-level admin)
  - `wedding_sides text[]` (which wedding sides the user may see/edit)
  - `max_guests int` (per-user guest cap; null = unlimited)
  - `is_approved boolean` (approved by admin/event_manager)
  - `full_name`, `email`
  Auto-created on signup via a Postgres trigger on `auth.users`; the migration
  seeds these rows from base44's User export (matched by email).
- `auth.me()` returns the session user merged with their profile row — same shape
  the app expects today (`user.role`, `user.wedding_id`, `user.wedding_sides`).
- **RLS:** each entity's base44 `rls` block is translated to Postgres RLS
  policies. base44's `{{user.data.wedding_id}}` → a subquery/`auth.uid()` join to
  `profiles`; `user_condition.role == admin` → a role check against `profiles`.
  Admin bypass preserved. RLS is enabled on every table.

## 7. Edge functions (Deno)

Ported from `base44/functions/` (swap `@base44/sdk` → Supabase client + service
role where needed):

Base44 actually has **6** backend functions (the local repo export only included
4 — the REST reference revealed 2 more). Source exists locally for the first 4;
the last 2 are reimplemented from their documented purpose.

- `bulkUpdateGuestStatus` — ported (source available)
- `resetSeatingPlan` — ported (source available)
- `iplanBulkImport` — ported (source available)
- `inviteUserToWedding` — reimplemented (invite via Supabase admin API + profile)
- `getWeddingUsers` — reimplemented (list users/profiles for a wedding)
- `extractGuestData` — **new**; wraps the Claude API to replace base44's
  `ExtractDataFromUploadedFile`. API key stays server-side.
- `sendTelegramChecklistUpdate` — **deferred** (out of scope this phase).

Note: source code for the 2 previously-unknown functions is not downloadable via
REST (only invocable); if their exact behavior matters, we can observe their
input/output by invoking them against base44 before reimplementing.

## 8. AI guest-list import

`extractGuestData` edge function receives an uploaded file reference, sends its
contents to the Claude API, and returns structured guest rows matching the
`Guest` schema. Replaces the single `ExtractDataFromUploadedFile` call in
`src/pages/Guests.jsx`.

## 9. Data migration

Base44 exposes a REST API (`https://straight-wedding-plan-pro.base44.app/api`,
header `api_key`), so migration is a **direct API pull** — no manual dashboard
export needed. Verified live record counts:

| Entity | Rows | | Entity | Rows |
|---|---|---|---|---|
| Wedding | 2 | | Gift | 12 |
| Guest | 352 | | Vendor | 11 |
| Table | 26 | | ChecklistGroup | 12 |
| Expense | 28 | | ChecklistItem | 99 |
| Payment | 40 | | WeddingSetting | 2 |
| ActivityLog | 1000+ | | User | 6 |

(All trivially within Supabase Free limits.)

Process:
1. A Node script pulls every entity from the base44 REST API (paginated) to local
   JSON snapshots (git-ignored — contains PII).
2. The same script (or a second pass) inserts into Supabase via the service-role
   key, preserving original IDs and parent-before-child order (weddings → tables
   → guests → gifts/payments, groups → items).
3. `profiles` seeded from the User export, matched to `auth.users` by email.
4. `ActivityLog` is low-value, high-volume — migrate only the most recent N (e.g.
   200) or skip; decided in the plan.
5. Verify: per-table counts match the snapshot; spot-check that a guest's
   `table_id` and `wedding_id` resolve.

**Soft-deletes:** base44 soft-deletes (has `/restore`). The REST pull returns
only live records, so we import a clean set; our app uses hard deletes in
Postgres (simpler; matches the frontend's expectation that a deleted row is gone).

## 10. Testing & reliability

- **Unit:** Vitest for the compatibility shim (sort parsing, filter mapping,
  auth shape) and pure utils.
- **Integration:** run against **local Supabase** (Docker) — real schema, real
  RLS. Cover CRUD per entity, RLS enforcement (guest cannot read another
  wedding), and each edge function.
- **E2E smoke:** a small Playwright suite covering critical flows (login, add
  guest, seat guest, add expense, dashboard totals) against a local build.
- **CI:** GitHub Actions runs unit + integration on every push; blocks merge on
  failure.
- **Manual smoke checklist:** a documented per-page checklist run once against
  the deployed Vercel preview before go-live.

## 11. Skills to create (repeatable workflows)

Captured as Claude skills in the repo so future work is consistent:

- **`supabase-schema-change`** — add/alter an entity: table + RLS + indexes +
  shim entry + migration + test.
- **`deploy`** — build, run tests, push DB migrations, deploy edge functions,
  deploy frontend to Vercel, verify.
- **`run-local`** — start local Supabase + Vite dev with correct env for
  development and testing.
- **`base44-data-import`** — re-run/extend the data import from a base44 export.

(Exact skill set finalized during implementation; these are the anticipated
recurring workflows.)

## 12. Credentials the user must provide (one-time)

Unavoidable — I cannot log into accounts on your behalf:

1. **Supabase:** create a free account + project; provide a **personal access
   token** (`SUPABASE_ACCESS_TOKEN`) and the project ref. Enable Google OAuth
   (needs Google client id/secret) — email/password works with no extra setup.
2. **Vercel:** create a free account; provide a **token** (`VERCEL_TOKEN`).
3. **Anthropic:** an `ANTHROPIC_API_KEY` for the AI import edge function.
4. **base44:** ✅ already provided — REST `api_key` + appId. Used for the data
   pull. **Security:** this key was shared in plaintext chat; rotate/revoke it in
   base44 once migration is complete.

All tokens stored locally in `.env` (git-ignored); never committed.

## 13. Build order (phases)

0. **Prereqs:** install Supabase + Vercel CLIs; user supplies credentials.
1. **Schema:** migrations for 12 tables + RLS + indexes + triggers; verify on
   local Supabase.
2. **Shim + auth:** rewrite `base44Client.js`; wire Supabase auth (Google +
   email); app runs locally against local Supabase (empty DB).
3. **Edge functions + AI import:** port 3 functions, add `extractGuestData` and
   `inviteUser`.
4. **Tests + CI:** unit, integration, e2e smoke, GitHub Actions.
5. **Data migration:** export from base44 → import → verify.
6. **Deploy:** push to cloud Supabase, deploy functions, deploy to Vercel,
   configure env, run manual smoke checklist.
7. **Skills:** author the skills in §11 from the now-proven workflows.

## 14. Out of scope (this phase)

- **Billing / paid feature gating** — the eventual "pay to access features" SaaS
  model. The `profiles`/auth model is designed not to block it (a future
  `subscriptions` table + paywall), but no billing is built now.
- **Telegram notifications** (`sendTelegramChecklistUpdate`).
- Stripe dependencies are currently unused; left in place, wired up only when
  billing is built.

## 15. Risks & mitigations

- **RLS translation subtlety** → cover with integration tests that assert
  cross-wedding isolation and admin bypass.
- **Field-name/shape drift from base44** (`created_date`, sort strings) →
  encoded explicitly in the shim + unit tests.
- **Free-tier limits** → documented; DB size and function invocations watched;
  data volume (one wedding) is far under limits.
- **AI extraction parity** → validate `extractGuestData` output against the
  `Guest` schema; fall back to manual entry if parsing fails.
