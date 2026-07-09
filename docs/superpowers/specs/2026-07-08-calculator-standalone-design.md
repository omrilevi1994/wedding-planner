# WedFlow Calculator — Standalone Product & Marketing Hook — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending spec review

## Problem

WedFlow needs a top-of-funnel hook: a single sharp tool that couples reach for
*before* they book a venue, that spreads on its own, and that pulls users into the
platform. The venue cost-per-head calculator (`src/components/dashboard/VenueCalculator.jsx`)
already exists and is differentiated, but today it only lives inside the auth-gated
app (`/app`), so it can't act as a public, shareable lead magnet.

## Goal

Ship the existing venue cost-per-head calculator as a **standalone, no-login product**
that:

1. Lives at a public URL (`wedflow.live/calc`, aliased by `calc.wedflow.live`).
2. Is showcased in a static section on the marketing landing page (`index.html`) that
   links into it.
3. Captures leads (email) in exchange for genuine value ("email yourself the breakdown"),
   without ever hiding the result.
4. Bridges honestly into the full platform ("track the rest of your budget in WedFlow").

All built **once** so the in-app, standalone, and landing surfaces never drift.

## Decisions (from brainstorming)

- **Scope:** The existing **venue cost-per-head** calculator, made standalone. Sharp
  wedge now, with room to grow into a broader multi-category estimator later (out of
  scope for v1).
- **Conversion model:** Result is always fully visible ("open, soft"). Below it, an
  optional email capture ("email yourself the breakdown") that feeds a leads list. No
  gating of the value.
- **Email destination:** New Supabase `leads` table, written server-side by a public
  edge function, with the breakdown email sent through the **existing** Resend-based
  email service (`supabase/functions/_shared/email/`). No new ESP.
- **Landing behavior:** Static showcase section + one-click CTA into `/calc` (not an
  inline React island), preserving the landing's static/fast/SEO-pure design ethos.
- **Analytics (added after brainstorming):** PostHog is being installed across all
  surfaces (landing, app, calc). The calculator emits `calc_used`,
  `calc_lead_submitted`, and `calc_cta_clicked` events. See the separate PostHog install.

## Architecture

Three surfaces, one calculator:

| Surface | Where | Auth | Notes |
|---|---|---|---|
| In-app | `/app` → `Calculator.jsx` | Required | Live wedding data. Behavior unchanged. |
| Standalone | `wedflow.live/calc` (alias `calc.wedflow.live`) | None | Public React entry. Shareable / ad URL. |
| Landing | `wedflow.live/` → `index.html` | None | Static showcase section + CTA into `/calc`. |

### No-duplication guarantee

1. **Shared math module** — extract the pure cost math out of `VenueCalculator.jsx`
   into `src/lib/venueCalc.js`:
   - `computeCostPerHead(inputs)` — per-head venue cost from dish/bar/service/per-head extras.
   - `computeTotals(inputs)` — total venue cost, grand total, average cost per guest.
   - `budgetStatus(costPerGuest)` — the green/orange/red thresholds (currently `TARGET = 570`,
     `WARN = 580` hardcoded in the component) returning `{ level: 'ok'|'warn'|'over', ... }`.
   Both the in-app and standalone calculators import this module. The component keeps its
   own React state and rendering; only the arithmetic moves.

2. **Reused component** — the **same** `VenueCalculator` component renders on the
   standalone page. It gains a prop `showSystemExpenses` (default `true`). When `false`
   (standalone), the platform-only "שאר הוצאות מהמערכת" row and its contribution to the
   grand total are hidden, so the standalone tool computes venue cost only. No forked UI.

### Standalone page (`/calc`)

- **New Vite entry** `calc.html` + `src/calc-main.jsx`, added to the existing
  `rollupOptions.input` in `vite.config.js` alongside `landing` and `app`.
