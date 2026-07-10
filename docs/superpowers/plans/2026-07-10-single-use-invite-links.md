# Single-use invite links + management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wedding invite links single-use (consumed on first join) with a 14-day safety expiry, and give owners a panel to see and revoke outstanding links.

**Architecture:** Add `used_at` / `used_by` / `revoked_at` columns to `wedding_invite_links`. `joinWeddingViaLink` claims the token with a single atomic `UPDATE ... WHERE used_at IS NULL` before granting membership. Two new owner/admin-gated edge functions (`listWeddingInviteLinks`, `revokeWeddingInviteLink`) manage links via the service role; the token is never returned to clients after creation. A React panel in `UserManagement.jsx` lists status and revokes.

**Tech Stack:** Supabase (Postgres 17 + RLS), Deno edge functions (`jsr:@supabase/supabase-js@2`), React + TanStack Query + shadcn/ui, Vitest integration tests against the local Supabase stack.

## Global Constraints

- A link may **never** grant `owner`; `createWeddingInviteLink` already downgrades and `joinWeddingViaLink` re-downgrades `owner → coplanner`. Keep this.
- `wedding_sides` / `max_guests` apply **only** to the `family` role; all other roles get `[]` / `null`.
- `wedding_invite_links` keeps **no client select/update/delete RLS policy** — clients must never read `token`. All reads/writes go through service-role edge functions.
- Tokens are returned to the client **once**, at creation. `list` must never include a `token` field.
- All new edge functions use `verify_jwt = true` and additionally call `supabase.auth.getUser()` as the real gate.
- Migrations are append-only, numbered; next number is `0023`.
- Edge functions are served locally by `npm run functions:serve` (NOT by `supabase start`). Integration tests that invoke functions require it running; without it those `describe` blocks auto-skip.
- Env for tests (export before running vitest):
  ```bash
  eval $(supabase status -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('export VITE_SUPABASE_URL='+j.API_URL);console.log('export VITE_SUPABASE_ANON_KEY='+j.ANON_KEY);console.log('export SUPABASE_SERVICE_ROLE_KEY='+j.SERVICE_ROLE_KEY);})")
  ```
- Branch: `feat/single-use-invite-links` (already created). Commit after each task.

---

## File structure

- **Create** `supabase/migrations/0023_invite_links_single_use.sql` — the three new columns.
- **Modify** `supabase/functions/joinWeddingViaLink/index.ts` — already-member short-circuit + atomic single-use claim + precise errors.
- **Modify** `supabase/functions/createWeddingInviteLink/index.ts` — TTL 2 → 14 days.
- **Create** `supabase/functions/revokeWeddingInviteLink/index.ts` — owner/admin revoke by id.
- **Create** `supabase/functions/listWeddingInviteLinks/index.ts` — owner/admin list without token.
- **Modify** `supabase/config.toml` — `verify_jwt = true` for the two new functions.
- **Modify** `src/api/wedflowClient.js` — `weddingInviteLinks.list()` / `.revoke()`.
- **Modify** `src/pages/UserManagement.jsx` — pending-links panel.
- **Modify** `tests/integration/security.test.js` — new `describe` blocks.

---

## Task 1: Migration — single-use columns + atomic-claim primitive

**Files:**
- Create: `supabase/migrations/0023_invite_links_single_use.sql`
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Produces: columns `wedding_invite_links.used_at timestamptz`, `.used_by uuid`, `.revoked_at timestamptz`. Redeemable predicate: `used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
// (admin, makeUser, makeWedding already imported at top of file)

describe('invite-link single-use DB primitive', () => {
  let w;
  beforeAll(async () => { w = await makeWedding(); });

  const makeLink = async (over = {}) => {
    const row = {
      id: `il-${Date.now()}-${Math.round(performance.now())}`,
      wedding_id: w.id,
      token: `tok-${Date.now()}-${Math.round(performance.now())}`,
      role: 'coplanner',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      ...over,
    };
    const { data, error } = await admin.from('wedding_invite_links').insert(row).select().single();
    if (error) throw error;
    return data;
  };

  it('new columns default to null (link starts redeemable)', async () => {
    const link = await makeLink();
    expect(link.used_at).toBeNull();
    expect(link.used_by).toBeNull();
    expect(link.revoked_at).toBeNull();
  });

  it('atomic claim succeeds once and returns no row the second time', async () => {
    const link = await makeLink();
    const claim = () => admin.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString() })
      .eq('token', link.token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle();

    const first = await claim();
    expect(first.data).not.toBeNull();
    const second = await claim();
    expect(second.data).toBeNull();
  });

  it('a revoked link cannot be claimed', async () => {
    const link = await makeLink({ revoked_at: new Date().toISOString() });
    const { data } = await admin.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString() })
      .eq('token', link.token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle();
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:int -- security.test.js -t "single-use DB primitive"
```
Expected: FAIL — either `column "used_at" does not exist` or the null-default assertions error, because the columns don't exist yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0023_invite_links_single_use.sql`:

