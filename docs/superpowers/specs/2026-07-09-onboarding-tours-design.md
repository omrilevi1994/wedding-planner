# Onboarding Mini-Tours — Design

Date: 2026-07-09

## Goal

Give new users a lightweight, in-app "WalkMe"-style walkthrough. Delivered as
**per-page mini-tours**: the first time a user lands on a major page, a short
guided tour highlights the key elements. Each page's tour shows once, then never
again unless the user asks to replay.

## Solution

Use **react-joyride** (MIT-licensed, free, no active-user limits, React-native,
RTL-capable). It runs entirely inside the app — no third-party vendor script, no
MAU caps. Rejected alternatives: `intro.js` (paid for commercial use),
hosted tools like Userflow/Appcues (MAU-capped free tiers, external dependency).

## Persistence

- Add a `tours_seen` **JSONB** column to the `profiles` table, default `{}`.
- Shape: `{ "Dashboard": true, "Guests": true }` — keyed by page name
  (matches `currentPageName` / `pages.config.js` keys).
- **Reads:** the profile is already loaded in `WeddingContext` (`profile` /
  `user`), so `user.tours_seen` is available without extra fetches.
- **Writes:** via the existing entity helper —
  `wedflow.entities.User.update(user.id, { tours_seen: { ...prev, [pageKey]: true } })`
  (`User` maps to `profiles` in `entities-config.js`).
- After a write, refresh the profile so the flag is reflected in context and the
  tour does not re-trigger within the session. Add a `refreshProfile()` helper to
  `WeddingContext` (re-runs `wedflow.auth.me()` and `setProfile`).
- Persistence is per-account and therefore cross-device.

Schema change performed via the project's `supabase-schema-change` flow (column +
migration; `profiles` already has RLS/grants, so only the column is added).

## Components & Structure

### `src/lib/tours/tourSteps.js`
Tour definitions, keyed by page name. Each value is an array of Joyride steps:

```js
export const TOURS = {
  Dashboard: [
    { target: '[data-tour="dashboard-welcome"]', title: '...', content: '...' },
    // ...
  ],
  Guests: [ /* ... */ ],
  Checklist: [ /* ... */ ],
};
```

- All `title`/`content` copy in **Hebrew**.
- `target` selectors use `[data-tour="..."]` attributes added to page elements.

### `src/components/PageTour.jsx`
Thin wrapper around Joyride. Prop: `pageKey` (string).

Behavior:
- Look up `TOURS[pageKey]`. If absent/empty → render nothing.
- Read `user.tours_seen?.[pageKey]` from `useWedding()`. If truthy → render nothing.
- Otherwise, start the tour ~500ms after mount (lets the page DOM paint and the
  `data-tour` targets exist). Use Joyride `run` state gated on this delay.
- Hebrew `locale` labels: `back: 'הקודם'`, `next: 'הבא'`, `skip: 'דלג'`,
  `last: 'סיום'`, `close: 'סגור'`.
- RTL: Joyride respects the document `dir`; styling (`styles` prop) matches the
  rose theme (primary color from CSS vars / brand rose).
- `continuous` tour with progress, `showSkipButton`, `disableScrolling: false`.
- On Joyride callback with `status` of `FINISHED` or `SKIPPED`: write
  `tours_seen[pageKey] = true` (merge with previous), then `refreshProfile()`.
  Guard writes so they run once (e.g. a `savedRef`).

### Integration point — `Layout.jsx`
`Layout` already receives `currentPageName` and wraps every page. Render
`<PageTour pageKey={currentPageName} />` once inside the layout. Adding a tour to
a new page is then just: write a steps array in `tourSteps.js` + add `data-tour`
attributes on that page. No per-page wiring.

Guard: only render `PageTour` once `user` is loaded (avoid firing before profile
is available).

### `data-tour` attributes
Add to the elements each tour points at, on the three initial pages:
- **Dashboard** — welcome/header, main navigation, key summary widgets.
- **Guests** — add-guest action, guest list/table, filters/summary.
- **Checklist** — add/group action, a checklist item, progress indicator.

### Replay — Settings
Add a "הצג מדריכים מחדש" (Show tutorials again) button on the Settings page that
resets `tours_seen` to `{}` via `User.update` + `refreshProfile()`. Next visit to
each page re-shows its tour.

## Data Flow

1. User navigates to a page → `Layout` renders `<PageTour pageKey={currentPageName}/>`.
2. `PageTour` checks `TOURS[pageKey]` and `user.tours_seen[pageKey]`.
3. If unseen and steps exist → after ~500ms, Joyride runs and spotlights targets.
4. User finishes or skips → merge `{[pageKey]: true}` into `tours_seen`, persist via
   `User.update`, `refreshProfile()`.
5. Subsequent visits: flag is set → no tour.
6. Settings "replay" → `tours_seen = {}` → tours re-enabled.

## Error Handling

- Persist write failure: log to console, do not block the UI; tour simply may
  re-show next session (acceptable degradation). Do not throw into render.
- Missing target element: Joyride handles missing targets gracefully (skips/hides
  step); the 500ms delay minimizes this. Steps should avoid conditionally-rendered
  targets or use elements that are always present.
- No `user` yet: `PageTour` renders nothing until `user` is available.

## Testing

- Unit: a small pure helper `nextToursSeen(prev, pageKey)` (merge logic) — test
  it merges, does not drop existing keys, handles `null`/`undefined` prev.
- Component/behavior: `PageTour` renders nothing when `tours_seen[pageKey]` is
  true; starts when false and steps exist; renders nothing when no steps.
  (Mock `useWedding` and Joyride.)
- Manual/verify: run the app, confirm Dashboard tour fires for a fresh profile,
  completes, persists, and does not re-show; confirm Settings replay re-enables.

## Scope Of This Build

- Schema: `tours_seen` column on `profiles`.
- `refreshProfile()` in `WeddingContext`.
- `tourSteps.js`, `PageTour.jsx`, `Layout.jsx` integration.
- `data-tour` attributes + written Hebrew tours for **Dashboard, Guests, Checklist**.
- Settings replay button.

Follow-ups (out of scope, trivial to add later): tours for Expenses, Payments,
Vendors, SeatingPlan — each just a steps array + `data-tour` attributes.