- `calc-main.jsx` mounts **only** the calculator plus its marketing chrome — **no**
  `AuthProvider`, **no** `WeddingProvider`, **no** login, and **no** `QueryClientProvider`
  (the calculator computes client-side and the capture call is a plain `fetch`). Light
  theme only, matching the static landing (no `ThemeProvider`). It imports `src/index.css`
  for tokens/fonts.
- **Page layout (top → bottom):**
  1. Slim header — monogram + WEDFLOW wordmark + a quiet "כניסה למערכת" link to `/app`
     (mirrors the landing header).
  2. Brief hero — H1 "כמה תעלה לכם החתונה?" + one supporting line.
  3. The calculator (`<VenueCalculator showSystemExpenses={false} />`).
  4. Conversion block (see below).
  5. Slim footer with a link back to `wedflow.live/`.
- **SEO:** `calc.html`'s `<head>` carries a Hebrew `<title>`, `meta description`,
  Open Graph/Twitter tags, `SoftwareApplication` JSON-LD, and
  `<link rel="canonical" href="https://wedflow.live/calc">`. The H1 and intro copy are
  placed statically in the shell (outside the React root) so crawlers see them
  pre-hydration.

### Conversion + lead capture

- The calculator result is **always fully visible** — never gated.
- Below the result, a compact block: "שלחו לעצמכם את החישוב במייל" — an email input +
  submit button.
- On submit:
  1. Client validates the email and POSTs the email + a snapshot of the current
     calculation to the public edge function `submitCalculatorLead`.
  2. The function inserts a row into `leads` (service role, server-side) and sends the
     branded breakdown email via the existing Resend service.
  3. UI shows a success state ("שלחנו לכם את החישוב 🎉").
- A **persistent secondary CTA** appears on the page (near the result and in the footer):
  "רוצים לעקוב אחרי כל התקציב? התחילו בחינם ב-WedFlow" → `/app`. This is the bridge: the
  calculator gives the venue number; the platform tracks everything else.

## Data model

New table `leads` (created via the `supabase-schema-change` skill: table + RLS + grants +
client shim + test):

```
leads (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  source        text not null default 'calculator',  -- future-proof for other lead origins
  guest_count   integer,
  cost_per_head numeric,
  total_cost    numeric,
  budget_status text,                                 -- 'ok' | 'warn' | 'over'
  payload       jsonb,                                -- full input snapshot
  created_at    timestamptz not null default now()
)
```

**RLS / grants:**
- No public (anon) or member `select`/`insert`/`update`/`delete`.
- Inserts happen only through the edge function using the **service role** (which
  bypasses RLS).
- Admins may `select` (align with the existing admin pattern used by `AdminDashboard`).

## Edge function

`supabase/functions/submitCalculatorLead/`:
- **Public:** `verify_jwt = false` in `supabase/config.toml` (like other public-facing
  functions).
- Validates the request body (well-formed email; coerces/limits numeric snapshot fields).
- Inserts one `leads` row via the service-role client.
- Calls the shared `sendEmail(...)` module with the new `calculatorBreakdown` template.
- Returns `{ ok: true }` on success; returns a safe error otherwise. Failure to send the
  email must not lose the lead (insert first, then email; surface email failure in logs,
  still return ok for the lead).
- Basic input hardening only for v1 (email format, field bounds). No CAPTCHA / rate
  limiting in v1 — noted as a follow-up.

## Email template

New template `calculatorBreakdown` in `supabase/functions/_shared/email/templates/`,
registered in `templates/index.ts`:
- RTL Hebrew, uses the existing `layout.ts` / `components.ts` brand system.
- Content: their guest count, cost-per-head, total cost, and budget status, rendered with
  `infoRow()`/`card()`, plus a `button()` CTA → WedFlow (`/app`).
- Subject: e.g. "החישוב שלכם: כמה תעלה החתונה".

## Landing page section

