# Owner invite links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform admin mint a single-use invite link that makes the joiner the wedding owner (member row `role='owner'` + transfer of `weddings.owner_id`), while a regular owner still cannot.

**Architecture:** Tighten the `wedding_invite_links` insert RLS so only platform admins can create `owner` rows (migration `0024`); allow `owner` in `createWeddingInviteLink` for platform admins only; make `joinWeddingViaLink` honor a stored `owner` role by promoting/inserting the membership and transferring `weddings.owner_id`; surface `owner` in the link dialog for platform admins with a warning.

**Tech Stack:** Supabase (Postgres 17 + RLS), Deno edge functions (`jsr:@supabase/supabase-js@2`), React + TanStack Query + shadcn/ui, Vitest integration tests against the local Supabase stack.

## Global Constraints

- Only platform admins may create/redeem `owner` links; a regular wedding owner may not.
- `owner` links never carry `wedding_sides`/`max_guests` — those apply only to `family` (unchanged).
- `wedding_invite_links` keeps **no** client select/update/delete policy; the only client write is INSERT, now role-restricted. All function reads/writes use the service role.
- A link may still never be redeemed twice (single-use); collaborator-link behavior is unchanged.
- Migrations are append-only; next number is `0024`.
- Edge functions are served locally by `npm run functions:serve` (NOT by `supabase start`); a NEW function dir needs a restart, edits to an existing one hot-reload. Function-dependent test blocks auto-skip when it isn't running.
- Test env export (before vitest):
  ```bash
  eval $(supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('export VITE_SUPABASE_URL='+j.API_URL);console.log('export VITE_SUPABASE_ANON_KEY='+j.ANON_KEY);console.log('export SUPABASE_SERVICE_ROLE_KEY='+j.SERVICE_ROLE_KEY);})")
  ```
- Branch: `feat/owner-invite-links` (already created off latest `main`). Commit after each task.

---

## File structure

- **Create** `supabase/migrations/0024_invite_links_owner_rls.sql` — restrict `wil_insert` so `owner` rows require platform admin.
- **Modify** `supabase/functions/createWeddingInviteLink/index.ts` — allow `owner` for platform admins only.
- **Modify** `supabase/functions/joinWeddingViaLink/index.ts` — honor stored `owner` role: promote membership + transfer `owner_id`; owner links skip the already-member short-circuit.
- **Modify** `src/pages/UserManagement.jsx` — link dialog uses `invitableRoles`, owner warning, corrected copy.
- **Modify** `tests/integration/security.test.js` — new `describe` for owner links.

---

## Task 1: Migration — restrict owner-link inserts to platform admins