```sql
-- Single-use invite links. The link is redeemed by an atomic
-- UPDATE ... WHERE used_at IS NULL inside joinWeddingViaLink; these columns record
-- consumption and owner revocation. Redeemable iff
--   used_at IS NULL AND revoked_at IS NULL AND expires_at > now().
-- No client select policy is added: tokens stay unreadable by anon/authenticated,
-- exactly as in 0012. list/revoke go through service-role edge functions.
alter table wedding_invite_links add column if not exists used_at    timestamptz;
alter table wedding_invite_links add column if not exists used_by    uuid references profiles(id) on delete set null;
alter table wedding_invite_links add column if not exists revoked_at timestamptz;

-- Partial index: joinWeddingViaLink looks links up by token, but only redeemable ones matter.
create index if not exists idx_wil_token_live on wedding_invite_links(token)
  where used_at is null and revoked_at is null;
```

- [ ] **Step 4: Apply the migration to the local DB**

```bash
npm run db:reset
```
Expected: reset completes, all migrations (through `0023`) applied with no error.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:int -- security.test.js -t "single-use DB primitive"
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0023_invite_links_single_use.sql tests/integration/security.test.js
git commit -m "feat(invite-links): add single-use columns + atomic-claim test"
```

---

## Task 2: `joinWeddingViaLink` single-use + `createWeddingInviteLink` 14-day TTL

**Files:**
- Modify: `supabase/functions/joinWeddingViaLink/index.ts`
- Modify: `supabase/functions/createWeddingInviteLink/index.ts:7` (`TTL_MS`)
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: `createWeddingInviteLink` returns `{ url, token, role, expires_at }`; `joinWeddingViaLink` accepts `{ token }`.
- Produces: `joinWeddingViaLink` responses — success `{ wedding_id, couple_names, role, already_member }`; errors `404 invalid_token`, `409 used_token`, `409 revoked_token`, `410 expired_token`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`. The preflight helper makes function-dependent blocks skip cleanly when `functions:serve` is not running:

```js
async function functionsUp() {
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/joinWeddingViaLink`, {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' },
    });
    return r.status === 200;
  } catch { return false; }
}
const FUNCTIONS = await functionsUp();