Add one static section to `index.html`, in the existing hand-crafted style (no new JS on
the landing):
- Eyebrow + H2 ("כמה באמת תעלה לכם החתונה?") + short supporting copy.
- A static visual **preview** of the calculator result card (reusing the existing
  `.mock` / bar / tag styling), showing a sample per-head number and the green "בתקציב"
  indicator.
- A prominent rose CTA button "חשבו כמה תעלה לכם החתונה" → `/calc`.
- Add a link to the calculator in the header nav and/or footer links.
- Placement: after the hero / within or adjacent to the features band, wherever it reads
  best in the existing flow.

## Routing / domain

- **`vercel.json`:**
  - Add a rewrite `"/calc"` → `"/calc.html"` (and, if the SPA client-routes under it in
    future, `"/calc/(.*)"` → `"/calc.html"`; v1 is a single page so `/calc` suffices).
  - Ensure `calc` is **not** captured by the existing `/(...)` → `/app/$1` redirect list
    (it isn't in the current list; keep it that way).
- **`vite.config.js`:** add `calc: fileURLToPath(new URL('./calc.html', import.meta.url))`
  to `build.rollupOptions.input`. The existing `appShellRewrite` dev plugin only rewrites
  `/app*`; add an analogous dev rewrite so `/calc` serves `calc.html` under `vite dev` /
  `vite preview`.
- **`calc.wedflow.live`:** **manual step (user-side, in Vercel).** Add the subdomain to
  the Vercel project and configure a 301 redirect to `https://wedflow.live/calc`. DNS and
  Vercel domain configuration cannot be done from this repo. Canonical remains
  `wedflow.live/calc`.

## Data flow

```
Landing (index.html)  --CTA link-->  /calc  (calc.html + calc-main.jsx)
                                        |
                       user fills VenueCalculator (showSystemExpenses=false)
                                        |
                       result always visible  ──► shared src/lib/venueCalc.js
                                        |
                       "email me the breakdown" (email + snapshot)
                                        |
                          POST → submitCalculatorLead (public edge fn)
                              ├─ insert into leads (service role)
                              └─ sendEmail(calculatorBreakdown) via Resend
                                        |
                       success state + persistent CTA → /app (sign up)
```

## Error handling

- **Invalid email:** client-side validation blocks submit and shows an inline message;
  the edge function re-validates and returns a safe error if bypassed.
- **Edge function / network failure:** the capture form shows a non-blocking error
  ("לא הצלחנו לשמור כרגע, נסו שוב"); the calculator result stays fully usable regardless.
- **Email send failure:** the lead is still persisted (insert before send); the send
  failure is logged (`email_log` already records sends) and does not fail the request.
- The calculator itself has no server dependency — it computes entirely client-side, so
  it always works even if capture is down.

## Testing / verification

- **Unit:** tests for `src/lib/venueCalc.js` (per-head, totals, budget-status thresholds
  at boundaries 570/580). A shim/test for the `leads` table per the
  `supabase-schema-change` skill. Email render test for `calculatorBreakdown` (placeholder
  guard, like existing templates).
- **In-app regression:** confirm `Calculator.jsx` / `VenueCalculator` behave exactly as
  before with `showSystemExpenses` defaulting to `true`.
- **Standalone:** browser-verify `/calc` renders with no auth, calculator computes,
  the "email me" flow calls the edge function and shows success, and the CTA links to
  `/app`. Verify SEO tags present in `calc.html`. Responsive + dark mode intact.
- **Landing:** browser-verify the new section renders statically, the CTA links to
  `/calc`, and no JS/console errors are introduced.

## Out of scope for v1

- The broader multi-category wedding budget estimator (the "room to grow").
- Any change to in-app auth, routing under `/app`, or the existing calculator's
  computed behavior.
- CAPTCHA / rate limiting on the lead endpoint (follow-up if abuse appears).
- Subscription/newsletter management beyond storing the lead (the email service spec
  already defers this as YAGNI).
