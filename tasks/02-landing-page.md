# 02 — Public landing page

**Priority:** P0 · **Depends on:** 01 (routing/rewrite changes) · **Effort:** 2–4 days

The cornerstone task. Today `wedflow.live/` renders an auth-gated login screen with ~10 words of UI text — there is nothing to rank or cite. Build a public, crawlable, Hebrew marketing landing page at `/` and move the app behind it.

> ⚠️ **KEYWORD UPDATE from task 05 (2026-07-06) — affects landing copy.** The working keyword `אפליקציה לתכנון חתונה` was **demoted**: it has near-zero standalone search demand (zero autocomplete expansion). Keep it in the title/H1 as the exact category label, but the primary theme is now **`תכנון חתונה`**, and the real high-intent traffic is in feature verticals (`אישורי הגעה לחתונה`, `סידורי הושבה לחתונה`). **Positioning angle:** lead on *one integrated Hebrew suite* (guests+RSVP+seating+budget+checklist), NOT "free RSVP" — that vertical is saturated by dedicated free tools (matana, diginet, iplan) and mit4mit's WedPlanner. See task 05 §5.1–5.3 for the full evidence and competitor map.

## Architecture decision

- [x] **Chose (a) Static HTML landing.** New static `index.html` at `/`; the SPA shell moved to `app.html`. Rationale: content is in raw HTML by construction (meets the JS-disabled requirement), zero React/hydration changes, best possible Lighthouse. Vite is now multi-entry (`landing` + `app`); a small Vite plugin rewrites `/app/*` → `app.html` for `vite dev`/`preview`.
- [x] Updated `vercel.json`: only `/app` and `/app/(.*)` rewrite to the SPA shell (`app.html`); unknown paths fall through to Vercel's 404 (no catch-all). React Router now runs with `basename="/app"`.
- [x] Login screen moved to `/app` (unauthenticated `/app/*` renders `<Login>` as before). Prominent "כניסה למערכת" CTA in the header + footer; "מתחילים לתכנן — בחינם" primary CTA in hero + final section. OAuth `redirectTo`, `redirectToLogin()`, and the 404 "Go Home" all target `/app`.
- [x] No regression for old bookmarks: `vercel.json` 301-redirects legacy `/Dashboard`, `/Guests`, … → `/app/$1`. Verified in `vite preview`: `/`→static landing, `/app` + `/app/Guests`→SPA shell. Login flow intact (auth POST reaches Supabase; a persisted session rendered the full dashboard at `/app`).

## Page content (Hebrew, RTL)

Working keyword: `אפליקציה לתכנון חתונה` (**validate in task 05 first** — if research changes the primary keyword, update before copywriting).

- [x] **H1** (single) — `WedFlow — אפליקציה לתכנון חתונה: כל האירוע במקום אחד` (primary keyword emphasized).
- [x] **Hero** — answer-first: opens with "WedFlow היא אפליקציית אינטרנט בעברית לתכנון חתונה, לזוגות שמתחתנים בישראל…" (what + for whom in the first sentence).
- [x] **Feature sections (H2 per feature)** — all six shipped features present as `<h2>`, each 2–4 concrete sentences + a bullet list: ניהול אורחים ואישורי הגעה · סידורי הושבה · ניהול ספקים ותשלומים · מעקב תקציב · צ'קליסט לחתונה · מצב יום החתונה.
- [x] **Product visuals** — instead of raster screenshots, crisp CSS/SVG recreations of the real screens (guests table, seating map, vendors/payments, budget) built from the app's real data. Chosen for sharpness, theme-fidelity, animatability, and Lighthouse (no image weight); each has an `aria-label` + crawlable Hebrew `<figcaption>`. *Swap for raster screenshots later if preferred — trivial, `<figure>` slots are in place.*
- [x] **FAQ (H2 + H3 per question)** — 7 real questions (עלות · חתונה קטנה · תכנון משותף/הרשאות · אבטחת נתונים · התקנה · ייבוא רשימה · אחרי החתונה) as a native `<details>` accordion; also emitted as FAQPage JSON-LD.
- [x] **Social proof** — real numbers only (352 מוזמנים · 26 שולחנות · 99 משימות), framed honestly as "נבנה מתוך חתונה אמיתית". No invented testimonials.
- [x] **Photography** — three self-hosted, optimized WebP wedding photos (Unsplash License, commercial-OK): eucalyptus tablescape (hero), rings+florals band, golden-hour couple (final CTA).
- [~] **Footer** — crawlable login CTA + in-page nav (תכונות, שאלות נפוצות) present. Links to אודות/צור קשר/תנאי שימוש/פרטיות deferred until those pages exist (**task 06**).
- [x] Word count: **780 words** of real content in the built HTML (target 600–1,000).

## Non-negotiables

- Full content visible with JavaScript disabled (`curl https://wedflow.live/ | grep <keyword>` must hit).
- Single H1; logical H2/H3 hierarchy, no skipped levels.
- `lang="he" dir="rtl"`; mobile-first (most wedding traffic is mobile).
- Images: compressed (WebP/AVIF), descriptive filenames, `loading="lazy"` below the fold, explicit width/height (CLS).
- No claims the product can't back (feature list must match what's shipped).

## Acceptance criteria

- [x] `curl -s / | wc -w` ≥ 600 (raw HTML, no JS) — **780 words** in built HTML.
- [x] H1 contains the primary keyword; every feature H2 present in raw HTML — guarded by `tests/unit/landing.test.js` (8 assertions, all green).
- [x] Login flow still works end-to-end — verified in browser: `/app` renders login, auth POSTs to Supabase, authenticated session renders the dashboard at `/app`.
- [ ] Lighthouse (mobile) Performance ≥ 90, SEO ≥ 95 — **pending live deploy** (local build is static, keyword-rich, images sized+lazy, LCP hero preloaded; expected to pass, but must be measured on the live URL).
- [ ] Pre-publish gate: run content-quality-auditor on the final copy — **pending, before deploy**. Not run yet; not deploying in this pass.

## Status

**Implemented & verified locally on branch `worktree-landing-page`** (2 commits: routing restructure + landing page). Not merged, not deployed. Remaining before "ready": content-quality-auditor gate + live Lighthouse + final favicon (task 1.6). The keyword `אפליקציה לתכנון חתונה` is still the working/unvalidated target — **task 05 should validate it**; if it changes, update the H1/title/description.
