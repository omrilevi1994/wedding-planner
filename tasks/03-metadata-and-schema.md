# 03 — Metadata & structured data

**Priority:** P1 · **Depends on:** 02 (landing page exists) · **Effort:** ~1 day

Everything in the `<head>`: titles, descriptions, social cards, canonical, JSON-LD. Today the site has a 7-character title, no meta description, no OG tags, no canonical, and zero JSON-LD (confirmed in source — no head manager installed).

## Subtasks

### 3.1 Title & meta description (landing page)
- [ ] Title, 50–60 chars, keyword-leading, e.g.:
  `אפליקציה לתכנון חתונה — WedFlow | אורחים, ספקים ותקציב`
- [ ] Meta description, 150–160 chars, Hebrew, with CTA. Draft:
  `WedFlow — מטה החתונה שלכם: ניהול אורחים ואישורי הגעה, סידורי הושבה, ספקים, תשלומים ותקציב במקום אחד. התחילו לתכנן את החתונה בחינם.`
  (Verify the "בחינם" claim against actual pricing before shipping.)
- [ ] Unique title + description for every public page as tasks 05–06 add them.
- [ ] App routes (`/app/*`): keep bare `WedFlow` title + add `<meta name="robots" content="noindex">` — the app should never compete with the landing page in SERPs.

### 3.2 Open Graph & Twitter cards
- [ ] Create a branded OG image, 1200×630 PNG (product screenshot + logo + Hebrew tagline) at `public/og-image.png`.
- [ ] Landing page head: `og:title`, `og:description`, `og:image`, `og:url`, `og:type=website`, `og:locale=he_IL`, `twitter:card=summary_large_image`.
- [ ] **Why this matters more than usual:** a wedding app spreads couple-to-couple through WhatsApp — the OG card IS the referral surface. Test with WhatsApp preview + opengraph.xyz.

### 3.3 Canonical
- [ ] `<link rel="canonical" href="https://wedflow.live/">` on the landing page; absolute self-referencing canonicals on every public page.
- [ ] Confirm one canonical host (no `www` variant serving duplicate content).

### 3.4 JSON-LD structured data
- [ ] Landing page — `SoftwareApplication`:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "WedFlow",
    "applicationCategory": "LifestyleApplication",
    "operatingSystem": "Web",
    "inLanguage": "he",
    "description": "אפליקציה לתכנון חתונה — ניהול אורחים, סידורי הושבה, ספקים, תשלומים ותקציב",
    "url": "https://wedflow.live"
  }
  ```
  Add `offers` only with real pricing; add `aggregateRating` ONLY when real ratings exist (never invent rich-result facts — veto risk).
- [ ] `Organization` schema with `logo`, `url`, `sameAs` (social profiles, once task 07 creates them).
- [ ] `FAQPage` schema generated from the landing page FAQ section (task 02) — questions/answers must match visible page text exactly.
- [ ] Since path (a) static HTML was chosen in task 02, embed JSON-LD directly in the static head — no head-manager dependency needed.

### 3.5 Validation
- [ ] Google Rich Results Test passes for every JSON-LD block.
- [ ] `schema_lint` / validator.schema.org: zero errors.

## Acceptance criteria

- Raw HTML of `/` contains title (50–60 chars), meta description (150–160 chars), canonical, OG+Twitter block, and ≥2 valid JSON-LD blocks.
- WhatsApp link preview shows image + title + description correctly (RTL text not mangled).
- `/app` routes carry `noindex`.
- No schema property asserts a fact not visible on the page.
