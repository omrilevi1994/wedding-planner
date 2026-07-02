# Multi-Tenant SaaS — Sub-project #1: Tenancy Foundation

**Date:** 2026-07-02
**Status:** Approved design, pending spec review
**Owner:** Omri Levi

## 0. Product vision & roadmap

Turn the wedding planner from a single-wedding admin tool into a **freemium
multi-tenant SaaS**: anyone signs up free → creates and owns weddings → invites
collaborators → manages everything in their own wedding. A platform-admin console
lets the operator (Omri) monitor/support all tenants. Payment arrives later as
feature flags gating premium capabilities.

This is several sub-projects, each with its own spec → plan → implementation:

1. **Tenancy foundation** (this spec) — ownership, membership, RLS re-model,
   self-serve signup, create-a-wedding onboarding, Resend SMTP, data migration.
2. **Per-wedding management** — invite/remove collaborators (email invites),
   role management, delete wedding, backup/export.
3. **Platform-admin console** — cross-tenant monitoring & support.
4. **Billing & feature flags** — freemium limits → paid gating.

Everything ships **free/unlocked** until #4.

## 1. Decisions (locked)

- **Multi-wedding:** a user can own several weddings and collaborate on others →
  a `wedding_members` join table is the backbone.
- **Per-wedding roles:** `owner` (creator: full control + delete + future
  billing), `coplanner` (full edit), `family` (limited to their `wedding_sides`,
  with a `max_guests` cap), `event_manager` (day-of WeddingMode view).
- **Existing data:** preserve "דניאל ועומרי" (Omri = owner; existing family /
  event-manager users become members); **delete** the "בר ותמיר" sample wedding
  and its data.
- **Email:** set up **Resend SMTP** now → real signup verification, password
  reset, and invite readiness. Google login stays.
- **Platform admin:** Omri (`is_platform_admin = true`) sees/manages all tenants.

## 2. Data model

**`weddings`** — add:
- `owner_id uuid references profiles(id)` (the creator).
(all existing columns kept; drop the row where `is_sample = true`.)

**`wedding_members`** — NEW (the tenancy backbone):
- `id text primary key default gen_random_uuid()::text`
- `wedding_id text references weddings(id) on delete cascade`
- `user_id uuid references profiles(id) on delete cascade`
- `role text not null` — `owner | coplanner | family | event_manager`
- `wedding_sides text[] default '{}'` (used by `family`)
- `max_guests int` (guest cap for `family`; null = unlimited)
- `created_date timestamptz default now()`, `updated_date timestamptz default now()`
- `unique (wedding_id, user_id)`
- indexes on `wedding_id` and `user_id`

**`profiles`** — change:
- **Add** `is_platform_admin boolean default false`.
- **Remove** per-wedding fields `wedding_id`, `wedding_sides`, `max_guests`,
  `is_approved` (they move to `wedding_members`). The old `role` column is
  replaced by `is_platform_admin` (platform-level only).
- Keep `id`, `email`, `full_name`, timestamps.

All other wedding-scoped tables (`guests`, `expenses`, …) are unchanged — still
keyed by `wedding_id`.

## 3. Security (RLS)

Replace the single-wedding helpers (`auth_wedding_id`) with membership-based ones:

```sql
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select is_platform_admin from profiles where id = auth.uid()), false);
$$;

create or replace function is_wedding_member(wid text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from wedding_members
                 where user_id = auth.uid() and wedding_id = wid);
$$;

create or replace function wedding_role(wid text) returns text
language sql stable security definer set search_path=public as $$
  select role from wedding_members where user_id = auth.uid() and wedding_id = wid;
$$;
```

Policies:
- **Wedding-scoped tables** (`guests`, `expenses`, `payments`, `gifts`, `vendors`,
  `checklist_groups`, `checklist_items`, `wedding_settings`, `activity_logs`,
  `tables`): `for all using (is_platform_admin() or is_wedding_member(wedding_id))
  with check (is_platform_admin() or is_wedding_member(wedding_id))`.
  (Role-based *write* restrictions — e.g. `family` limited to guests on their side
  — are deferred to sub-project #2 to keep this foundation focused; for now any
  member may write within their wedding.)
- **`weddings`**: `select` if `is_platform_admin() or is_wedding_member(id)`;
  `insert` allowed for any authenticated user with `check (owner_id = auth.uid())`;
  `update`/`delete` only `is_platform_admin() or owner_id = auth.uid()`.
