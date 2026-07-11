# Owner invite links (platform-admin only, ownership-transferring)

**Date:** 2026-07-11
**Status:** Approved (design)
**Branch:** `feat/owner-invite-links`

## Background

Invite links (`createWeddingInviteLink` / `joinWeddingViaLink`, single-use since the
2026-07-10 change) currently grant only collaborator roles (`coplanner`, `family`,
`event_manager`). `owner` is refused at both ends: `createWeddingInviteLink` rejects it via
`LINKABLE_ROLES`, and `joinWeddingViaLink` defensively downgrades `owner → coplanner`.

The per-email flow (`inviteUserToWedding` + `UserManagement`) *already* lets a **platform admin**
assign `owner` (main commit `17c659d`). This spec brings the same capability to shareable links.

## Goal

Let a **platform admin** mint a single-use invite link that, when redeemed, makes the joiner the
wedding **owner** — both a `wedding_members` row with `role='owner'` and a transfer of
`weddings.owner_id` to the joiner (a full handoff, e.g. platform admin → the couple).

## Decisions (from brainstorming)

1. **Only platform admins** may create owner links. A regular wedding owner cannot.
2. Redeeming an owner link **also transfers canonical ownership** (`weddings.owner_id`), demoting
   the previous owner's `owner_id`-based powers. The previous owner keeps any existing membership
   row unless separately removed.

## Non-goals

- Changing collaborator-link behavior (coplanner/family/event_manager stay exactly as-is).
- Multi-owner "co-owner" links for regular owners (explicitly rejected — admin-only).
- Removing/demoting the previous owner's `wedding_members` row on transfer.

## Security linchpin — tighten the insert RLS

Today `joinWeddingViaLink` downgrades `owner → coplanner`, and that downgrade is the *actual*
safety net, because the `wil_insert` RLS policy (migration `0012`) lets **any wedding owner**
insert a `wedding_invite_links` row with **any** `role` directly via PostgREST — including
`owner`. Removing the downgrade without fixing this would let a regular owner self-insert an
`owner` link and redeem it, bypassing the platform-admin rule.

**Migration `0024`** replaces the insert policy so `owner` links can only originate from a
platform admin:

```sql
drop policy if exists wil_insert on wedding_invite_links;
create policy wil_insert on wedding_invite_links for insert with check (
  is_platform_admin()
  or (is_wedding_owner(wedding_id) and role <> 'owner')
);
```

There is deliberately **no** update/delete grant or policy on this table (migration `0012`), so an
existing link's role cannot be flipped to `owner` after insert. Combined with the above, a stored
`role='owner'` is guaranteed to be platform-admin-origin, so `joinWeddingViaLink` can trust it.

## Backend changes

### `createWeddingInviteLink`
Refactor the authorization block to compute both flags explicitly, then gate `owner`:

```ts
const { data: ownerMembership } = await service.from('wedding_members')
  .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
const { data: profile } = await service.from('profiles')
  .select('is_platform_admin').eq('id', user.id).maybeSingle();
const isOwner = !!ownerMembership;
const isPlatformAdmin = !!profile?.is_platform_admin;
if (!isOwner && !isPlatformAdmin) {
  return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
}
const allowedRoles = isPlatformAdmin ? ['owner', ...LINKABLE_ROLES] : LINKABLE_ROLES;
if (!allowedRoles.includes(role)) {
  return Response.json({ error: `role must be one of: ${allowedRoles.join(', ')}` }, { status: 400, headers: cors });
}
```
`LINKABLE_ROLES` stays `['coplanner','family','event_manager']`. `owner` never carries
`wedding_sides`/`max_guests` (only `family` does — unchanged).

### `joinWeddingViaLink`
1. Add `role` to the initial link lookup select.
2. Compute `isOwnerLink = link.role === 'owner'`.
3. **Already-member short-circuit applies only to non-owner links.** For owner links, proceed to
   claim + promote even if the caller is already a member:
   ```ts
   if (existingMembership && !isOwnerLink) { /* return already_member, no consume (unchanged) */ }
   ```
4. Remove the blanket `owner → coplanner` downgrade: `const role = claimed.role;`
5. After a successful claim, branch on role:
   ```ts
   if (role === 'owner') {
     if (existingMembership) {
       await service.from('wedding_members')
         .update({ role: 'owner', wedding_sides: [], max_guests: null })
         .eq('id', existingMembership.id);
     } else {
       await service.from('wedding_members')
         .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role: 'owner', wedding_sides: [], max_guests: null });
     }
     await service.from('weddings').update({ owner_id: user.id }).eq('id', claimed.wedding_id);
   } else {
     // existing non-owner insert path (existingMembership is null here — the short-circuit returned earlier)
     const wedding_sides = role === 'family' ? (claimed.wedding_sides ?? []) : [];
     const max_guests = role === 'family' ? (claimed.max_guests ?? null) : null;
     await service.from('wedding_members')
       .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role, wedding_sides, max_guests });
   }
   ```
   Handle insert/update errors the same way the current code does (return 500 on error).
6. Response `role` reflects the granted role; `already_member` stays `false` on a consumed claim.

Both writes use the service-role client (bypasses RLS) — as the function already does.

## UI (`src/pages/UserManagement.jsx`)

- Invite-link dialog role `<Select>`: replace the hardcoded `INVITABLE_ROLES.map(...)` (the one
  inside the *link* dialog, currently near line 493) with `invitableRoles.map(...)` — the computed
  list already defined for the per-email dialog (`isPlatformAdmin ? ['owner', ...INVITABLE_ROLES] : INVITABLE_ROLES`).
- When `linkRole === 'owner'`, render a warning block:
  > ⚠️ קישור זה מעניק בעלות מלאה על החתונה ומעביר את הבעלות למי שמצטרף. שמור אותו בזהירות.
- Fix stale copy: the dialog's intro paragraph currently reads *"תקף ל-48 שעות ואפשר להשתמש בו
  כמה פעמים"* (a leftover from the pre-single-use version). Replace with:
  > הקישור חד-פעמי — מתבטל אוטומטית לאחר שמישהו מצטרף דרכו, ותקף עד 14 יום.

## Testing (`tests/integration/security.test.js`, extend)

1. **Admin owner link → handoff:** a platform admin creates a `role='owner'` link; a joiner
   redeems it; assert the joiner has a `wedding_members` row with `role='owner'` **and**
   `weddings.owner_id === joiner.id`.
2. **Regular owner cannot create owner links:** an owner (non-admin) calls `createWeddingInviteLink`
   with `role='owner'` → error (403/400), no link row created.
3. **RLS blocks direct owner insert:** a regular owner attempts a direct
   `from('wedding_invite_links').insert({ role: 'owner', ... })` via their JWT → `error` is non-null.
   A `role='coplanner'` direct insert by the same owner still succeeds (policy unchanged for
   non-owner).
4. **Promotion path:** an existing `coplanner` member redeems an admin-created owner link → their
   membership becomes `role='owner'` and `owner_id` transfers (token is consumed, not short-circuited).
5. **Regression:** existing collaborator single-use/join/revoke/list tests still pass unchanged.

## Migration / deploy notes

- `0024` only replaces an RLS policy — no schema/data change; safe and reversible.
- Deploy order: migration `0024` → edge functions (`createWeddingInviteLink`, `joinWeddingViaLink`)
  → frontend. `list`/`revoke` are unaffected.
- Cloud `db push` should be clean now that the double-`0015` collision is resolved (0016/0023 recorded).
