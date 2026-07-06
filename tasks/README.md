# WedFlow SEO/GEO Task Board

Full SEO + GEO (AI-answer visibility) plan for **wedflow.live**, derived from the 2026-07-06 on-page audit (overall score: 1.4/10 — auth-gated SPA with zero indexable content).

## Strategy decision (locked)

**Marketing path**: build a public landing page at `/`, move the app behind it. The domain should rank for Hebrew wedding-planning queries and be citable by AI engines.

## Task index — execution order

| # | Task | Priority | Depends on | Status |
|---|------|----------|-----------|--------|
| 01 | [Technical foundations](01-technical-foundations.md) | P0 | — | ◐ implemented 2026-07-06; pending: deploy verification, final favicon (1.6) |
| 02 | [Public landing page](02-landing-page.md) | P0 | 01 (partially) | ☐ |
| 03 | [Metadata & structured data](03-metadata-and-schema.md) | P1 | 02 | ☐ |
| 04 | [GEO / AI visibility](04-geo-ai-visibility.md) | P1 | 02, 03 | ☐ |
| 05 | [Keyword research & content strategy](05-content-strategy.md) | P1 | — (parallel) | ☐ |
| 06 | [Trust & entity pages](06-trust-and-entity-pages.md) | P2 | 02 | ☐ |
| 07 | [Off-site authority](07-offsite-authority.md) | P2 | 02, 06 | ☐ |
| 08 | [Tracking & measurement](08-tracking-and-measurement.md) | P1 | 01 | ☐ |

## Ground rules

- All public content is **Hebrew, RTL** (`lang="he" dir="rtl"`), matching the product audience.
- Public pages must be **statically served or prerendered** — never behind the JS hydration wall. A crawler with JS disabled must see full content.
- Every task has acceptance criteria; a task isn't done until they're verified against the **live** site (not just the code).
- Target keyword (working, unvalidated): `אפליקציה לתכנון חתונה` — validate in task 05 before committing landing-page copy to it.

## Audit evidence this plan is built on

- Raw HTML served to crawlers: 0 words, 0 headings, 0 links, title = `WedFlow`.
- `/robots.txt` and `/sitemap.xml` return the SPA's HTML (catch-all rewrite in `vercel.json`).
- All unknown URLs return HTTP 200 (soft-404s).
- Firecrawl agent received HTTP 403 → bot protection may block AI crawlers.
- `<html lang="en">` but all content is Hebrew.
- No meta description, canonical, OG/Twitter tags, or JSON-LD anywhere.