describe.skipIf(!FUNCTIONS)('invite-link single-use join', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`jo-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  const createLink = async (role = 'coplanner') => {
    const { data, error } = await owner.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role },
    });
    if (error) throw error;
    return data.token;
  };

  it('first join consumes the token; a second user cannot reuse it', async () => {
    const token = await createLink();
    const a = await makeUser(`ja-${Date.now()}@t.local`);
    const b = await makeUser(`jb-${Date.now()}@t.local`);

    const r1 = await a.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r1.error).toBeNull();
    expect(r1.data.wedding_id).toBe(w.id);

    const { data: link } = await admin.from('wedding_invite_links')
      .select('used_at, used_by').eq('token', token).single();
    expect(link.used_at).not.toBeNull();
    expect(link.used_by).toBe(a.id);

    const r2 = await b.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r2.error).not.toBeNull(); // 409 used_token
    const { count } = await admin.from('wedding_members')
      .select('*', { count: 'exact', head: true }).eq('wedding_id', w.id).eq('user_id', b.id);
    expect(count).toBe(0);
  });

  it('an already-member re-opening the link does NOT consume it', async () => {
    const token = await createLink();
    const c = await makeUser(`jc-${Date.now()}@t.local`);
    await c.client.functions.invoke('joinWeddingViaLink', { body: { token } }); // burns? No — c not yet member, so this consumes it.

    // Fresh link for the already-member scenario: owner is already a member.
    const token2 = await createLink();
    const r = await owner.client.functions.invoke('joinWeddingViaLink', { body: { token: token2 } });
    expect(r.error).toBeNull();
    expect(r.data.already_member).toBe(true);
    const { data: link } = await admin.from('wedding_invite_links')
      .select('used_at').eq('token', token2).single();
    expect(link.used_at).toBeNull(); // not consumed
  });

  it('an expired link cannot be joined', async () => {
    const token = `exp-${Date.now()}`;
    await admin.from('wedding_invite_links').insert({
      id: `ilx-${Date.now()}`, wedding_id: w.id, token, role: 'coplanner',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const d = await makeUser(`jd-${Date.now()}@t.local`);
    const r = await d.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).not.toBeNull(); // 410 expired_token
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Start the functions server in a second terminal first:
```bash
npm run functions:serve
```
Then:
```bash
npm run test:int -- security.test.js -t "single-use join"
```
Expected: FAIL — the second user's reuse currently *succeeds* (multi-use), and `used_at` stays null, so `expect(link.used_at).not.toBeNull()` and the reuse assertions fail. (If the block is SKIPPED, the functions server is not running — start it and re-run.)

- [ ] **Step 3: Update the TTL in `createWeddingInviteLink`**

In `supabase/functions/createWeddingInviteLink/index.ts`, change line 7:

```ts
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (safety net; single-use is the real control)
```

- [ ] **Step 4: Rewrite `joinWeddingViaLink` for single-use**

Replace the body of `supabase/functions/joinWeddingViaLink/index.ts` from the `--- Look up the link ---` comment onward (lines 27–69) with:

```ts
    // --- Look up the link (service role bypasses RLS — this table has no select policy) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link, error: linkError } = await service.from('wedding_invite_links')
      .select('id, wedding_id, used_at, revoked_at, expires_at').eq('token', token).maybeSingle();
    if (linkError) {
      return Response.json({ error: linkError.message }, { status: 500, headers: cors });
    }
    if (!link) {
      return Response.json({ error: 'invalid_token', message: 'קישור ההזמנה אינו תקין' }, { status: 404, headers: cors });
    }

    // Already a member? Return success WITHOUT consuming the token (lets an owner test their
    // own link and lets a legitimate invitee refresh the page without burning the link).
    const { data: existingMembership } = await service.from('wedding_members')
      .select('id, role').eq('wedding_id', link.wedding_id).eq('user_id', user.id).maybeSingle();
    if (existingMembership) {
      const { data: w0 } = await service.from('weddings').select('couple_names').eq('id', link.wedding_id).maybeSingle();
      return Response.json({
        wedding_id: link.wedding_id, couple_names: w0?.couple_names ?? null,
        role: existingMembership.role, already_member: true,
      }, { headers: cors });
    }

    // --- Atomically claim the token (single-use). Exactly one caller can win this UPDATE. ---
    const { data: claimed, error: claimError } = await service.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq('token', token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('wedding_id, role, wedding_sides, max_guests').maybeSingle();
    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500, headers: cors });
    }
    if (!claimed) {
      // Claim lost — disambiguate the reason from the current row state.
      const { data: cur } = await service.from('wedding_invite_links')
        .select('used_at, revoked_at, expires_at').eq('token', token).maybeSingle();
      if (cur?.revoked_at) {
        return Response.json({ error: 'revoked_token', message: 'קישור ההזמנה בוטל' }, { status: 409, headers: cors });
      }
      if (cur?.used_at) {
        return Response.json({ error: 'used_token', message: 'קישור ההזמנה כבר נוצל' }, { status: 409, headers: cors });
      }
      return Response.json({ error: 'expired_token', message: 'קישור ההזמנה פג תוקף' }, { status: 410, headers: cors });
    }

    // Defensive: a link can never grant ownership, regardless of what's stored.
    const role = claimed.role === 'owner' ? 'coplanner' : claimed.role;
    // Sides/guest-quota only make sense for (and are only ever set on) the 'family' role.
    const wedding_sides = role === 'family' ? (claimed.wedding_sides ?? []) : [];
    const max_guests = role === 'family' ? (claimed.max_guests ?? null) : null;

    const { error: insertError } = await service.from('wedding_members')
      .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role, wedding_sides, max_guests });
    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500, headers: cors });
    }

    const { data: wedding } = await service.from('weddings')
      .select('couple_names').eq('id', claimed.wedding_id).maybeSingle();

    return Response.json({
      wedding_id: claimed.wedding_id,
      couple_names: wedding?.couple_names ?? null,
      role,
      already_member: false,
    }, { headers: cors });
