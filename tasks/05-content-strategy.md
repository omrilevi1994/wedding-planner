# 05 — Keyword research & content strategy

**Priority:** P1 · **Depends on:** none (research can start now; publishing depends on 01–02) · **Effort:** research ~2 days, then ongoing

Validate the working keyword, map the Hebrew wedding-planning search landscape, and plan a content cluster the landing page anchors.

## Subtasks

### 5.1 Keyword validation (blocks landing-page copy finalization) — ✅ DONE 2026-07-06

**Method:** Google Autocomplete breadth (suggest.py) + live SERP sampling (WebSearch). No SEO-tool connector authenticated, so **all volume numbers are Estimated/directional** — demand *signals* (autocomplete breadth, SERP competition) are Measured; absolute volumes are not. Re-validate numbers against Keyword Planner/GSC before betting spend.

**Decision: DEMOTE `אפליקציה לתכנון חתונה` from primary.**
- Measured signal: it returns **zero autocomplete expansion** (only itself) → thin standalone demand. Nobody types the full phrase.
- Keep it in the title/H1 as the exact category label (app-intent + app-store searchers still use it), but it is NOT the SEO workhorse.

**New primary theme: `תכנון חתונה`** (rich autocomplete: `אקסל`, `מאיפה מתחילים`, `רשימה`, `אפליקציה`, `תקציב`, `קטנה`, `יומן`). Real head demand. Caveat: broad, informational-dominated SERP, hard for a new/low-DR domain to win head-on short-term.

**Where the winnable, high-intent traffic actually is — the feature verticals** (searcher wants a *tool*, and WedFlow ships the feature):
| Keyword | Demand signal | Intent | Difficulty read |
|---|---|---|---|
| `אישורי הגעה לחתונה` | **Very high** (62 autocomplete variants) | Commercial (`בחינם`, `מחיר`) | High — crowded with free dedicated tools |
| `סידורי הושבה לחתונה` | High (14 variants) | Commercial (`בחינם`, `מחיר`) | Medium-high — dedicated tools, "free" is a battleground |
| `תכנון חתונה מאיפה מתחילים` / `רשימה` / `צ'קליסט` | Medium-high | Informational (guide) | Medium — vendor/portal content, best TOFU + GEO play |
| `תקציב חתונה` | Medium | Informational + tool | Medium — mit4mit ranks; strong data-content candidate |

### 5.2 SERP & competitor scan — ✅ DONE 2026-07-06

**Dominant competitor: mit4mit.co.il (מתחתנים למען מתחתנים)** — appears in *every* SERP sampled. Portal + free **WedPlanner** app (budget + tasks + guests + seating, [mit4mit.co.il/wedapp](https://www.mit4mit.co.il/wedapp/)) + blog + RSVP + seating. This is WedFlow's #1 direct competitor and the 800-lb gorilla. Do **not** fight it head-on on "free RSVP."

**Direct app competitors (full planning suites):** WedPlanner (mit4mit), MyWed, Weddi, מאורסים מאורסות (Israeli), wedding-soft.com, planning.wedding.

**Feature-vertical tool competitors (dedicated, often free-tier):**
- RSVP: matana.app, DIGINET, Save The Date (savedate.co.il), electronic-invite, iplan, almo-ai, הזמנה פלוס.
- Seating: DIGINET, haflaa, הזמנה פלוס (auto-seating algorithm), wedix, planning.wedding, saveadate.

**Informational/portal SERP holders (guide keywords):** easywed, studio-vision, walla (mazaltov), urbanbridesmag, sadranit, magiimolo, d-eco.

**Gap / WedFlow edge:** every competitor is either (a) a *standalone free tool* (just RSVP, or just seating) or (b) mit4mit's all-in-one. WedFlow's differentiation angle = **one integrated Hebrew suite** (guests+RSVP+seating+vendors+budget+checklist+wedding-day mode) with a modern UX, vs. fragmenting across 3 free single-purpose tools. Lead the landing page on *integration*, not on "free RSVP" (unwinnable).

**SERP features:** not directly measurable via WebSearch (US-only endpoint). Mark N/A — check AI Overview / PAA presence in GSC or a live Israeli SERP before finalizing GEO priority.

### 5.3 Topic cluster design (hub & spoke) — prioritized by 5.1/5.2 evidence

Landing page = hub (targets `תכנון חתונה` theme + `אפליקציה לתכנון חתונה` exact label). Spokes **reordered by demand × winnability** (write top-down):

1. [ ] **`אישורי הגעה לחתונה`** (mirrors Guests/RSVP) — highest demand. **Angle: don't sell "another free RSVP."** Guide framing: "RSVP as part of managing the whole guest list → seating → day-of," where the standalone free tools force you to re-enter data. Convert to WedFlow's integrated flow.
2. [ ] **`סידורי הושבה לחתונה`** (mirrors SeatingPlan) — high demand, commercial. Angle: seating that's driven by *confirmed* RSVPs automatically (integration edge vs. standalone seating tools). Note the "free seating" battleground — be honest about what's free.
3. [ ] **`תקציב חתונה בישראל — עלויות ממוצעות`** (mirrors Expenses/Payments) — **strongest GEO candidate.** Back with real anonymized WedFlow data (avg budget, guest count, cost per head in Israel). Original data = citable + linkable; nobody else has it.
4. [ ] **`תכנון חתונה — מאיפה מתחילים / צ'קליסט`** (mirrors Checklist) — TOFU/GEO top-of-funnel. Highest informational demand; offer the interactive in-app checklist as CTA.
5. [ ] `ניהול ספקים לחתונה` (mirrors Vendors) — lower priority; thinner demand signal.
- [ ] Each spoke: answer-first structure (task 4.2), links up to hub + sideways to siblings, in-app-feature CTA.

### 5.4 Editorial rules
- [ ] Hebrew, RTL, product-honest (only describe shipped features).
- [ ] Cadence: 1–2 pieces/month is enough at this scale — depth beats volume.
- [ ] Every piece passes content-quality-auditor before publish (veto-aware gate, per audit rules).
- [ ] Each published page gets added to `sitemap.xml` (task 1.2) and internally linked from at least 2 existing pages.

### 5.5 Measurement hooks
- [ ] Register target keywords in rank tracking (task 08) the day each page publishes.

## Acceptance criteria

- Keyword decision documented with Measured volume data (or explicitly Estimated if no tool connected, with a note to re-validate).
- Cluster map: primary + ≥5 spokes, each with keyword, intent, page type, and priority.
- Competitor gap map with ≥3 concrete opportunities WedFlow can win.
- First spoke article briefed (angle, outline, proof requirements) — ready for content-writer.