**Files:**
- Create: `supabase/migrations/0024_invite_links_owner_rls.sql`
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Produces: `wil_insert` policy = `is_platform_admin() OR (is_wedding_owner(wedding_id) AND role <> 'owner')`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`:

```js
describe('invite-link owner insert RLS', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`orls-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  it('a wedding owner cannot directly insert an owner-role link', async () => {
    const { error } = await owner.client.from('wedding_invite_links').insert({
      id: `ilo-${Date.now()}`, wedding_id: w.id,
      token: `tko-${Date.now()}-${Math.round(performance.now())}`,
      role: 'owner', expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('a wedding owner can still directly insert a non-owner link', async () => {
    const { error } = await owner.client.from('wedding_invite_links').insert({
      id: `iln-${Date.now()}`, wedding_id: w.id,
      token: `tkn-${Date.now()}-${Math.round(performance.now())}`,
      role: 'coplanner', expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:int -- security.test.js -t "owner insert RLS"
```
Expected: FAIL on the first test — the current `wil_insert` policy allows any owner to insert an `owner` row, so `error` is null (not non-null).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0024_invite_links_owner_rls.sql`:

```sql
-- Owner-granting invite links may only be created by platform admins. The join function trusts a
-- stored role='owner' (it transfers ownership), so the *creation* path must be the gate. The
-- createWeddingInviteLink edge function enforces this, but the table also grants direct INSERT to
-- authenticated (0012) under a policy that ignored the role value — a wedding owner could insert a
-- role='owner' row directly via PostgREST. Tighten the insert policy so owners can only insert
-- non-owner links; platform admins (and the service role, which bypasses RLS) may insert any role.
-- There is no update/delete policy/grant on this table, so a non-owner role cannot be flipped later.
drop policy if exists wil_insert on wedding_invite_links;
create policy wil_insert on wedding_invite_links for insert with check (
  is_platform_admin()
  or (is_wedding_owner(wedding_id) and role <> 'owner')
);
```

- [ ] **Step 4: Apply the migration to the local DB**

```bash
export PGPASSWORD=postgres
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/migrations/0024_invite_links_owner_rls.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc "notify pgrst, 'reload schema';"
```
Expected: `DROP POLICY` then `CREATE POLICY`, no error.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:int -- security.test.js -t "owner insert RLS"
```
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_invite_links_owner_rls.sql tests/integration/security.test.js
git commit -m "feat(owner-links): restrict owner-link inserts to platform admins (RLS)"
```

---

## Task 2: `createWeddingInviteLink` — allow owner for platform admins only

**Files:**
- Modify: `supabase/functions/createWeddingInviteLink/index.ts` (the authorize block, currently lines 39–49)
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: `createWeddingInviteLink` body `{ wedding_id, role, wedding_sides?, max_guests? }`.
- Produces: returns `{ url, token, role, expires_at }` for allowed roles; `403` if caller is neither owner nor admin; `400` if `role` not allowed for the caller (owner allowed only for platform admins).

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js` (reuses the `FUNCTIONS` preflight const already defined earlier in the file):

```js
describe.skipIf(!FUNCTIONS)('owner-link creation authz', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`oca-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  it('a regular owner cannot create an owner link', async () => {
    const res = await owner.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role: 'owner' },
    });
    expect(res.error).not.toBeNull(); // 400: role not allowed for non-admin
  });

  it('a platform admin can create an owner link', async () => {
    const padmin = await makeUser(`opa-${Date.now()}@t.local`);
    await admin.from('profiles').update({ is_platform_admin: true }).eq('id', padmin.id);
    const res = await padmin.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role: 'owner' },
    });
    expect(res.error).toBeNull();
    expect(res.data.role).toBe('owner');
    expect(typeof res.data.token).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Ensure `npm run functions:serve` is running, then:
```bash
npm run test:int -- security.test.js -t "owner-link creation authz"
```
Expected: FAIL — currently `LINKABLE_ROLES` excludes `owner`, so the platform-admin case is rejected (`res.error` not null), failing `expect(res.error).toBeNull()`. (If SKIPPED, start the functions server.)

- [ ] **Step 3: Update the authorize block**

In `supabase/functions/createWeddingInviteLink/index.ts`, replace the authorize block (currently lines 39–49, from the `// --- Authorize` comment through its closing `}`) with:

```ts
    // --- Authorize: wedding owner (collaborator roles) or platform admin (any role) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    const { data: profile } = await service.from('profiles')
      .select('is_platform_admin').eq('id', user.id).maybeSingle();
    const isOwner = !!ownerMembership;
    const isPlatformAdmin = !!profile?.is_platform_admin;
    if (!isOwner && !isPlatformAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }
    // Only platform admins may mint owner-granting links (they transfer ownership on redeem).
    const allowedRoles = isPlatformAdmin ? ['owner', ...LINKABLE_ROLES] : LINKABLE_ROLES;
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: `role must be one of: ${allowedRoles.join(', ')}` }, { status: 400, headers: cors });
    }
```

Note: this makes the earlier top-of-function `role` validation against `LINKABLE_ROLES` redundant for non-admins but stricter here. If the file has an earlier `if (!LINKABLE_ROLES.includes(role))` guard (near the body-parse block), **delete that earlier guard** so it doesn't reject `owner` before this block runs. (Search the file for `LINKABLE_ROLES.includes` and keep only the `allowedRoles` check above.)

- [ ] **Step 4: Run test to verify it passes**

Functions hot-reload; re-run:
```bash
npm run test:int -- security.test.js -t "owner-link creation authz"
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/createWeddingInviteLink/index.ts tests/integration/security.test.js
git commit -m "feat(owner-links): allow owner role in createWeddingInviteLink for platform admins"
```

---

## Task 3: `joinWeddingViaLink` — honor owner role: promote + transfer ownership

**Files:**
- Modify: `supabase/functions/joinWeddingViaLink/index.ts`
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: an admin-created `owner` link token; `createWeddingInviteLink` returning `{ token }`.
- Produces: on redeeming an `owner` link, the joiner gets `wedding_members.role='owner'` and `weddings.owner_id === joiner.id`; response `{ wedding_id, couple_names, role: 'owner', already_member: false }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`:

