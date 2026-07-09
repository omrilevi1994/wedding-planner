# Standalone WedFlow Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing venue cost-per-head calculator as a public, no-login lead-magnet at `wedflow.live/calc`, showcased on the landing page, capturing email leads via a public edge function — all built once so the in-app, standalone, and landing surfaces never drift.

**Architecture:** Extract the calculator's arithmetic into a pure module (`src/lib/venueCalc.js`) imported by the one-and-only `VenueCalculator` React component. That component gains a `showSystemExpenses` prop (hides the platform-only expenses row on `/calc`) and an optional `onCompute` callback (feeds the lead snapshot). A new Vite entry `calc.html` + `src/calc-main.jsx` mounts the calculator plus marketing chrome with no auth/providers. Lead capture POSTs to a public `submitCalculatorLead` edge function that inserts into a new `leads` table (service role) and sends a branded email via the existing Resend service. The landing gets a static showcase section linking to `/calc`.

**Tech Stack:** Vite (multi-page rollup input), React 18, Tailwind (tokens in `src/index.css`), shadcn UI, Supabase (Postgres + RLS + Deno edge functions), Resend email, PostHog analytics, Vitest.

## Global Constraints

- **Build the calculator ONCE.** The same `src/components/dashboard/VenueCalculator.jsx` renders in-app and on `/calc`. No forked calculator UI. Only the arithmetic moves to `src/lib/venueCalc.js`.
- **In-app behavior unchanged.** `src/pages/Calculator.jsx` / `VenueCalculator` must behave exactly as before. `showSystemExpenses` defaults to `true`; `onCompute` defaults to `undefined`.
- **Budget thresholds copied verbatim:** `TARGET = 570`, `WARN = 580` (₪/head). Green `≤ 570`, orange `> 570 && ≤ 580`, red `> 580`.
- **Standalone entry has no providers:** `calc-main.jsx` mounts with **no** `AuthProvider`, **no** `WeddingProvider`, **no** login, **no** `QueryClientProvider`, **no** `ThemeProvider`. Light theme only. Import `@/index.css` for tokens/fonts. The lead-capture call is a plain `fetch` (no `supabase-js` bundled into `/calc`).
- **Canonical URL:** `https://wedflow.live/calc`. Hebrew RTL throughout (`lang="he" dir="rtl"`).
- **Edge function is public:** `verify_jwt = false` for `submitCalculatorLead`. Insert the lead BEFORE sending the email; an email-send failure must NOT lose the lead or fail the request.
- **`leads` table is server-write-only:** no anon/member `select`/`insert`/`update`/`delete`; inserts happen only via the service role in the edge function; platform admins may `select`.
- **Analytics events (PostHog, already installed — `src/lib/posthog.js` exports `capture()`):** `calc_used`, `calc_lead_submitted`, `calc_cta_clicked`. `capture()` safely no-ops when analytics is disabled.
- **Test runner:** unit tests live in `tests/unit/` and run with `npm run test:unit` (`vitest run tests/unit`). The `@/` alias and `.ts` imports from `supabase/functions/` already work under Vitest. Never run tests from a `.claude/` path (excluded); run from the worktree root.
- **Out of scope:** multi-category estimator, CAPTCHA/rate-limiting, newsletter management, DNS/`calc.wedflow.live` (manual Vercel step by the user).

---

### Task 1: Extract pure cost math into `src/lib/venueCalc.js`

Move the arithmetic out of `VenueCalculator.jsx` into a pure, tested module. No behavior change yet — the component is refactored to import the module and must render identically.

**Files:**
- Create: `src/lib/venueCalc.js`
- Create: `tests/unit/venueCalc.test.js`
- Modify: `src/components/dashboard/VenueCalculator.jsx` (replace inline math with module calls)

**Interfaces:**
- Produces:
  - `TARGET: number` (= 570), `WARN: number` (= 580)
  - `computeCostPerHead({ dishCost, barCost, serviceCost, extraItems }) → number`
  - `computeTotals({ dishCost, barCost, serviceCost, extraItems, fixedItems, guestCount, systemExpenses }) → { costPerHead, totalFixed, totalVenueCost, grandTotal, costPerGuest }`
  - `budgetStatus(costPerGuest) → { level: 'none'|'ok'|'warn'|'over', value: number, label: string }`
  - Inputs may be strings or numbers (the component holds `Input` values as strings). Coercion matches the original: `parseFloat(v) || 0` for money, `parseInt(v,10) || 0` for guests. `extraItems`/`fixedItems` default to `[]`; `systemExpenses` defaults to `0`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/venueCalc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  TARGET, WARN, computeCostPerHead, computeTotals, budgetStatus,
} from '@/lib/venueCalc';

describe('constants', () => {
  it('uses the 570/580 thresholds verbatim', () => {
    expect(TARGET).toBe(570);
    expect(WARN).toBe(580);
  });
});

describe('computeCostPerHead', () => {
  it('sums dish + bar + service + per-head extras', () => {
    expect(computeCostPerHead({
      dishCost: '370', barCost: '35', serviceCost: '35',
      extraItems: [{ amount: '10' }, { amount: '5' }],
    })).toBe(455);
  });
  it('treats blank/NaN inputs as 0 and defaults missing arrays', () => {
    expect(computeCostPerHead({ dishCost: '', barCost: 'abc' })).toBe(0);
    expect(computeCostPerHead({ dishCost: '370' })).toBe(370);
  });
});

describe('computeTotals', () => {
  it('computes venue, grand total and per-guest with system expenses', () => {
    const t = computeTotals({
      dishCost: '400', barCost: '', serviceCost: '', extraItems: [],
      fixedItems: [{ amount: '3000' }], guestCount: '200', systemExpenses: 20000,
    });
    expect(t.costPerHead).toBe(400);
    expect(t.totalFixed).toBe(3000);
    expect(t.totalVenueCost).toBe(83000);   // 400*200 + 3000
    expect(t.grandTotal).toBe(103000);       // + 20000
    expect(t.costPerGuest).toBe(515);        // 103000 / 200
  });
  it('per-guest is 0 when there are no guests (no divide-by-zero)', () => {
    expect(computeTotals({ dishCost: '400', guestCount: '0' }).costPerGuest).toBe(0);
    expect(computeTotals({ dishCost: '400', guestCount: '' }).costPerGuest).toBe(0);
  });
  it('systemExpenses defaults to 0 (standalone case)', () => {
    const t = computeTotals({ dishCost: '400', guestCount: '100' });
    expect(t.grandTotal).toBe(40000);
    expect(t.costPerGuest).toBe(400);
  });
});

