# 02 — Public landing page

**Priority:** P0 · **Depends on:** 01 (routing/rewrite changes) · **Effort:** 2–4 days

The cornerstone task. Today `wedflow.live/` renders an auth-gated login screen with ~10 words of UI text — there is nothing to rank or cite. Build a public, crawlable, Hebrew marketing landing page at `/` and move the app behind it.

> ⚠️ **KEYWORD UPDATE from task 05 (2026-07-06) — affects landing copy.** The working keyword `אפליקציה לתכנון חתונה` was **demoted**: it has near-zero standalone search demand (zero autocomplete expansion). Keep it in the title/H1 as the exact category label, but the primary theme is now **`תכנון חתונה`**, and the real high-intent traffic is in feature verticals (`אישורי הגעה לחתונה`, `סידורי הושבה לחתונה`). **Positioning angle:** lead on *one integrated Hebrew suite* (guests+RSVP+seating+budget+checklist), NOT "free RSVP" — that vertical is saturated by dedicated free tools (matana, diginet, iplan) and mit4mit's WedPlanner. See task 05 §5.1–5.3 for the full evidence and competitor map.

## Architecture decision

- [ ] Choose the serving strategy (pick one, document why):
  - **(a) Static HTML landing** — hand-built `landing.html` + Vercel routing: `/` → static page, app moves to `/app/*`. Simplest; zero framework changes; content is in the raw HTML by construction. **Recommended starting point.**
  - **(b) Prerender the SPA route** — `vite-plugin-ssr`/`vike` or `react-snap` snapshotting `/`. More moving parts; only worth it if landing content will share React components.
- [ ] Update `vercel.json`: `/` and public content paths serve static files; only `/app/(.*)` rewrites to the SPA shell.
- [ ] Login screen moves to `/app` (unauthenticated users hitting `/app/*` see it, as today). Add a prominent "כניסה למערכת" CTA from the landing page.
- [ ] Verify no regression: existing users' bookmarks to `/` should be redirected or shown a clear login CTA.

## Page content (Hebrew, RTL)

Working keyword: `אפליקציה לתכנון חתונה` (**validate in task 05 first** — if research changes the primary keyword, update before copywriting).

- [ ] **H1** — value proposition containing the primary keyword, e.g. `WedFlow — מטה החתונה שלכם: אפליקציה לתכנון חתונה`.
- [ ] **Hero** — one-sentence answer to "what is this + for whom" in the first 60 words (GEO: answer-first structure).
- [ ] **Feature sections (H2 per feature)** mirroring the actual product: ניהול אורחים ואישורי הגעה · סידורי הושבה · ניהול ספקים ותשלומים · מעקב תקציב · צ'קליסט לחתונה · מצב יום החתונה. Each: 2–4 sentences, concrete, no fluff.
- [ ] **Screenshots** of the real product (guests table, seating plan, budget) with descriptive Hebrew `alt` text.
- [ ] **FAQ section (H2 + H3 per question)** — 5–8 real questions (כמה זה עולה? · האם זה מתאים לחתונה קטנה? · איך מזמינים בני זוג/משפחה לשתף פעולה? · האם הנתונים מאובטחים?). Doubles as FAQPage schema source (task 03) and GEO answer fodder.
- [ ] **Social proof** — real numbers only (couples/weddings/guests managed). No invented testimonials; if none exist yet, omit the section (E-E-A-T veto risk).
- [ ] **Footer** — crawlable links: אודות, צור קשר, תנאי שימוש, פרטיות (pages created in task 06), login CTA.
- [ ] Word count target: 600–1,000 words of real content.

## Non-negotiables

- Full content visible with JavaScript disabled (`curl https://wedflow.live/ | grep <keyword>` must hit).
- Single H1; logical H2/H3 hierarchy, no skipped levels.
- `lang="he" dir="rtl"`; mobile-first (most wedding traffic is mobile).
- Images: compressed (WebP/AVIF), descriptive filenames, `loading="lazy"` below the fold, explicit width/height (CLS).
- No claims the product can't back (feature list must match what's shipped).

## Acceptance criteria

- `curl -s https://wedflow.live/ | wc -w` ≥ 600 (raw HTML, no JS).
- H1 contains the validated primary keyword; every feature H2 present in raw HTML.
- Login flow still works end-to-end for existing users.
- Lighthouse (mobile): Performance ≥ 90, SEO ≥ 95 on the landing page.
- Pre-publish gate: run content-quality-auditor on the final copy before deploy (required before any "ready" verdict).
