# 01 — Technical foundations

**Priority:** P0 · **Depends on:** none · **Effort:** ~half a day

Fix the infrastructure defects that make the domain hostile to crawlers, regardless of any content work.

## Why

Measured on 2026-07-06: `/robots.txt` and `/sitemap.xml` serve the SPA's `index.html` (swallowed by the catch-all rewrite in `vercel.json`); every unknown URL returns HTTP 200 (soft-404); `<html lang="en">` while all content is Hebrew; Firecrawl's agent got HTTP 403, suggesting bot protection may also block Google/AI crawlers.

## Subtasks

### 1.1 Real robots.txt
- [x] Added `public/robots.txt` — allows `/`, disallows all 15 auth-gated app routes (enumerated, since the app still lives at root until task 02), references the sitemap.
- [x] AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) not blocked — generic `User-agent: *` allow.
- [ ] Adjust `Disallow` paths once the app route structure from task 02 is final (e.g. collapse to `Disallow: /app`).

### 1.2 Real sitemap.xml
- [x] Added `public/sitemap.xml` with `/` only (lastmod 2026-07-06).
- [x] No auth-gated app routes listed.
- [ ] Decide later (task 05): generate at build time once content pages exceed ~10.

### 1.3 Kill soft-404s
- [x] `vercel.json` rewrite now enumerates the 15 real app routes instead of `/(.*)`; unknown paths fall through to a 404.
- [x] Added branded Hebrew `public/404.html` (noindex) — Vercel serves it with a real 404 status.
- [ ] Verify on live after deploy: `curl -o /dev/null -w "%{http_code}" https://wedflow.live/definitely-not-a-page` → `404`.

### 1.4 Language declaration
- [x] `index.html`: `<html lang="he" dir="rtl">` (app containers already set `dir="rtl"`, so this is consistent).
- [ ] Keep per-page `lang` correct if any English pages are ever added (use `hreflang` only if a real English version exists).

### 1.5 Bot-protection verification
- [x] Test fetch as Googlebot, GPTBot, ClaudeBot, PerplexityBot user-agents against the live site; record status codes.

  **Access matrix (Measured, 2026-07-06, `GET https://wedflow.live/`):**

  | Crawler UA | Status |
  |---|---|
  | Googlebot | 200 |
  | GPTBot | 200 |
  | ClaudeBot | 200 |
  | PerplexityBot | 200 |
  | Bingbot | 200 |

  The Firecrawl 403 from the audit was IP-level blocking of that scraping service, not UA-based bot protection — verified crawlers are not blocked.
- [x] If Vercel bot mitigation / attack challenge blocks any of them, allowlist verified crawlers in Vercel dashboard (Firewall → configure). *(Not needed — none blocked.)*
- [ ] Re-verify after any Vercel security-setting change.

### 1.6 Favicon & manifest polish
- [ ] Replace placeholder `public/favicon.svg` with final brand asset (the HTML comment in `index.html` already flags this).
- [ ] Add PNG fallback icons (192/512) to `manifest.json` for install prompts and rich results.

## Acceptance criteria

- `curl https://wedflow.live/robots.txt` returns `text/plain` with the rules above.
- `curl https://wedflow.live/sitemap.xml` returns valid XML, `content-type: application/xml`.
- Unknown URL → HTTP 404.
- `curl -A "GPTBot" https://wedflow.live/` → HTTP 200 with content.
- Rendered homepage has `lang="he" dir="rtl"`.