describe('budgetStatus thresholds (rounded ₪/head)', () => {
  it('none when zero/negative', () => {
    expect(budgetStatus(0).level).toBe('none');
    expect(budgetStatus(0).label).toBe('');
  });
  it('ok at and below 570', () => {
    expect(budgetStatus(570).level).toBe('ok');
    expect(budgetStatus(569.4).level).toBe('ok'); // rounds to 569
    expect(budgetStatus(1).level).toBe('ok');
  });
  it('warn above 570 up to and including 580', () => {
    expect(budgetStatus(570.6).level).toBe('warn'); // rounds to 571
    expect(budgetStatus(580).level).toBe('warn');
  });
  it('over above 580', () => {
    expect(budgetStatus(580.6).level).toBe('over'); // rounds to 581
    expect(budgetStatus(1000).level).toBe('over');
  });
  it('carries the exact Hebrew labels', () => {
    expect(budgetStatus(500).label).toBe('✓ בתקציב');
    expect(budgetStatus(575).label).toBe('⚠ קרוב לגבול');
    expect(budgetStatus(600).label).toBe('✗ חורג מהתקציב');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- venueCalc`
Expected: FAIL — `Failed to resolve import "@/lib/venueCalc"`.

- [ ] **Step 3: Write `src/lib/venueCalc.js`**

```js
// Pure cost math for the venue calculator. No React, no DOM — imported by both the
// in-app (Calculator.jsx) and standalone (/calc) calculators so the arithmetic never drifts.
// Extracted verbatim from VenueCalculator.jsx; coercion rules match the original component.

// ₪/head budget thresholds (were hardcoded in the component).
export const TARGET = 570; // green at or below
export const WARN = 580;   // orange up to and including; red above

const money = (v) => parseFloat(v) || 0;
const count = (v) => parseInt(v, 10) || 0;

// Per-head venue cost: dish + bar + service + each per-head extra item.
export function computeCostPerHead({ dishCost, barCost, serviceCost, extraItems = [] } = {}) {
  return money(dishCost) + money(barCost) + money(serviceCost) +
    extraItems.reduce((sum, i) => sum + money(i.amount), 0);
}

// All money totals. `systemExpenses` is the platform-only "rest of expenses" figure;
// it is 0 on the standalone calculator (showSystemExpenses=false) and for guest-less input.
export function computeTotals({
  dishCost, barCost, serviceCost, extraItems = [],
  fixedItems = [], guestCount, systemExpenses = 0,
} = {}) {
  const costPerHead = computeCostPerHead({ dishCost, barCost, serviceCost, extraItems });
  const totalFixed = fixedItems.reduce((sum, i) => sum + money(i.amount), 0);
  const guests = count(guestCount);
  const totalVenueCost = costPerHead * guests + totalFixed;
  const grandTotal = totalVenueCost + money(systemExpenses);
  const costPerGuest = guests > 0 ? grandTotal / guests : 0;
  return { costPerHead, totalFixed, totalVenueCost, grandTotal, costPerGuest };
}

// Green/orange/red verdict for an average ₪/head figure. `value` is the rounded ₪/head.
export function budgetStatus(costPerGuest) {
  const value = Math.round(costPerGuest || 0);
  if (!(costPerGuest > 0)) return { level: 'none', value, label: '' };
  if (value <= TARGET) return { level: 'ok', value, label: '✓ בתקציב' };
  if (value <= WARN) return { level: 'warn', value, label: '⚠ קרוב לגבול' };
  return { level: 'over', value, label: '✗ חורג מהתקציב' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- venueCalc`
Expected: PASS (all cases green).

- [ ] **Step 5: Refactor `VenueCalculator.jsx` to use the module (no behavior change)**

In `src/components/dashboard/VenueCalculator.jsx`:

1. Add the import after the existing imports (line 6):

```jsx
import { computeTotals, budgetStatus, TARGET } from '@/lib/venueCalc';
```

2. Replace the inline math block (current lines 44-50) with:

```jsx
  const { costPerHead: costPerHeadVenue, totalVenueCost, grandTotal, costPerGuest: costPerGuestTotal } =
    computeTotals({ dishCost, barCost, serviceCost, extraItems, fixedItems, guestCount, systemExpenses: totalExpenses });
```

3. Replace the average-cost IIFE (current lines 242-282) so the thresholds come from `budgetStatus`, preserving the exact presentation:

```jsx
          {/* Average cost with color indicator */}
          {(() => {
            const status = budgetStatus(costPerGuestTotal);
            const val = status.value;
            const isGreen = status.level === 'ok';
            const isOrange = status.level === 'warn';
            const isRed = status.level === 'over';
            const bgClass = isGreen ? 'bg-sage/15' : isOrange ? 'bg-champagne' : isRed ? 'bg-destructive/10' : 'bg-champagne';
            const textClass = isGreen ? 'text-sage-deep' : isOrange ? 'text-rose-deep' : isRed ? 'text-destructive' : 'text-rose-deep';
            const barColor = isGreen ? 'bg-sage' : isOrange ? 'bg-rose' : 'bg-destructive';
            const barWidth = costPerGuestTotal > 0 ? Math.min((val / (TARGET * 1.3)) * 100, 100) : 0;
            const statusText = status.label;

            return (
              <div className={`${bgClass} rounded-xl px-3 py-3 space-y-2`}>
                <div className="flex justify-between items-center">
                  <span className={`font-semibold text-sm ${textClass}`}>עלות ממוצעת לראש:</span>
                  <div className="text-left">
                    <span className={`text-xl font-bold ${textClass}`}>
                      {costPerGuestTotal > 0 ? `₪${val.toLocaleString('he-IL')}` : '-'}
                    </span>
                    {statusText && <span className={`text-xs font-medium mr-2 ${textClass}`}>{statusText}</span>}
                  </div>
                </div>
                {costPerGuestTotal > 0 && (
                  <div className="space-y-1">
                    <div className="w-full bg-card/60 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`${barColor} h-2.5 rounded-full transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>₪0</span>
                      <span className="font-medium">יעד: ₪{TARGET.toLocaleString('he-IL')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
```

Leave everything else (JSX, the `totalFixedCosts` no longer needed — remove the now-unused `const totalFixedCosts` line) intact. Note: the standalone default `totalExpenses` is handled in Task 2; here the signature is still `{ totalExpenses, totalConfirmed, totalInvited }`.

- [ ] **Step 6: Run the full unit suite to confirm nothing regressed**

Run: `npm run test:unit`
Expected: PASS. Then `npm run lint` — expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/venueCalc.js tests/unit/venueCalc.test.js src/components/dashboard/VenueCalculator.jsx
git commit -m "refactor(calc): extract venue cost math into pure src/lib/venueCalc.js"
```

---

### Task 2: Add `showSystemExpenses` + `onCompute` props to `VenueCalculator`

Make the one shared component reusable on `/calc`: hide the platform-only expenses row (and drop it from the grand total) when `showSystemExpenses={false}`, expose the live calculation snapshot via `onCompute`, and fire the `calc_used` analytics event. Defaults preserve exact in-app behavior.

**Files:**
- Modify: `src/components/dashboard/VenueCalculator.jsx`
- Create: `tests/unit/venueCalculator.test.jsx`

**Interfaces:**
- Consumes: `computeTotals`, `budgetStatus` from `@/lib/venueCalc` (Task 1); `capture` from `@/lib/posthog`.
- Produces: `VenueCalculator` props extended to
  `{ totalExpenses = 0, totalConfirmed, totalInvited, showSystemExpenses = true, onCompute }`.
  - `onCompute(snapshot)` (optional) is called whenever inputs change, with
    `snapshot = { guestCount: number, costPerHead: number, totalVenueCost: number, totalCost: number, budgetStatus: 'none'|'ok'|'warn'|'over', inputs: { dishCost, barCost, serviceCost, extraItems, fixedItems, guestCount } }`.
    `totalCost` is `grandTotal` (venue-only when `showSystemExpenses` is false).
  - `calc_used` fires exactly once per mount, the first time `costPerHead > 0`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/venueCalculator.test.jsx`. This uses `@testing-library/react` — if it is not installed, install it as a dev dependency first: `npm i -D @testing-library/react @testing-library/jest-dom jsdom` and add `environment: 'jsdom'` is NOT global (the suite is `node`); instead annotate this file with the jsdom environment via the docblock comment shown below.

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const captureMock = vi.fn();
vi.mock('@/lib/posthog', () => ({ capture: (...a) => captureMock(...a) }));

import VenueCalculator from '@/components/dashboard/VenueCalculator';

beforeEach(() => captureMock.mockClear());

describe('VenueCalculator — showSystemExpenses', () => {
  it('renders the system-expenses row by default (in-app)', () => {
    render(<VenueCalculator totalExpenses={12345} totalInvited={100} />);
    expect(screen.getByText('שאר הוצאות מהמערכת:')).toBeTruthy();
  });

  it('hides the system-expenses row when showSystemExpenses=false (standalone)', () => {
    render(<VenueCalculator showSystemExpenses={false} totalInvited={100} />);
    expect(screen.queryByText('שאר הוצאות מהמערכת:')).toBeNull();
  });
});

describe('VenueCalculator — onCompute + analytics', () => {
  it('reports a snapshot and fires calc_used once when a dish cost is entered', () => {
    const onCompute = vi.fn();
    render(<VenueCalculator showSystemExpenses={false} totalInvited={100} onCompute={onCompute} />);
    const dish = screen.getByPlaceholderText('לדוגמה: 370');
    fireEvent.change(dish, { target: { value: '400' } });
    const last = onCompute.mock.calls.at(-1)[0];
    expect(last.costPerHead).toBe(400);
    expect(last.totalCost).toBe(40000);       // 400 * 100, no system expenses
    expect(last.budgetStatus).toBe('ok');     // 400 ≤ 570
    expect(captureMock).toHaveBeenCalledWith('calc_used', expect.anything());
    expect(captureMock.mock.calls.filter(c => c[0] === 'calc_used')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- venueCalculator`
Expected: FAIL — system-expenses row present when it should be hidden / `onCompute` never called.

- [ ] **Step 3: Implement the prop changes**

In `src/components/dashboard/VenueCalculator.jsx`:

1. Extend imports:

```jsx
import React, { useState, useEffect, useRef } from 'react';
```

and add `import { capture } from '@/lib/posthog';` alongside the Task 1 import.

2. Change the signature (line 8) to:

```jsx
export default function VenueCalculator({
  totalExpenses = 0, totalConfirmed, totalInvited,
  showSystemExpenses = true, onCompute,
}) {
```

3. After the `computeTotals(...)` destructure (from Task 1), add an effect that reports the snapshot and fires `calc_used` once:

```jsx
  const usedFired = useRef(false);
  useEffect(() => {
    if (!usedFired.current && costPerHeadVenue > 0) {
      usedFired.current = true;
      capture('calc_used', { show_system_expenses: showSystemExpenses });
    }
    if (onCompute) {
      onCompute({
        guestCount: parseInt(guestCount, 10) || 0,
        costPerHead: costPerHeadVenue,
        totalVenueCost,
        totalCost: grandTotal,
        budgetStatus: budgetStatus(costPerGuestTotal).level,
        inputs: { dishCost, barCost, serviceCost, extraItems, fixedItems, guestCount },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costPerHeadVenue, totalVenueCost, grandTotal, costPerGuestTotal, guestCount, showSystemExpenses]);
```

4. Wrap the system-expenses result row (current lines 229-232) so it only renders when `showSystemExpenses`:

```jsx
          {showSystemExpenses && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">שאר הוצאות מהמערכת:</span>
              <span className="font-semibold">₪{totalExpenses.toLocaleString('he-IL')}</span>
            </div>
          )}
```

(The `grandTotal` already excludes system expenses when `totalExpenses` is 0; on `/calc` the caller passes no `totalExpenses`, so it defaults to 0 and the venue cost is the grand total.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- venueCalculator`
Expected: PASS.

- [ ] **Step 5: Confirm in-app regression — the full suite + a manual read**

Run: `npm run test:unit`
Expected: PASS. Confirm `src/pages/Calculator.jsx` still calls `<VenueCalculator totalExpenses={totalExpected} .../>` with no other change — defaults keep the row visible and `onCompute` unused.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/VenueCalculator.jsx tests/unit/venueCalculator.test.jsx package.json package-lock.json
git commit -m "feat(calc): add showSystemExpenses + onCompute props and calc_used event"
```

---

### Task 3: Create the `leads` table (schema-change skill)

Create the server-write-only leads store: migration (table + RLS + grants), the client shim mapping, and tests. **Use the `supabase-schema-change` skill** to drive this — it produces the migration, shim entry, and test in the project's conventional shape. The content below is the exact schema/RLS/shim/test to implement.

**Files:**
- Create: `supabase/migrations/0015_leads.sql`
- Modify: `src/api/entities-config.js` (add `Lead: 'leads'` to `TABLE_MAP`)
- Create: `tests/unit/leads-shim.test.js`
- Create: `tests/integration/leads.test.js`

**Interfaces:**
- Produces: table `leads`; `wedflow.entities.Lead` resolving to the `leads` table via `TABLE_MAP.Lead === 'leads'`.

- [ ] **Step 1: Invoke the schema-change skill**

Announce and invoke `supabase-schema-change`. Provide it this entity: table `leads`, columns per the spec, RLS = admin-select only + no anon/member access, grants aligned with the existing admin pattern. Let the skill scaffold; ensure the artifacts match Steps 2-6.

- [ ] **Step 2: Write the failing shim unit test**

Create `tests/unit/leads-shim.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TABLE_MAP } from '@/api/entities-config';

describe('leads shim mapping', () => {
  it('maps the Lead entity to the leads table', () => {
    expect(TABLE_MAP.Lead).toBe('leads');
  });
});
```

Run: `npm run test:unit -- leads-shim` → Expected: FAIL (`TABLE_MAP.Lead` is undefined).

- [ ] **Step 3: Add the shim mapping**

In `src/api/entities-config.js`, add to `TABLE_MAP`:

```js
  Lead: 'leads',
```

Run: `npm run test:unit -- leads-shim` → Expected: PASS.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/0015_leads.sql`:

```sql
-- Marketing/lead-capture store for the public /calc calculator. Rows are inserted ONLY
-- by the submitCalculatorLead edge function using the service role (which bypasses RLS).
-- No anon/member access; platform admins may read (aligns with the AdminDashboard pattern).
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  source        text not null default 'calculator',
  guest_count   integer,
  cost_per_head numeric,
  total_cost    numeric,
  budget_status text,                                 -- 'ok' | 'warn' | 'over'
  payload       jsonb,                                -- full input snapshot
  created_at    timestamptz not null default now()
);

alter table public.leads enable row level security;

-- Platform admins may read leads; everyone else gets nothing through RLS.
-- (Service-role inserts from the edge function bypass RLS entirely.)
drop policy if exists "leads_admin_select" on public.leads;
create policy "leads_admin_select" on public.leads
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_platform_admin = true
  ));

-- Data-API grants: no anon access at all; authenticated may only SELECT (further gated by RLS).
revoke all on public.leads from anon, authenticated;
grant select on public.leads to authenticated;
```

- [ ] **Step 5: Apply the migration locally and write the integration test**

Start the local stack via the `run-local` skill (or `npm run db:reset` to apply migrations). Create `tests/integration/leads.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin } from './setup.js';

describe('leads RLS + service-role insert', () => {
  it('service role can insert a lead', async () => {
    const { data, error } = await admin.from('leads').insert({
      email: 'lead-test@example.com', source: 'calculator',
      guest_count: 200, cost_per_head: 450, total_cost: 90000, budget_status: 'ok',
      payload: { dishCost: '450' },
    }).select().single();
    expect(error).toBeNull();
    expect(data.email).toBe('lead-test@example.com');
    await admin.from('leads').delete().eq('id', data.id);
  });

  it('anon cannot select or insert leads', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data: rows } = await anon.from('leads').select('*').limit(1);
    expect(rows?.length ?? 0).toBe(0);
    const { error: insErr } = await anon.from('leads').insert({ email: 'x@y.com' });
    expect(insErr).not.toBeNull(); // blocked by revoked grant / RLS
  });
});
```

Run: `npm run test:int -- leads`
Expected: PASS (requires the local stack running).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_leads.sql src/api/entities-config.js tests/unit/leads-shim.test.js tests/integration/leads.test.js
git commit -m "feat(leads): add server-write-only leads table, shim mapping and tests"
```

---

### Task 4: Add the `calculatorBreakdown` email template

New RTL Hebrew template rendered by the existing Resend service, registered in the template map. Includes the render-guard test and updating the existing template-count assertion.

**Files:**
- Create: `supabase/functions/_shared/email/templates/calculatorBreakdown.ts`
- Modify: `supabase/functions/_shared/email/templates/index.ts`
- Modify: `tests/unit/email.test.js`

**Interfaces:**
- Consumes: `renderLayout` (`../layout.ts`); `button, divider, eyebrow, heading, infoCard, note, paragraph, esc` (`../components.ts`).
- Produces: template id `calculatorBreakdown` with `subject/html/text` builders. Data shape:
  `{ guestCount?: number|null, costPerHead?: number|null, totalCost?: number|null, budgetStatus?: 'ok'|'warn'|'over'|null }`.

- [ ] **Step 1: Write the failing test (extend `email.test.js`)**

In `tests/unit/email.test.js`, update the id list and count. Change:

```js
const TEMPLATE_IDS = ['weddingInvite', 'memberAdded', 'authVerification', 'authPasswordReset', 'authMagicLink'];
```

to:

```js
const TEMPLATE_IDS = ['weddingInvite', 'memberAdded', 'authVerification', 'authPasswordReset', 'authMagicLink', 'calculatorBreakdown'];
```

Change the assertion `'exposes exactly the five expected template ids'` to `'exposes exactly the six expected template ids'` (the `.toEqual` on sorted keys still works with the extended array). Then append a content test:

```js
describe('renderEmail — calculatorBreakdown content', () => {
  it('renders the guest count, per-head, total and an /app CTA', () => {
    const { subject, html, text } = renderEmail('calculatorBreakdown', {
      guestCount: 200, costPerHead: 450, totalCost: 90000, budgetStatus: 'ok',
    });
    expect(subject).toContain('החישוב שלכם');
    expect(html).toContain('200');
    expect(html).toContain('₪450');
    expect(html).toContain('₪90,000');
    expect(html).toContain('href="https://wedflow.live/app"');
    expect(text).toContain('WedFlow');
  });
});
```

Run: `npm run test:unit -- email` → Expected: FAIL (`Unknown email template: "calculatorBreakdown"` and id-count mismatch).

- [ ] **Step 2: Write the template**

Create `supabase/functions/_shared/email/templates/calculatorBreakdown.ts`:

```ts
// Sent when a /calc visitor asks to "email me the breakdown". RTL Hebrew, uses the shared
// brand layout/components. Bridges to the full platform with an /app CTA.

import { renderLayout } from '../layout.ts';
import { button, divider, eyebrow, heading, infoCard, note, paragraph } from '../components.ts';

interface Data {
  guestCount?: number | null;
  costPerHead?: number | null;
  totalCost?: number | null;
  budgetStatus?: string | null;
}

const APP_URL = 'https://wedflow.live/app';
const shekel = (n: unknown): string => `₪${(Math.round(Number(n) || 0)).toLocaleString('he-IL')}`;
const STATUS_LABEL: Record<string, string> = {
  ok: '✓ בתקציב', warn: '⚠ קרוב לגבול', over: '✗ חורג מהתקציב',
};

function rows(d: Data): Array<{ label: string; value: string }> {
  const r = [
    { label: 'מספר מוזמנים', value: d.guestCount != null ? String(d.guestCount) : '—' },
    { label: 'עלות אולם לראש', value: d.costPerHead != null ? shekel(d.costPerHead) : '—' },
    { label: 'סה״כ עלות', value: d.totalCost != null ? shekel(d.totalCost) : '—' },
  ];
  if (d.budgetStatus && STATUS_LABEL[d.budgetStatus]) {
    r.push({ label: 'סטטוס תקציב', value: STATUS_LABEL[d.budgetStatus] });
  }
  return r;
}

export function subject(_d: Data): string {
  return 'החישוב שלכם: כמה תעלה החתונה';
}

export function html(d: Data): string {
  const content = `
    ${eyebrow('מחשבון WedFlow')}
    ${heading('החישוב שלכם')}
    ${paragraph('הנה סיכום עלות החתונה שחישבתם במחשבון WedFlow.')}
    ${infoCard(rows(d))}
    ${divider()}
    ${paragraph('רוצים לעקוב אחרי כל התקציב, לא רק האולם? נהלו את כל החתונה במקום אחד ב-WedFlow — מוזמנים, ספקים, תשלומים וצ׳קליסט.')}
    <div style="text-align:center;">
      ${button('להתחיל בחינם ב-WedFlow', APP_URL)}
    </div>
    ${note('קיבלתם את המייל הזה כי ביקשתם לשלוח לעצמכם את החישוב מהמחשבון של WedFlow.')}
  `;
  return renderLayout({ preheader: 'סיכום עלות החתונה שחישבתם ב-WedFlow', content });
}

export function text(d: Data): string {
  return [
    'החישוב שלכם — WedFlow',
    '',
    `מספר מוזמנים: ${d.guestCount != null ? d.guestCount : '—'}`,
    `עלות אולם לראש: ${d.costPerHead != null ? shekel(d.costPerHead) : '—'}`,
    `סה״כ עלות: ${d.totalCost != null ? shekel(d.totalCost) : '—'}`,
    d.budgetStatus && STATUS_LABEL[d.budgetStatus] ? `סטטוס תקציב: ${STATUS_LABEL[d.budgetStatus]}` : '',
    '',
    'רוצים לעקוב אחרי כל התקציב? התחילו בחינם:',
    APP_URL,
    '',
    '— WedFlow',
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 3: Register the template**

In `supabase/functions/_shared/email/templates/index.ts`, add the import next to the others:

```ts
import * as calculatorBreakdown from './calculatorBreakdown.ts';
```

and add `calculatorBreakdown,` to the `templates` object.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- email`
Expected: PASS (six templates; content assertions green).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/email/templates/calculatorBreakdown.ts supabase/functions/_shared/email/templates/index.ts tests/unit/email.test.js
git commit -m "feat(email): add calculatorBreakdown RTL template"
```

---

### Task 5: Public `submitCalculatorLead` edge function

Public endpoint that validates the request, inserts one `leads` row via the service role, then best-effort sends the breakdown email. Insert-before-send so an email failure never loses the lead.

**Files:**
- Create: `supabase/functions/submitCalculatorLead/index.ts`
- Modify: `supabase/config.toml` (add the `verify_jwt = false` block)

**Interfaces:**
- Consumes: `corsHeaders` (`../_shared/cors.ts`); `sendEmail` (`../_shared/email/send.ts`); the `leads` table (Task 3); template `calculatorBreakdown` (Task 4).
- Produces: `POST /functions/v1/submitCalculatorLead` accepting
  `{ email, guestCount?, costPerHead?, totalCost?, budgetStatus?, payload? }` → `{ ok: true }` on success; `{ error }` with a 4xx/5xx otherwise.

- [ ] **Step 1: Write the function**

Create `supabase/functions/submitCalculatorLead/index.ts`:

```ts
// PUBLIC (verify_jwt=false): the /calc "email me the breakdown" endpoint. Inserts a lead
// via the service role, then best-effort sends the branded email. Insert BEFORE send so an
// email failure never loses the lead. v1 hardening: email format + numeric bounds only.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email/send.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUS = new Set(['ok', 'warn', 'over']);

// Coerce to a non-negative number capped at `max`, or null if unusable.
function boundedNum(v: unknown, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return Response.json({ error: 'invalid_email' }, { status: 400, headers: corsHeaders });
    }

    const guestCount = boundedNum(body.guestCount, 100000);
    const costPerHead = boundedNum(body.costPerHead, 1000000);
    const totalCost = boundedNum(body.totalCost, 1000000000);
    const budgetStatus = VALID_STATUS.has(body.budgetStatus) ? body.budgetStatus : null;
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: insertErr } = await service.from('leads').insert({
      email, source: 'calculator',
      guest_count: guestCount, cost_per_head: costPerHead,
      total_cost: totalCost, budget_status: budgetStatus, payload,
    });
    if (insertErr) {
      console.error('leads insert failed:', insertErr.message);
      return Response.json({ error: 'save_failed' }, { status: 500, headers: corsHeaders });
    }

    // Best-effort — the lead is already persisted; email failure is logged, not fatal.
    try {
      await sendEmail({
        to: email, templateId: 'calculatorBreakdown',
        data: { guestCount, costPerHead, totalCost, budgetStatus },
      });
    } catch (e) {
      console.error('calculatorBreakdown email failed:', e instanceof Error ? e.message : String(e));
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders },
    );
  }
});
```

- [ ] **Step 2: Mark the function public in `config.toml`**

Append to `supabase/config.toml`:

```toml
[functions.submitCalculatorLead]
verify_jwt = false
```

- [ ] **Step 3: Serve functions locally and smoke-test the endpoint**

With the local stack running (`run-local` skill), serve functions: `npm run functions:serve`. Then in another shell, POST a valid body and confirm `{ ok: true }` and a new `leads` row (verify via the integration client or Supabase Studio):

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/submitCalculatorLead \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","guestCount":200,"costPerHead":450,"totalCost":90000,"budgetStatus":"ok","payload":{"dishCost":"450"}}'
```

Expected: `{"ok":true}`. Then POST `{"email":"nope"}` → Expected: HTTP 400 `{"error":"invalid_email"}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/submitCalculatorLead/index.ts supabase/config.toml
git commit -m "feat(functions): public submitCalculatorLead endpoint (insert lead + email)"
```

---

### Task 6: Standalone `/calc` page — Vite entry, React chrome, lead capture

New public page: `calc.html` shell (static header/hero/footer + SEO), `src/calc-main.jsx` mount (no providers), `CalcApp` + `LeadCaptureBlock`, wired into Vite's rollup input and a dev rewrite.

**Files:**
- Create: `calc.html`
- Create: `src/calc-main.jsx`
- Create: `src/calc/CalcApp.jsx`
- Create: `src/calc/LeadCaptureBlock.jsx`
- Modify: `vite.config.js` (rollup input + dev/preview rewrite)
- Create: `tests/unit/calc-html.test.js`

**Interfaces:**
- Consumes: `VenueCalculator` (Tasks 1-2) with `showSystemExpenses={false}` + `onCompute`; `capture` (`@/lib/posthog`); `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env; the `submitCalculatorLead` endpoint (Task 5).
- Produces: a public page at `/calc` served from `calc.html`, mounting `<CalcApp/>` into `#calc-root`.

- [ ] **Step 1: Write the failing SEO test for the shell**

Create `tests/unit/calc-html.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../calc.html', import.meta.url)), 'utf8');

describe('calc.html shell', () => {
  it('is Hebrew RTL', () => {
    expect(html).toMatch(/<html lang="he" dir="rtl">/);
  });
  it('has the canonical /calc URL', () => {
    expect(html).toContain('<link rel="canonical" href="https://wedflow.live/calc" />');
  });
  it('has a Hebrew title and meta description', () => {
    expect(html).toMatch(/<title>[^<]*חתונה[^<]*<\/title>/);
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{40,}"/);
  });
  it('places the H1 and intro statically (pre-hydration, outside the React root)', () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(h1[1]).toContain('כמה תעלה');
    // H1 appears before the React root div in source order
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('id="calc-root"'));
  });
  it('has Open Graph + SoftwareApplication JSON-LD', () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('"@type": "SoftwareApplication"');
  });
  it('mounts calc-main and links back to the app', () => {
    expect(html).toContain('src="/src/calc-main.jsx"');
    expect(html).toContain('href="/app"');
  });
});
```

Run: `npm run test:unit -- calc-html` → Expected: FAIL (file missing).

- [ ] **Step 2: Write `calc.html`**

Create `calc.html` (static shell styled inline with the landing's tokens so it renders correctly pre-hydration; the React calculator inside `#calc-root` is styled by `@/index.css` which `calc-main.jsx` imports):

```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>מחשבון עלות חתונה: כמה תעלה לכם החתונה? | WedFlow</title>
    <meta
      name="description"
      content="מחשבון חתונה חינמי בעברית: חשבו כמה תעלה לכם החתונה לפי מחיר האולם, עלות למנה ומספר המוזמנים. קבלו עלות ממוצעת לראש ותוצאה מיידית, בלי הרשמה."
    />
    <link rel="canonical" href="https://wedflow.live/calc" />
    <meta name="theme-color" content="#F6F0E7" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="WedFlow" />
    <meta property="og:locale" content="he_IL" />
    <meta property="og:url" content="https://wedflow.live/calc" />
    <meta property="og:title" content="מחשבון עלות חתונה | WedFlow" />
    <meta property="og:description" content="חשבו כמה תעלה לכם החתונה לפי מחיר האולם ומספר המוזמנים. תוצאה מיידית, בחינם, בלי הרשמה." />
    <meta property="og:image" content="https://wedflow.live/og-social-1200x630.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="מחשבון עלות חתונה | WedFlow" />
    <meta name="twitter:description" content="חשבו כמה תעלה לכם החתונה לפי מחיר האולם ומספר המוזמנים. תוצאה מיידית, בחינם." />
    <meta name="twitter:image" content="https://wedflow.live/og-social-1200x630.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap"
      rel="stylesheet"
    />

    <style>
      :root {
        --cream: #f6f0e7; --ink: #3b3531; --ink-soft: #7a7066;
        --rose: #c68a70; --rose-light: #e7bca6; --rose-deep: #a5674e;
        --card: #fffdf9; --line: #e8ddcd;
        --grad-rose: linear-gradient(115deg, #dba689 0%, #c68a70 45%, #a5674e 100%);
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--cream); color: var(--ink);
        font-family: 'Heebo', system-ui, sans-serif; font-size: 1.05rem; line-height: 1.7; -webkit-font-smoothing: antialiased; }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 720px; margin: 0 auto; padding: 0 1.25rem; }
      header { position: sticky; top: 0; z-index: 50; background: rgba(246,240,231,0.9);
        backdrop-filter: saturate(150%) blur(12px); border-bottom: 1px solid var(--line); }
      .nav { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 0; max-width: 1140px; margin: 0 auto; padding-inline: 1.5rem; }
      .brand { display: flex; align-items: center; gap: 0.6rem; }
      .brand .mark { height: 38px; width: auto; }
      .brand .word { font-weight: 600; font-size: 1.6rem; letter-spacing: 0.16em; }
      .btn-ghost { color: var(--ink); border: 1px solid var(--line); background: var(--card);
        border-radius: 999px; padding: 0.55rem 1.35rem; font-weight: 700; font-size: 0.95rem; }
      .calc-hero { text-align: center; padding: 3rem 0 1.5rem; }
      .calc-hero .eyebrow { color: var(--rose-deep); font-weight: 700; font-size: 0.8rem; letter-spacing: 0.2em; }
      .calc-hero h1 { font-size: clamp(2rem, 5vw, 3rem); font-weight: 900; margin: 0.6rem 0 0.8rem; line-height: 1.15; }
      .calc-hero p { color: var(--ink-soft); font-size: 1.15rem; max-width: 34em; margin: 0 auto; }
      main { padding-bottom: 4rem; }
      footer { background: var(--ink); color: #d8cec3; padding: 2.4rem 0; font-size: 0.9rem; text-align: center; margin-top: 3rem; }
      footer a { color: var(--rose-light); }
    </style>
  </head>
  <body>
    <header>
      <div class="nav">
        <a class="brand" href="/" aria-label="WedFlow, דף הבית">
          <img class="mark" src="/monogram.png" alt="" aria-hidden="true" width="55" height="38" />
          <span class="word">WEDFLOW</span>
        </a>
        <a class="btn-ghost" href="/app">כניסה למערכת</a>
      </div>
    </header>

    <main>
      <!-- Static hero (crawlable pre-hydration; outside the React root) -->
      <section class="calc-hero wrap">
        <span class="eyebrow">מחשבון חתונה</span>
        <h1>כמה תעלה לכם החתונה?</h1>
        <p>הזינו את מחיר האולם למנה ואת מספר המוזמנים, וקבלו מיד את העלות הכוללת והעלות הממוצעת לראש. בחינם, בלי הרשמה.</p>
      </section>

      <!-- React mounts the calculator + lead capture here -->
      <div id="calc-root" class="wrap"></div>
    </main>

    <footer>
      <div class="wrap">
        WedFlow ·
        <a href="/">חזרה לאתר</a> ·
        <a href="/app">כניסה למערכת</a>
      </div>
    </footer>

    <!-- SEO: SoftwareApplication (a wedding cost calculator) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "מחשבון עלות חתונה — WedFlow",
      "url": "https://wedflow.live/calc",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "inLanguage": "he",
      "description": "מחשבון חינמי לחישוב עלות חתונה לפי מחיר האולם למנה ומספר המוזמנים.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "ILS" }
    }
    </script>

    <script type="module" src="/src/calc-main.jsx"></script>
  </body>
</html>
```

Run: `npm run test:unit -- calc-html` → Expected: PASS.

- [ ] **Step 3: Write `src/calc-main.jsx`**

Create `src/calc-main.jsx` (no providers; imports tokens; inits analytics):

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';
import { initPostHog } from '@/lib/posthog';
import CalcApp from '@/calc/CalcApp';

initPostHog();

ReactDOM.createRoot(document.getElementById('calc-root')).render(<CalcApp />);
```

- [ ] **Step 4: Write `src/calc/CalcApp.jsx`**

```jsx
import React from 'react';
import VenueCalculator from '@/components/dashboard/VenueCalculator';
import LeadCaptureBlock from '@/calc/LeadCaptureBlock';
import { capture } from '@/lib/posthog';

// Standalone calculator page body: the shared VenueCalculator (venue-only), the lead-capture
// block, and a persistent bridge CTA into the full app. No auth, no providers.
export default function CalcApp() {
  const [snapshot, setSnapshot] = React.useState(null);

  const onCta = (location) => capture('calc_cta_clicked', { location });

  return (
    <div className="mt-2 space-y-6">
      <VenueCalculator showSystemExpenses={false} onCompute={setSnapshot} />

      <LeadCaptureBlock snapshot={snapshot} />

      {/* Persistent bridge CTA */}
      <div className="text-center rounded-2xl border border-rose/30 bg-champagne/60 px-5 py-6">
        <p className="font-semibold text-rose-deep mb-3">רוצים לעקוב אחרי כל התקציב, לא רק האולם?</p>
        <a
          href="/app"
          onClick={() => onCta('bridge')}
          className="inline-block rounded-full bg-rose-deep px-6 py-2.5 font-bold text-white hover:opacity-90 transition"
        >
          התחילו בחינם ב-WedFlow
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/calc/LeadCaptureBlock.jsx`**

```jsx
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { capture } from '@/lib/posthog';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submitCalculatorLead`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// "Email me the breakdown" — always visible below the (never-gated) result. Plain fetch to the
// public edge function; the calculator keeps working regardless of capture success.
export default function LeadCaptureBlock({ snapshot }) {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState('idle'); // idle | sending | done | error
  const [err, setErr] = React.useState('');

  async function submit(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setErr('כתובת אימייל לא תקינה'); return; }
    setErr(''); setState('sending');
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          email: email.trim(),
          guestCount: snapshot?.guestCount ?? null,
          costPerHead: snapshot?.costPerHead ?? null,
          totalCost: snapshot?.totalCost ?? null,
          budgetStatus: snapshot?.budgetStatus ?? null,
          payload: snapshot?.inputs ?? {},
        }),
      });
      if (!res.ok) throw new Error('bad status');
      setState('done');
      capture('calc_lead_submitted', { budget_status: snapshot?.budgetStatus ?? null });
    } catch {
      setState('error'); setErr('לא הצלחנו לשמור כרגע, נסו שוב');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-sage/40 bg-sage/10 px-5 py-6 text-center">
        <p className="text-lg font-bold text-sage-deep">שלחנו לכם את החישוב 🎉</p>
        <p className="text-sm text-muted-foreground mt-1">בדקו את תיבת הדואר שלכם.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-rose/30 bg-card px-5 py-6 space-y-3">
      <p className="font-semibold text-foreground">שלחו לעצמכם את החישוב במייל</p>
      <div className="flex gap-2">
        <Input
          type="email" dir="ltr" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={state === 'sending'} className="bg-rose-deep text-white hover:opacity-90">
          {state === 'sending' ? 'שולח…' : 'שלחו לי'}
        </Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </form>
  );
}
```

- [ ] **Step 6: Wire Vite — rollup input + dev/preview rewrite**

In `vite.config.js`:

1. Add `calc` to the rollup input (after the `app` line):

```js
        calc: fileURLToPath(new URL('./calc.html', import.meta.url)),
```

2. Extend the dev rewrite plugin so `/calc` serves `calc.html`. Change the `rewrite` function body in `appShellRewrite` to also handle `/calc`:

```js
  const rewrite = (req, _res, next) => {
    const path = req.url.split('?')[0];
    if (path === '/app' || path.startsWith('/app/')) req.url = '/app.html';
    else if (path === '/calc' || path.startsWith('/calc/')) req.url = '/calc.html';
    next();
  };
```

(Rename the plugin `name` to `'app-calc-shell-rewrite'` for clarity; optional.)

- [ ] **Step 7: Build to verify the entry compiles, then verify the suite**

Run: `npm run build`
Expected: build succeeds and `dist/calc.html` is emitted.
Run: `npm run test:unit` → Expected: PASS. `npm run lint` → no new errors.

- [ ] **Step 8: Commit**

```bash
git add calc.html src/calc-main.jsx src/calc/CalcApp.jsx src/calc/LeadCaptureBlock.jsx vite.config.js tests/unit/calc-html.test.js
git commit -m "feat(calc): standalone /calc page, lead capture, Vite entry + dev rewrite"
```

---

### Task 7: Vercel routing for `/calc`

Add the production rewrite so `/calc` serves `calc.html`, without disturbing the existing `/app` rewrites or the redirect list.

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `calc.html` build output (Task 6).
- Produces: production route `/calc → /calc.html`.

- [ ] **Step 1: Add the rewrite**

In `vercel.json`, add to the `rewrites` array (after the `/app/(.*)` entry):

```json
    {
      "source": "/calc",
      "destination": "/calc.html"
    }
```

Confirm `calc` is NOT present in the `redirects` `source` alternation (it isn't — leave it out).

- [ ] **Step 2: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"`
Expected: `vercel.json OK`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(vercel): rewrite /calc -> /calc.html"
```

---

### Task 8: Landing showcase section + nav/footer link

Add one static section to `index.html` in the existing hand-crafted style, with a preview of the result card and a rose CTA into `/calc`, plus a header/footer link. No new JS on the landing.

**Files:**
- Modify: `index.html`
- Modify: `tests/unit/landing.test.js`

**Interfaces:**
- Consumes: existing landing CSS classes (`.band`, `.sec-head`, `.mock`, `.mock-bar`, `.mock-body`, `.brow`, `.bar`, `.tag.ok`, `.btn.btn-rose`, `.reveal`).
- Produces: a static section linking to `/calc`; a footer link to `/calc`.

- [ ] **Step 1: Write the failing landing test additions**

Append to `tests/unit/landing.test.js`:

```js
describe('landing calculator showcase', () => {
  it('has a calculator section with an H2 and a CTA into /calc', () => {
    expect(html).toContain('href="/calc"');
    expect(html).toMatch(/<h2[^>]*>[^<]*כמה[^<]*תעלה[^<]*<\/h2>/);
  });
  it('shows a sample per-head number and the green "בתקציב" indicator', () => {
    // the showcase reuses the .tag.ok "in-budget" styling
    expect(html).toMatch(/class="tag ok"[^>]*>[^<]*בתקציב/);
  });
  it('adds no new inline <script> to the landing (stays static)', () => {
    const scripts = html.match(/<script(?![^>]*src=)[^>]*>/g) ?? [];
    // pre-existing inline scripts: the .js class-adder and the reveal/parallax IIFE
    expect(scripts.length).toBeLessThanOrEqual(3);
  });
});
```

Run: `npm run test:unit -- landing` → Expected: FAIL (no `/calc` link / section yet).

- [ ] **Step 2: Add the showcase section to `index.html`**

Insert this `<section>` immediately after the FEATURES section's closing `</section>` (after current line 565, before the florals photo band at line 567):

```html
      <!-- ============ CALCULATOR SHOWCASE ============ -->
      <section class="band" id="calculator" aria-labelledby="calc-title">
        <div class="wrap">
          <div class="sec-head reveal">
            <span class="eyebrow">מחשבון חתונה</span>
            <h2 id="calc-title">כמה באמת תעלה לכם החתונה?</h2>
            <p>לפני שסוגרים אולם — בדקו את העלות הממוצעת לראש לפי מחיר המנה ומספר המוזמנים. תוצאה מיידית, בחינם, בלי הרשמה.</p>
          </div>

          <div class="feature reveal">
            <div class="feat-text">
              <span class="kicker">תכנון תקציב</span>
              <h2>המספר שחשוב באמת: עלות לראש</h2>
              <p>
                מזינים את מחיר המנה, הבר וההגשה ומספר המוזמנים, והמחשבון מראה את סך עלות
                האירוע ואת העלות הממוצעת לכל אורח — עם חיווי צבע שאומר אם אתם בתקציב.
              </p>
              <ul>
                <li>עלות אולם לראש לפי מנה, בר, הגשה וסעיפים נוספים</li>
                <li>עלות ממוצעת לראש עם חיווי ״בתקציב / חורג״</li>
                <li>שליחת החישוב לעצמכם במייל</li>
              </ul>
              <div class="cta-row">
                <a class="btn btn-rose btn-lg" href="/calc">חשבו כמה תעלה לכם החתונה</a>
              </div>
            </div>
            <div class="feat-media reveal from-end d1">
              <figure>
                <div class="mock" role="img" aria-label="תוצאת מחשבון החתונה של WedFlow: עלות ממוצעת לראש עם חיווי שהאירוע בתקציב">
                  <div class="mock-bar"><i></i><i></i><i></i><span>מחשבון חתונה · 250 מוזמנים</span></div>
                  <div class="mock-body">
                    <div class="brow"><div class="btop"><span>עלות אולם לראש</span><b>₪470</b></div><div class="bar in"><i style="--w:82%"></i></div></div>
                    <div class="brow"><div class="btop"><span>סה״כ עלות האירוע</span><b>₪117,500</b></div><div class="bar in"><i style="--w:88%"></i></div></div>
                    <div class="grow" style="border-bottom:0;">
                      <span>עלות ממוצעת לראש</span>
                      <span class="side">יעד: ₪570</span>
                      <span class="tag ok">✓ בתקציב · ₪470</span>
                    </div>
                  </div>
                </div>
                <figcaption>תוצאת המחשבון: עלות ממוצעת לראש וחיווי תקציב</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 3: Add the footer link**

In the footer `<nav class="foot-links">` (current lines 692-701), add after the `#features` link:

```html
            <a href="/calc">מחשבון חתונה</a>
```

- [ ] **Step 4: Run the landing test to verify it passes**

Run: `npm run test:unit -- landing`
Expected: PASS (including the existing SEO assertions — the new section adds Hebrew content, keeps one H1, adds no new `<script>`). Then run the full `npm run test:unit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/landing.test.js
git commit -m "feat(landing): static calculator showcase section + /calc links"
```

---

### Task 9: Browser verification (end-to-end demo)

Verify the three surfaces in the preview browser. Port 5173 is often taken by another session — use the `dev-alt` launch config (port 5250). Local Supabase must be running (`run-local`) with functions served (`npm run functions:serve`) for the capture flow.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use `preview_start` with the `dev-alt` config (port 5250). Confirm it boots without errors (`preview_logs`).

- [ ] **Step 2: Verify `/calc` renders with no auth**

Navigate to `/calc`. `preview_snapshot`: confirm the static H1 "כמה תעלה לכם החתונה?", the calculator card, and the lead-capture form are present. `preview_console_logs` (level error): expect none. Confirm the platform-only "שאר הוצאות מהמערכת" row is ABSENT.

- [ ] **Step 3: Verify the calculator computes**

`preview_fill` the dish cost (placeholder "לדוגמה: 370") with `450` and set guests to `200`. `preview_snapshot`/`preview_inspect`: confirm "עלות ממוצעת לראש" shows a value and the green "✓ בתקציב" indicator (450 ≤ 570). `preview_network`: no request needed for compute.

- [ ] **Step 4: Verify the lead-capture flow**

`preview_fill` the email input with `demo@example.com`, click "שלחו לי". `preview_network`: confirm a `POST` to `submitCalculatorLead` returning 200. `preview_snapshot`: confirm the success state "שלחנו לכם את החישוב 🎉". Confirm a new `leads` row exists (integration client or Studio). If the local email provider isn't configured, the request still returns `ok:true` (email is best-effort) — that's expected.

- [ ] **Step 5: Verify the bridge CTA + analytics**

Confirm the "התחילו בחינם ב-WedFlow" CTA links to `/app`. If a PostHog key is set in `.env.local`, confirm `calc_used`, `calc_lead_submitted`, `calc_cta_clicked` fire (`preview_console_logs` or PostHog debug); otherwise confirm `capture()` no-ops without error.

- [ ] **Step 6: Verify the landing showcase + in-app regression**

Navigate to `/` — `preview_snapshot`: confirm the "כמה באמת תעלה לכם החתונה?" section and the rose CTA to `/calc`; `preview_console_logs`: no errors. Navigate to `/app` → the in-app Calculator: confirm the "שאר הוצאות מהמערכת" row IS present and the calculator behaves as before.

- [ ] **Step 7: Responsive + dark mode**

`preview_resize` to `mobile`: confirm `/calc` stacks cleanly, no horizontal scroll. The `/calc` shell is light-theme only by design; confirm it reads correctly (no `ThemeProvider`).

- [ ] **Step 8: Capture proof + finish**

`preview_screenshot` of `/calc` (with a computed result + success state) and of the landing showcase section. Then use `superpowers:finishing-a-development-branch` to decide integration (merge/PR).

---

## Self-Review

**Spec coverage:**
- No-duplication: shared `venueCalc.js` (Task 1) + one `VenueCalculator` with `showSystemExpenses` (Task 2). ✓
- Standalone `/calc`: `calc.html` + `calc-main.jsx`, no providers, light theme, SEO tags + canonical, static H1/intro (Task 6). ✓
- Vite rollup input + dev rewrite (Task 6); Vercel rewrite (Task 7). ✓
- Lead capture: public `submitCalculatorLead` (Task 5) → `leads` table (Task 3) + `calculatorBreakdown` email (Task 4); insert-before-send; safe errors. ✓
- Landing static showcase + rose CTA + link (Task 8). ✓
- Analytics `calc_used` (Task 2), `calc_lead_submitted` + `calc_cta_clicked` (Task 6). ✓
- Tests: `venueCalc` unit (Task 1), leads shim + RLS (Task 3), email render (Task 4), calc.html SEO + landing (Tasks 6, 8); browser demo (Task 9). ✓
- In-app unchanged: defaults preserve behavior (Tasks 1, 2, 9 step 6). ✓
- Out of scope respected: no multi-category estimator, no CAPTCHA, DNS is manual. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `computeTotals` returns `{ costPerHead, totalFixed, totalVenueCost, grandTotal, costPerGuest }` — consumed with that shape in Task 2. `onCompute` snapshot `{ guestCount, costPerHead, totalVenueCost, totalCost, budgetStatus, inputs }` — produced in Task 2, consumed in `LeadCaptureBlock`/`CalcApp` (Task 6) and mapped to the edge-function body `{ email, guestCount, costPerHead, totalCost, budgetStatus, payload }` (Task 5), which matches the `leads` columns (Task 3) and the `calculatorBreakdown` data shape (Task 4). `budgetStatus().level` values `'ok'|'warn'|'over'` align across module, edge `VALID_STATUS`, and email `STATUS_LABEL`. ✓