```js
describe.skipIf(!FUNCTIONS)('owner-link redemption', () => {
  let padmin, w;
  beforeAll(async () => {
    padmin = await makeUser(`orp-${Date.now()}@t.local`);
    await admin.from('profiles').update({ is_platform_admin: true }).eq('id', padmin.id);
    w = await makeWedding(); // owner_id starts null
  });

  const ownerLink = async () => {
    const { data } = await padmin.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'owner' } });
    return data.token;
  };

  it('redeeming an owner link makes the joiner owner and transfers weddings.owner_id', async () => {
    const token = await ownerLink();
    const joiner = await makeUser(`orj-${Date.now()}@t.local`);
    const r = await joiner.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).toBeNull();
    expect(r.data.role).toBe('owner');

    const { data: mem } = await admin.from('wedding_members')
      .select('role').eq('wedding_id', w.id).eq('user_id', joiner.id).single();
    expect(mem.role).toBe('owner');
    const { data: wed } = await admin.from('weddings').select('owner_id').eq('id', w.id).single();
    expect(wed.owner_id).toBe(joiner.id);
  });

  it('an existing collaborator is promoted to owner (token is consumed)', async () => {
    const token = await ownerLink();
    const member = await makeUser(`orm-${Date.now()}@t.local`);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: member.id, role: 'coplanner' });
    const r = await member.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).toBeNull();
    expect(r.data.role).toBe('owner');
    expect(r.data.already_member).toBe(false);

    const { data: mem } = await admin.from('wedding_members')
      .select('role').eq('wedding_id', w.id).eq('user_id', member.id).single();
    expect(mem.role).toBe('owner');
    const { data: link } = await admin.from('wedding_invite_links').select('used_at').eq('token', token).single();
    expect(link.used_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:int -- security.test.js -t "owner-link redemption"
```
Expected: FAIL — the current join downgrades `owner → coplanner`, so `r.data.role` is `'coplanner'` and `owner_id` is unchanged. (Also the already-member short-circuit would return `already_member: true` for the promotion case.)

- [ ] **Step 3: Add `role` to the link lookup**

In `supabase/functions/joinWeddingViaLink/index.ts`, change the lookup select (line 30) to include `role`:

```ts
    const { data: link, error: linkError } = await service.from('wedding_invite_links')
      .select('id, wedding_id, role, used_at, revoked_at, expires_at').eq('token', token).maybeSingle();
```

- [ ] **Step 4: Gate the already-member short-circuit to non-owner links**

Replace the short-circuit block (currently lines 40–48) with:

```ts
    // Owner links transfer ownership even to an existing member, so they must NOT short-circuit.
    const isOwnerLink = link.role === 'owner';
    const { data: existingMembership } = await service.from('wedding_members')
      .select('id, role').eq('wedding_id', link.wedding_id).eq('user_id', user.id).maybeSingle();
    if (existingMembership && !isOwnerLink) {
      // Already a member of a collaborator link: return success WITHOUT consuming the token.
      const { data: w0 } = await service.from('weddings').select('couple_names').eq('id', link.wedding_id).maybeSingle();
      return Response.json({
        wedding_id: link.wedding_id, couple_names: w0?.couple_names ?? null,
        role: existingMembership.role, already_member: true,
      }, { headers: cors });
    }
```

- [ ] **Step 5: Replace the downgrade + insert with role-aware grant**

Replace the block from the `// Defensive: a link can never grant ownership` comment through the membership `insert` error handling (currently lines 72–82) with:

```ts
    // Stored role is trusted: owner links can only be created by platform admins (RLS 0024 +
    // createWeddingInviteLink), so honor role='owner' instead of downgrading it.
    const role = claimed.role;

    if (role === 'owner') {
      // Promote an existing member, or add a new owner membership.
      const memErr = existingMembership
        ? (await service.from('wedding_members')
            .update({ role: 'owner', wedding_sides: [], max_guests: null })
            .eq('id', existingMembership.id)).error
        : (await service.from('wedding_members')
            .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role: 'owner', wedding_sides: [], max_guests: null })).error;
      if (memErr) {
        return Response.json({ error: memErr.message }, { status: 500, headers: cors });
      }
      // Transfer canonical ownership (full handoff).
      const { error: transferErr } = await service.from('weddings')
        .update({ owner_id: user.id }).eq('id', claimed.wedding_id);
      if (transferErr) {
        return Response.json({ error: transferErr.message }, { status: 500, headers: cors });
      }
    } else {
      // Collaborator link: existingMembership is null here (the short-circuit returned earlier).
      const wedding_sides = role === 'family' ? (claimed.wedding_sides ?? []) : [];
      const max_guests = role === 'family' ? (claimed.max_guests ?? null) : null;
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role, wedding_sides, max_guests });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: cors });
      }
    }
```