```

- [ ] **Step 5: Run test to verify it passes**

The functions server hot-reloads (`policy = per_worker`). Re-run:
```bash
npm run test:int -- security.test.js -t "single-use join"
```
Expected: PASS (3 tests). If skipped, start `npm run functions:serve`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/joinWeddingViaLink/index.ts supabase/functions/createWeddingInviteLink/index.ts tests/integration/security.test.js
git commit -m "feat(invite-links): single-use join + 14-day TTL"
```

---

## Task 3: `revokeWeddingInviteLink` edge function

**Files:**
- Create: `supabase/functions/revokeWeddingInviteLink/index.ts`
- Modify: `supabase/config.toml`
- Modify: `src/api/wedflowClient.js`
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: `createWeddingInviteLink` (`{ token }`), `joinWeddingViaLink` (`{ token }`).
- Produces: `revokeWeddingInviteLink` accepts `{ id }` → `{ revoked: boolean, reason?: string }`. Client: `wedflow.weddingInviteLinks.revoke(id)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`:

```js
describe.skipIf(!FUNCTIONS)('invite-link revoke', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`rvo-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  const createLink = async () => {
    const { data } = await owner.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'coplanner' } });
    const { data: row } = await admin.from('wedding_invite_links').select('id').eq('token', data.token).single();
    return { token: data.token, id: row.id };
  };

  it('owner can revoke a pending link, after which it cannot be joined', async () => {
    const { token, id } = await createLink();
    const rev = await owner.client.functions.invoke('revokeWeddingInviteLink', { body: { id } });
    expect(rev.error).toBeNull();
    expect(rev.data.revoked).toBe(true);

    const joiner = await makeUser(`rvj-${Date.now()}@t.local`);
    const r = await joiner.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).not.toBeNull(); // 409 revoked_token
  });

  it('a non-owner member cannot revoke a link', async () => {
    const { id } = await createLink();
    const family = await makeUser(`rvf-${Date.now()}@t.local`);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: family.id, role: 'family' });
    const rev = await family.client.functions.invoke('revokeWeddingInviteLink', { body: { id } });
    expect(rev.error).not.toBeNull(); // 403
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:int -- security.test.js -t "invite-link revoke"
```
Expected: FAIL — `revokeWeddingInviteLink` returns a boot/404 error (function does not exist yet), so `rev.error` is not null in the first test.

- [ ] **Step 3: Create the function**

Create `supabase/functions/revokeWeddingInviteLink/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Owner/platform-admin revokes a pending invite link by id (soft: sets revoked_at).
// Mirrors createWeddingInviteLink's authorization shape.
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const { id } = await req.json();
    if (!id) return Response.json({ error: 'id is required' }, { status: 400, headers: cors });

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link } = await service.from('wedding_invite_links')
      .select('id, wedding_id, used_at, revoked_at').eq('id', id).maybeSingle();
    if (!link) return Response.json({ error: 'not_found' }, { status: 404, headers: cors });

    // Authorize: wedding owner or platform admin.
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', link.wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }

    if (link.used_at) return Response.json({ revoked: false, reason: 'already_used' }, { headers: cors });
    if (link.revoked_at) return Response.json({ revoked: false, reason: 'already_revoked' }, { headers: cors });

    const { error: updErr } = await service.from('wedding_invite_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id).is('used_at', null).is('revoked_at', null);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500, headers: cors });

    return Response.json({ revoked: true }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
```

- [ ] **Step 4: Register `verify_jwt` in config**

In `supabase/config.toml`, add after the `[functions.joinWeddingViaLink]` block:

```toml
[functions.revokeWeddingInviteLink]
verify_jwt = true
```

- [ ] **Step 5: Add the client wrapper**

In `src/api/wedflowClient.js`, inside the `weddingInviteLinks` object (after the `create` method), add:

```js
  async revoke(id) {
    const { data, error } = await supabase.functions.invoke('revokeWeddingInviteLink', { body: { id } });
    if (error) throw error;
    return data;
  },
```

- [ ] **Step 6: Run test to verify it passes**

Restart `npm run functions:serve` (a *new* function directory requires a restart, not just hot reload), then:
```bash
npm run test:int -- security.test.js -t "invite-link revoke"
```
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/revokeWeddingInviteLink/index.ts supabase/config.toml src/api/wedflowClient.js tests/integration/security.test.js
git commit -m "feat(invite-links): revokeWeddingInviteLink function + client wrapper"
```

---

## Task 4: `listWeddingInviteLinks` edge function (token-secret)

**Files:**
- Create: `supabase/functions/listWeddingInviteLinks/index.ts`
- Modify: `supabase/config.toml`
- Modify: `src/api/wedflowClient.js`
- Test: `tests/integration/security.test.js` (append a new `describe`)

**Interfaces:**
- Consumes: `createWeddingInviteLink` (`{ token }`).
- Produces: `listWeddingInviteLinks` accepts `{ wedding_id }` → `{ links: Array<{ id, role, wedding_sides, max_guests, created_by, created_date, expires_at, used_at, used_by, revoked_at, status }> }` where `status ∈ 'pending'|'used'|'revoked'|'expired'`. **Never** includes `token`. Client: `wedflow.weddingInviteLinks.list(weddingId)` returns the `links` array.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/security.test.js`:

```js
describe.skipIf(!FUNCTIONS)('invite-link list', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`lso-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
    await owner.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'coplanner' } });
  });

  it('owner sees links with a status but never a token', async () => {
    const res = await owner.client.functions.invoke('listWeddingInviteLinks', { body: { wedding_id: w.id } });
    expect(res.error).toBeNull();
    expect(Array.isArray(res.data.links)).toBe(true);
    expect(res.data.links.length).toBeGreaterThan(0);
    for (const l of res.data.links) {
      expect(l).not.toHaveProperty('token');
      expect(['pending', 'used', 'revoked', 'expired']).toContain(l.status);
    }
  });

  it('a non-member cannot list links', async () => {
    const outsider = await makeUser(`lsx-${Date.now()}@t.local`);
    const res = await outsider.client.functions.invoke('listWeddingInviteLinks', { body: { wedding_id: w.id } });
    expect(res.error).not.toBeNull(); // 403
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:int -- security.test.js -t "invite-link list"
```
Expected: FAIL — function does not exist, so `res.error` is not null in the first test.

- [ ] **Step 3: Create the function**

Create `supabase/functions/listWeddingInviteLinks/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Owner/platform-admin lists a wedding's invite links WITHOUT the token (tokens are only ever
// returned once, at creation). Returns a derived status per link.
function statusOf(l: { used_at: string | null; revoked_at: string | null; expires_at: string }): string {
  if (l.revoked_at) return 'revoked';
  if (l.used_at) return 'used';
  if (new Date(l.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });

    const { wedding_id } = await req.json();
    if (!wedding_id) return Response.json({ error: 'wedding_id is required' }, { status: 400, headers: cors });

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Authorize: wedding owner or platform admin.
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
    }

    // NOTE: token is deliberately NOT selected.
    const { data: rows, error } = await service.from('wedding_invite_links')
      .select('id, role, wedding_sides, max_guests, created_by, created_date, expires_at, used_at, used_by, revoked_at')
      .eq('wedding_id', wedding_id).order('created_date', { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });

    const links = (rows ?? []).map((l) => ({ ...l, status: statusOf(l) }));
    return Response.json({ links }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
```

- [ ] **Step 4: Register `verify_jwt` in config**

In `supabase/config.toml`, add:

```toml
[functions.listWeddingInviteLinks]
verify_jwt = true
```

- [ ] **Step 5: Add the client wrapper**

In `src/api/wedflowClient.js`, inside `weddingInviteLinks` (after `revoke`), add:

```js
  async list(wedding_id) {
    const { data, error } = await supabase.functions.invoke('listWeddingInviteLinks', { body: { wedding_id } });
    if (error) throw error;
    return data.links;
  },
```

- [ ] **Step 6: Run test to verify it passes**

Restart `npm run functions:serve` (new function directory), then:
```bash
npm run test:int -- security.test.js -t "invite-link list"
```
Expected: PASS (2 tests).

- [ ] **Step 7: Run the whole security suite**

```bash
npm run test:int -- security.test.js
```
Expected: PASS — the original 8 tests plus all new ones (single-use DB primitive, join, revoke, list). None skipped (functions server running).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/listWeddingInviteLinks/index.ts supabase/config.toml src/api/wedflowClient.js tests/integration/security.test.js
git commit -m "feat(invite-links): listWeddingInviteLinks function + client wrapper"
```

---

## Task 5: UserManagement pending-links panel

**Files:**
- Modify: `src/pages/UserManagement.jsx`
- Verify: browser preview (no unit test — this is presentational; behavior is covered by Tasks 3–4)

**Interfaces:**
- Consumes: `wedflow.weddingInviteLinks.list(activeWeddingId)`, `wedflow.weddingInviteLinks.revoke(id)`.

- [ ] **Step 1: Add the links query + revoke mutation**

In `src/pages/UserManagement.jsx`, after the `members` `useQuery` block (around line 72), add:

```jsx
  const { data: inviteLinks = [] } = useQuery({
    queryKey: ['weddingInviteLinks', activeWeddingId],
    queryFn: () => wedflow.weddingInviteLinks.list(activeWeddingId),
    enabled: !!activeWeddingId && canManage,
  });

  const invalidateLinks = () => queryClient.invalidateQueries({ queryKey: ['weddingInviteLinks'] });

  const revokeLinkMutation = useMutation({
    mutationFn: (id) => wedflow.weddingInviteLinks.revoke(id),
    onSuccess: invalidateLinks,
    onError: (error) => alert('שגיאה בביטול הקישור: ' + error.message),
  });
```

- [ ] **Step 2: Refresh the list after creating a link**

In `handleCreateLink` (around line 137), add `invalidateLinks();` right after `setGeneratedLink(result);`:

```jsx
      setGeneratedLink(result);
      invalidateLinks();
      setLinkCopied(false);
```

- [ ] **Step 3: Add status label/style maps**

Near the top-level constants (after `ROLE_BADGE_STYLES`, around line 33), add:

```jsx
const LINK_STATUS_LABELS = {
  pending: 'ממתין',
  used: 'נוצל',
  revoked: 'בוטל',
  expired: 'פג תוקף',
};
const LINK_STATUS_STYLES = {
  pending: 'bg-sage/15 border-sage/30 text-sage-deep',
  used: 'bg-taupe/15 border-taupe/30 text-taupe',
  revoked: 'bg-champagne border-taupe/40 text-rose-deep',
  expired: 'bg-champagne border-taupe/40 text-rose-deep',
};
```

- [ ] **Step 4: Render the panel**

In the page JSX, immediately before the closing of the members `Card`/section (locate the members `Table`'s enclosing block and add this as a sibling `Card` after it), insert:

```jsx
      {canManage && inviteLinks.length > 0 && (
        <Card className="p-4 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-4 h-4 text-taupe" />
            <h2 className="text-lg font-medium text-rose-deep">קישורי הזמנה</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">תפקיד</TableHead>
                <TableHead className="text-right">נוצר על ידי</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inviteLinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_BADGE_STYLES[link.role]}>
                      {ROLE_LABELS[link.role] ?? link.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-taupe">{link.created_by ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={LINK_STATUS_STYLES[link.status]}>
                      {LINK_STATUS_LABELS[link.status] ?? link.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-left">
                    {link.status === 'pending' && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => revokeLinkMutation.mutate(link.id)}
                        disabled={revokeLinkMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-rose-deep" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
```

- [ ] **Step 5: Lint**

```bash
npm run lint
```
Expected: no new errors in `src/pages/UserManagement.jsx`.

- [ ] **Step 6: Verify in the browser**

Start the app (`npm run dev`) with the local stack + `npm run functions:serve` running. As a wedding owner:
1. Open User Management, create an invite link → it appears in the "קישורי הזמנה" panel with status **ממתין (pending)**.
2. Click revoke (trash) → row flips to **בוטל (revoked)**, revoke button disappears.
3. In a separate signed-in session, open a *pending* link's URL → joins successfully; the panel row (after refetch) shows **נוצל (used)**.

Capture a screenshot of the panel showing at least one pending and one used/revoked row.

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserManagement.jsx
git commit -m "feat(invite-links): pending-links panel with revoke in UserManagement"
```

---

## Self-review notes (author)

- **Spec coverage:** columns + predicate (Task 1) ✔; single-use join + already-member no-consume + expiry + 14-day TTL (Task 2) ✔; revoke owner-gated (Task 3) ✔; list without token + authz (Task 4) ✔; UI list+revoke (Task 5) ✔; config `verify_jwt` for both new functions (Tasks 3–4) ✔; no-re-copy tradeoff honored (list omits token) ✔; backward compatibility (columns nullable, existing rows redeemable once) ✔.
- **Type consistency:** `used_by uuid` matches `profiles.id`/`wedding_members.user_id`; join response shape `{ wedding_id, couple_names, role, already_member }` consistent across success paths; `revoke(id)`/`list(wedding_id)` client names match function bodies and UI callsites; status set `pending|used|revoked|expired` identical in `statusOf`, test, and UI maps.
- **Note for executor:** a NEW function directory needs `functions:serve` **restarted** (Tasks 3 & 4 Step 6); edits to an existing function hot-reload (Task 2 Step 5).
