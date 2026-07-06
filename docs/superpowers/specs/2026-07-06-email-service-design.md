# Email Service — Design Spec

**Date:** 2026-07-06
**Status:** Approved (brainstorming) — ready for implementation
**Scope:** A unified, extensible email service that renders and sends **all** WedFlow
email — app-triggered (wedding invites, member-added, future notifications/newsletter)
and auth-triggered (signup verification, password reset, magic link) — through one
branded, RTL, dark/light-safe template system.

## Decisions (from brainstorming)

- **Ownership:** Unified. Our service renders + sends everything via the Resend API.
  Auth emails are taken over via a Supabase **Send Email auth hook**.
- **Invite:** Custom branded invite. Stop using `auth.admin.inviteUserByEmail()`'s
  default email; generate the link ourselves and send our own design.
- **Language:** Hebrew / RTL only.
- **Logging:** Yes — an `email_log` table records every send.
- **Newsletter:** Template category scaffolded only; no subscription management now (YAGNI).

## Architecture

### Shared module — `supabase/functions/_shared/email/`
Pure, testable, no `Deno.serve`. Edge functions import it. Single choke point for all sends.

```
_shared/email/
  theme.ts        # brand palette (light+dark hex pairs), fonts, spacing, sizes
  layout.ts       # master RTL HTML shell: preheader, wordmark header, footer, color-scheme handling
  components.ts   # button(), card(), heading(), paragraph(), infoRow(), divider(), monogram()
  render.ts       # renderEmail(templateId, data) -> { subject, html, text }; placeholder guard
  resend.ts       # thin Resend API client (fetch to api.resend.com/emails)
  send.ts         # sendEmail({ to, templateId, data, weddingId?, createdById? }) -> render + Resend + email_log
  templates/
    index.ts            # registry: templateId -> { subject(data), html(data), text(data) }
    weddingInvite.ts
    memberAdded.ts
    authVerification.ts
    authPasswordReset.ts
    authMagicLink.ts
```

**Template contract** — each template module exports:
```ts
export const subject = (d) => string;
export const html = (d) => string;   // built from components + layout
export const text = (d) => string;   // plain-text fallback (deliverability)
```
Adding a future email = add one file + one registry line.

### Visual system (frontend-design)
- RTL Hebrew, 600px table-based responsive layout, inline styles throughout.
- **Dark/light safety:** `<meta name="color-scheme" content="light dark">` +
  `<meta name="supported-color-schemes">`, light-mode inline defaults, and a
  `@media (prefers-color-scheme: dark)` block overriding a small set of `[data-*]`
  hooks. No pure black/white; every token has a light+dark twin.
- **Signature:** gold "WedFlow" wordmark (Georgia) over a thin gold rule pierced by a
  small diamond — an engraved-invitation divider, reused as the section rule.
- Palette: paper `#F5F1E9` / card `#FFF` / ink `#201E1A` / gold `#B8893B` / soft-gold
  `#F3E9D6` / border `#E7DFD1`. Dark: bg `#161311` / card `#211C18` / ink `#F3EEE6` /
  gold `#D8B36A` / border `#3A322A`.
- Distinct, human subjects per template (no "Notification from WedFlow").

### Edge functions
1. **`authEmailHook`** — Supabase Send Email hook. Verifies the standard-webhooks HMAC
   secret (`SEND_EMAIL_HOOK_SECRET`), maps `email_data.email_action_type`
   (signup/recovery/magiclink/email_change) -> template, builds the action URL from
   `token_hash` + `redirect_to`, renders, sends via `send.ts`. Returns `{}` on success.
2. **`sendEmail`** — thin authenticated HTTP dispatch for app-triggered emails (future
   notifications). Validates caller (JWT), delegates to `send.ts`. Minimal now.

### Invite flow rewrite — `inviteUserToWedding`
- **New users:** `admin.generateLink({ type: 'invite', email })` returns the confirmation
  link **without sending**. We then `sendEmail(templateId='weddingInvite', ...)` with full
  context (inviter name, wedding name, role, action URL).
- **Existing users:** no auth link; `sendEmail(templateId='memberAdded', ...)` with a deep
  link into the app.
- The membership upsert logic is unchanged.

### `email_log` table — migration `0010_email_log.sql`
Columns: `id uuid pk default gen_random_uuid()`, `to_email text not null`,
`template_id text not null`, `subject text`, `status text not null` (`sent`|`failed`),
`provider_id text` (Resend id), `error text`, `wedding_id text references weddings(id)`,
`created_by_id uuid`, `created_date timestamptz default now()`.
- RLS: enabled. Platform admins read all; wedding owners read rows for their wedding.
  Inserts/updates via service role only (no anon/authenticated write policy).
- Grants consistent with existing `0004_grants.sql` conventions.

## Configuration / secrets
- `RESEND_API_KEY` — already set on cloud (send-only).
- `EMAIL_FROM` — default `WedFlow <noreply@wedflow.live>`.
- `APP_URL` — `https://wedflow.live` (deep links).
- `SEND_EMAIL_HOOK_SECRET` — new; also configured in Supabase Auth hook settings.
- Supabase dashboard: enable the Send Email hook pointing at the deployed `authEmailHook`.

## Testing
- **Unit (Vitest):** per-template — subject/html/text non-empty, `dir="rtl"` present,
  key data rendered, **no unresolved `{{placeholder}}`**, both color-scheme blocks present.
  `render.ts` guard test. `send.ts` with a mocked Resend fetch asserts payload + log write.
- Templates are pure string builders, runnable under the existing node test env.

## Non-goals
- Newsletter subscription management, unsubscribe center, email scheduling/queueing,
  open/click tracking, per-user email preferences. (Scaffold-friendly, not built.)

## Build order
1. Foundation: theme, layout, components, render, resend, send, templates/index (registry).
2. Templates: weddingInvite, memberAdded, auth×3.
3. Migration 0010 (email_log + RLS + grants).
4. Edge functions: authEmailHook, sendEmail.
5. inviteUserToWedding rewrite.
6. Tests + preview render for visual QA.
