# 04 — GEO / AI visibility

**Priority:** P1 · **Depends on:** 02, 03 · **Effort:** ~1 day + ongoing

Make WedFlow citable by AI engines (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews) when users ask "איך מתכננים חתונה" / "מה האפליקציה הכי טובה לתכנון חתונה". GEO rides on the same content as SEO but has its own access, structure, and entity requirements.

## Subtasks

### 4.1 AI crawler access (blocker — verify first)
- [ ] Confirm task 1.5 result: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot all get HTTP 200 on `/`. The observed Firecrawl 403 suggests Vercel bot protection may block them today.
- [ ] robots.txt explicitly allows AI crawlers (task 1.1) — re-check no `Disallow: /` slipped in for them.
- [ ] Record a dated access matrix (crawler × status) in this file when verified.

### 4.2 Answer-ready content structure (applies to landing + all content pages)
- [ ] **Answer-first pattern:** every page opens with a direct 1–2 sentence answer to its target question before elaborating.
- [ ] FAQ blocks use literal question phrasing as H3s — AI engines lift Q→A pairs verbatim.
- [ ] Use extractable structures: bullet lists for features, tables for comparisons (e.g. tier/pricing table), numbered steps for how-tos.
- [ ] Every factual claim is self-contained (no "as mentioned above" dependencies) — chunks must survive being quoted alone.
- [ ] Dates on content pages (`datePublished`/`dateModified` in schema + visible on page) — freshness is an AI-citation factor.

### 4.3 llms.txt
- [ ] Add `public/llms.txt`: one-paragraph Hebrew+English description of WedFlow, links to landing page, FAQ, about, pricing. Low cost, emerging convention, zero downside.

### 4.4 Entity clarity
- [ ] Consistent entity signature everywhere: **WedFlow — wedding planning app (Hebrew, Israel) — wedflow.live**. Same name/description across landing page, schema, manifest, social bios (task 07).
- [ ] `Organization` + `SoftwareApplication` schema (task 3.4) is the machine-readable anchor.
- [ ] Disambiguation check: search "WedFlow" — identify name collisions with other products; if collisions exist, strengthen distinguishing signals (location, language, category) in all copy.

### 4.5 Citation-worthiness (ongoing, feeds task 05)
- [ ] Publish content only WedFlow can publish: original data ("על סמך X חתונות שנוהלו ב-WedFlow, גודל ממוצע של רשימת אורחים בישראל הוא…"), real checklists from the product, Israeli-market specifics (מנהגי אישורי הגעה, עלויות ממוצעות). Generic advice will never out-cite established wedding portals; unique data can.

### 4.6 Verification loop
- [ ] Monthly manual probe: ask ChatGPT/Perplexity/Gemini (Hebrew) "מה האפליקציות הטובות לתכנון חתונה בישראל?" — log whether WedFlow appears and what source is cited. Store results in `tasks/geo-probe-log.md`.
- [ ] Wire AI-referral tracking (task 08) to measure actual AI-driven sessions.

## Acceptance criteria

- All five AI crawlers fetch `/` with HTTP 200 (dated matrix recorded).
- `llms.txt` live and accurate.
- Landing page passes the "quote test": any FAQ answer, pasted alone, is accurate and self-contained.
- Probe log exists with a baseline entry (expected: absent at baseline — that's fine, it's the benchmark).

## Boundary

No "cite-ready" or GEO-score verdict may be claimed without a content-quality-auditor pass on the underlying pages (per audit-gate rules).