The trailing block (lines 84–92: fetch `couple_names`, return `{ wedding_id, couple_names, role, already_member: false }`) stays unchanged and now reports the granted `role` (which may be `'owner'`).

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:int -- security.test.js -t "owner-link redemption"
```
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full security suite (no regressions)**

```bash
npm run test:int -- security.test.js
```
Expected: PASS — all prior invite-link tests (single-use join, revoke, list) plus the new owner tests; none skipped (functions server running).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/joinWeddingViaLink/index.ts tests/integration/security.test.js
git commit -m "feat(owner-links): join honors owner role — promote membership + transfer ownership"
```

---

## Task 4: UI — owner in the link dialog, warning, corrected copy

**Files:**
- Modify: `src/pages/UserManagement.jsx`
- Verify: browser preview (presentational; behavior covered by Tasks 1–3)

**Interfaces:**
- Consumes: `invitableRoles` (already defined: `isPlatformAdmin ? ['owner', ...INVITABLE_ROLES] : INVITABLE_ROLES`), `linkRole` state, `ROLE_LABELS`.

- [ ] **Step 1: Point the link dialog role dropdown at `invitableRoles`**

In `src/pages/UserManagement.jsx`, inside the invite-link dialog (currently line 493), change the role list from the hardcoded constant to the computed one:

```jsx
                      {invitableRoles.map(role => (
                        <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                      ))}
```

- [ ] **Step 2: Add an owner warning + fix the stale copy**

Replace the dialog intro paragraph (currently lines 481–483) with corrected single-use copy plus a conditional owner warning:

```jsx
            <p className="text-sm text-muted-foreground">
              כל מי שמקבל את הקישור יכול להצטרף לחתונה בעצמו, ללא צורך בהזמנה אישית. הקישור חד-פעמי — מתבטל אוטומטית לאחר שמישהו מצטרף דרכו, ותקף עד 14 יום.
            </p>
            {linkRole === 'owner' && (
              <p className="text-sm text-rose-deep bg-champagne border border-taupe/40 rounded-lg p-3">
                ⚠️ קישור זה מעניק בעלות מלאה על החתונה ומעביר את הבעלות למי שמצטרף דרכו. שמור אותו בזהירות.
              </p>
            )}
```

- [ ] **Step 3: Lint**

```bash
npx eslint src/pages/UserManagement.jsx
```
Expected: no new errors (the pre-existing `'user' is assigned but never used` warning may remain).

- [ ] **Step 4: Verify in the browser**

With the local stack + `npm run functions:serve` running, sign in as a **platform admin** owner (set `is_platform_admin=true` on the profile via the service role), open User Management → "צור קישור הזמנה":
1. The role dropdown now includes **בעל האירוע (owner)**.
2. Selecting it shows the warning block.
3. Create the owner link, copy the URL, open it in a second signed-in session → that user becomes owner; confirm `weddings.owner_id` transferred (check via the members list showing them as owner).
Then sign in as a **non-admin** owner and confirm the dropdown does **not** include owner.
Capture a screenshot of the dialog with owner selected + warning visible.

- [ ] **Step 5: Commit**

```bash
git add src/pages/UserManagement.jsx
git commit -m "feat(owner-links): expose owner in link dialog for admins + warning + fix stale copy"
```

---

## Self-review notes (author)

- **Spec coverage:** RLS linchpin (Task 1) ✔; create-side owner gate for admins only (Task 2) ✔; join-side promote + `owner_id` transfer, no downgrade, owner-link skips short-circuit (Task 3) ✔; UI dropdown/warning/copy fix (Task 4) ✔; all four spec tests present (owner-insert RLS, create authz, redemption+transfer, promotion) plus full-suite regression run ✔.
- **Placeholder scan:** none — every code step shows full code.
- **Type consistency:** `isOwnerLink`/`existingMembership` computed before the claim and reused after; `role = claimed.role` (no downgrade); `weddings.owner_id` transfer matches spec; `invitableRoles` name matches the existing definition in the file; response shape `{ wedding_id, couple_names, role, already_member }` unchanged.
- **Executor note:** Tasks 2 & 3 edit an existing function (hot-reload); no new function dir, so no `functions:serve` restart needed this time. Migration `0024` is applied via `psql` + `notify pgrst` (Task 1 Step 4).