- **`wedding_members`**: `select` your own rows + rows of weddings you belong to;
  `insert`/`update`/`delete` only by that wedding's owner or platform admin.
  (The owner's own membership row is created together with the wedding.)
- **`profiles`**: `select`/`update` self, or platform admin. (Reading other
  members' display names is handled by a `security definer` function in #2.)

RLS stays enabled on every table; grants to `anon`/`authenticated`/`service_role`
carry over (add for `wedding_members`).

## 4. Auth, signup & onboarding

- Providers: email/password + Google (both already enabled). Configure **Resend
  SMTP** in Supabase Auth → verification email on email/password signup, password
  reset. Google users are pre-verified.
- **Remove the approval gate.** `AuthContext` no longer blocks on `is_approved`.
- **Onboarding:** an authenticated user with **zero memberships** sees a
  "Create your wedding" screen (couple names + date, minimal). Submitting:
  1. `insert into weddings (…, owner_id = me)`
  2. `insert into wedding_members (wedding_id, user_id=me, role='owner')`
  3. select the new wedding → dashboard.
- **Login screen** gains a sign-up toggle (email/password + name) alongside the
  existing Google button.

## 5. Frontend refactor

The app currently reads `user.role` / `user.wedding_sides` / `user.max_guests`
**globally**. These become **per-active-wedding**, sourced from the active
membership:

- **`WeddingContext`**: load the user's weddings via `wedding_members` join
  (instead of the single `profiles.wedding_id`). Expose `activeWedding`,
  `activeMembership` (`role`, `wedding_sides`, `max_guests`), and
  `isPlatformAdmin`. `isAdmin` (used widely today) maps to
  `activeMembership.role in ('owner','coplanner')` OR `isPlatformAdmin`.
- **`Layout`**: event-manager redirect and family side-limit read from
  `activeMembership` rather than `user`.
- **`auth.me()` shim**: returns `{ id, email, full_name, is_platform_admin }`.
  Per-wedding role/limits are resolved by `WeddingContext` from the active
  membership, not from `auth.me()`.
- **New pages/components**: `CreateWedding` (onboarding) and a sign-up mode on
  `Login`.
- **`WeddingSelector`**: unchanged UX; now lists membership-derived weddings.

Consumers that read `user.role`/`user.wedding_sides` (Layout, WeddingSelector,
Guests quota, UserManagement, WeddingMode) are updated to read the active
membership. This is the main body of work.

## 6. Data migration

One migration + a backfill script:
1. Add `owner_id` to `weddings`; create `wedding_members`; add
   `is_platform_admin` to `profiles`.
2. Backfill `wedding_members` from current data: for each existing user with a
   former `wedding_id`, insert a membership with role mapped:
   old `user` → `family` (carry `wedding_sides`, `max_guests`); old
   `event_manager` → `event_manager`.
3. Set **Omri** as `owner` of "דניאל ועומרי" (insert owner membership +
   `weddings.owner_id`); set `profiles.is_platform_admin = true` for Omri (and
   danielsorero if desired as coplanner).
4. **Delete** the "בר ותמיר" wedding and all its child rows (cascade).
5. Drop the now-unused `profiles` columns after backfill.

Both local and cloud (`bbhbdmypcgdefyzkgzic`) get the migration; local first,
verified, then pushed to cloud via the established Management-API path.

## 7. Testing

- **Unit:** `WeddingContext` active-membership resolution; `isAdmin` mapping.
- **Integration (local Supabase):**
  - member sees only their weddings; non-member is blocked (0 rows).
  - platform admin sees all weddings.
  - any authenticated user can create a wedding and becomes its owner.
  - owner can delete their wedding; a non-owner member cannot.
  - a user with two weddings sees both in the selector.
- **E2E smoke:** sign up (email) → create wedding → dashboard; Google sign-up →
  create wedding.
- **Migration check:** "דניאל ועומרי" has Omri as owner + expected members;
  "בר ותמיר" is gone; guest counts intact for the kept wedding.

## 8. Out of scope (later sub-projects)

- Email **invites** to collaborators, role management UI, delete-wedding UI,
  backup/export (#2).
- Platform-admin **console** UI (#3) — this spec only adds the
  `is_platform_admin` flag + cross-tenant RLS bypass.
- **Billing / feature flags** (#4). Everything is unlocked now.
- Role-based **write** restrictions within a wedding (family write-scoping) —
  revisited in #2.

## 9. Risks

- **RLS re-model correctness** → covered by isolation/ownership integration tests.
- **Global→per-wedding refactor** may miss a consumer of `user.role` → grep all
  usages; tests on Layout/Guests/UserManagement/WeddingMode.
- **Resend setup** requires the user's API key; until set, email/password
  verification is the only blocked path (Google still works).
- **Destructive migration** (dropping columns, deleting a wedding) → run on local
  first, snapshot cloud data before applying.
