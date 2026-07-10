# Single-use wedding invite links + link management

**Date:** 2026-07-10
**Status:** Approved (design)
**Branch:** `feat/single-use-invite-links`

## Background

`createWeddingInviteLink` / `joinWeddingViaLink` currently mint a **multi-use** token valid
for **2 days**: anyone holding the token can join the wedding (as the baked-in role) any
number of times until it expires. The token is never invalidated on use.

This is weaker than it should be — a link that leaks (forwarded email, chat history, shoulder
-surf) is exploitable for the full 2-day window, by any number of people. The owner also has
no visibility into, or control over, outstanding links.

## Goal

Shift the security control from *"a time window anyone can use"* to *"a token that dies once
it's used."* Each link is meant for one collaborator; to invite two people (e.g. two
co-planners) the owner mints two links. Add owner-facing visibility and revocation.

## Non-goals

- Re-fetching / re-copying an existing link's URL after creation (see Tradeoffs).
- Per-email invites (`inviteUserToWedding`) are unchanged.
- Granting `owner` via a link (already forbidden; stays forbidden).
- `max_guests` quota enforcement at the data layer (stays UI-enforced, per migration 0021).

## Data model

New migration `0023_invite_links_single_use.sql` adds to `wedding_invite_links`:

| Column        | Type          | Meaning                                  |
|---------------|---------------|------------------------------------------|
| `used_at`     | `timestamptz` | When the link was redeemed (null = unused) |
| `used_by`     | `uuid`        | Which user redeemed it (FK `profiles.id`, null = unused) |
| `revoked_at`  | `timestamptz` | When an owner revoked it (null = active)  |

**Redeemable predicate:** `used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.

**Derived status** (computed, not stored):
- `revoked` — `revoked_at IS NOT NULL`
- `used` — `used_at IS NOT NULL` (and not revoked)
- `expired` — `expires_at < now()` (and not used/revoked)
- `pending` — otherwise

**RLS unchanged.** The table keeps its no-client-select posture (verified by the security
audit): clients can never read token rows directly. All reads/writes go through service-role
edge functions. No new client select policy is added.

## Behaviour

### `createWeddingInviteLink` (modify)
- `TTL_MS`: 2 days → **14 days**. Single-use is the real control; the expiry is only a safety
  net for links that are never redeemed.
- No other change; still owner/admin-gated, still returns `{ url, token, role, expires_at }`
  exactly once.

### `joinWeddingViaLink` (modify — atomic single-use)
1. Authenticate caller (unchanged; sign-in required).
2. Look up the link by token via service role to obtain `wedding_id` (and validate it exists).
   - Not found → `404 invalid_token`.
3. **Already-member short-circuit:** if the caller is already a member of `link.wedding_id`,
   return `{ already_member: true, ... }` **without consuming the token**. This lets an owner
   test their own link and lets a legitimate invitee refresh the page without an error.
4. **Atomic claim:**
   ```sql
   UPDATE wedding_invite_links
      SET used_at = now(), used_by = :uid
    WHERE token = :token
      AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   RETURNING id, wedding_id, role, wedding_sides, max_guests;
   ```
   - Returns a row → this caller won the claim. Proceed to insert membership.
   - Returns no row → the link is no longer redeemable. Re-read the row to disambiguate and
     return the precise error: `410 expired_token`, `409 used_token`, or `409 revoked_token`.
   - The `UPDATE … WHERE used_at IS NULL` is the concurrency guard: if two people click the
     same link simultaneously, exactly one `UPDATE` matches; the other gets no row.
5. Insert the membership (owner→coplanner downgrade; `wedding_sides`/`max_guests` applied only
   for the `family` role — identical to today). The `wedding_members` unique
   `(wedding_id, user_id)` constraint remains the backstop against double-join.

### `listWeddingInviteLinks` (new edge function, `verify_jwt = true`)
- Authenticate caller; authorize as **owner or platform admin** of the requested `wedding_id`
  (same check shape as `createWeddingInviteLink`).
- Return an array of links for that wedding **excluding `token`**:
  `{ id, role, wedding_sides, max_guests, created_by, created_date, expires_at, used_at,
     used_by, revoked_at, status }`.
- Non-owner / non-member → `403`.

### `revokeWeddingInviteLink` (new edge function, `verify_jwt = true`)
- Authenticate caller; authorize as owner/admin of the link's wedding.
- ```sql
  UPDATE wedding_invite_links
     SET revoked_at = now()
   WHERE id = :id AND wedding_id = :wedding_id
     AND used_at IS NULL AND revoked_at IS NULL
  ```
- Returns `{ revoked: true }` if a row changed, else `{ revoked: false, reason }`
  (already used / already revoked / not found). Idempotent-safe.

## Client (`src/api/wedflowClient.js`)

Extend `weddingInviteLinks`:
- `list(weddingId)` → invokes `listWeddingInviteLinks`.
- `revoke(id)` → invokes `revokeWeddingInviteLink`.

`create(...)` is unchanged.

## UI (`src/pages/UserManagement.jsx`)

Add a **"Pending invite links"** panel below the existing create-link dialog:
- Row per link: role label, created-by + date, status badge (`pending`/`used`/`revoked`/
  `expired`), and a **Revoke** button shown only for `pending` rows.
- After `create`, the freshly returned URL is still shown once with the existing copy button.
- The list refreshes after create and after revoke.
- No re-copy affordance for existing links (see Tradeoffs).

## Config (`supabase/config.toml`)

Add:
```toml
[functions.listWeddingInviteLinks]
verify_jwt = true
[functions.revokeWeddingInviteLink]
verify_jwt = true
```

## Tradeoffs

**No re-copy of existing links.** `list` deliberately omits `token`, so a link URL can only be
copied at creation time. If the owner loses it, they revoke and mint a new one. Rejected
alternative: return live tokens to owners in `list` — this would let a hijacked owner session
scrape every pending invite URL at once, reopening the token-at-rest exposure the audit closed.
Since an owner can already mint fresh links, the convenience isn't worth the risk.

## Testing (`tests/integration/security.test.js`, extend)

1. **Single-use:** create link → user A joins (membership added, `used_at` set) → user B joins
   with the same token → fails (`used_token`), B is not a member.
2. **Already-member no-consume:** a current member opening the link returns `already_member`
   and does **not** set `used_at`.
3. **Revoke:** owner revokes a pending link → a subsequent join fails (`revoked_token`).
4. **Expiry:** an expired link cannot be redeemed (`expired_token`).
5. **List authz + token secrecy:** owner's `list` payload contains the link but **never** a
   `token` field; a non-member calling `list` gets `403`.
6. **Revoke authz:** a non-owner member cannot revoke a link (`403`).

## Migration / deploy notes

- Backward compatible: existing rows get `used_at = NULL`, so all currently-outstanding links
  remain redeemable (once) until they expire under the old 2-day window.
- Deploy order: migration `0023` → edge functions (`joinWeddingViaLink`, `createWeddingInviteLink`,
  new `listWeddingInviteLinks`, `revokeWeddingInviteLink`) → config → frontend.
