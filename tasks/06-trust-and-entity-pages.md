# 06 — Trust & entity pages

**Priority:** P2 · **Depends on:** 02 (landing + routing) · **Effort:** ~1–2 days

The CORE-EEAT quick scan failed both scoreable items: no about/contact/legal pages, no entity information anywhere on the domain. These pages are trust signals for Google, AI engines, and — not least — couples deciding whether to put their entire guest list into your product.

## Subtasks

### 6.1 About page (`/about` — אודות)
- [ ] Who built WedFlow and why (real story, real people — anonymous products score poorly on E-E-A-T and AI trust).
- [ ] What the product is, in entity-consistent phrasing (task 4.4).
- [ ] Linked from landing-page footer.

### 6.2 Contact page (`/contact` — צור קשר)
- [ ] Real contact channel (email minimum; form optional).
- [ ] `ContactPage` schema or `contactPoint` on the Organization schema (task 3.4).

### 6.3 Privacy policy (`/privacy` — מדיניות פרטיות)
- [ ] Required beyond SEO: the app stores guest PII (names, phones, RSVP status) in Supabase — a privacy policy is a legal necessity in Israel (חוק הגנת הפרטיות + Amendment 13) and for GDPR-adjacent users.
- [ ] Cover: what's collected, where stored (Supabase), analytics (PostHog), retention, deletion requests, contact for privacy queries.
- [ ] ⚠ Have a human review — do not ship generated legal text unreviewed.

### 6.4 Terms of service (`/terms` — תנאי שימוש)
- [ ] Standard SaaS terms; same human-review caveat.

### 6.5 Pricing transparency
- [ ] If pricing exists, a `/pricing` page (or landing section) — pricing pages are heavily quoted by AI engines answering "כמה עולה"; absence of pricing info is a trust deduction.
- [ ] Must match the `offers` schema claim (task 3.4) and any "בחינם" copy in the meta description.

### 6.6 Wiring
- [ ] All pages: static/prerendered (same rule as task 02), Hebrew RTL, unique title + meta description, self-canonical.
- [ ] Footer on every public page links to all of them.
- [ ] Add to `sitemap.xml`.

## Acceptance criteria

- `/about`, `/contact`, `/privacy`, `/terms` live, crawlable without JS, linked from the footer, in the sitemap.
- Privacy policy reviewed by a human and accurate about Supabase/PostHog data flows.
- CORE-EEAT quick-scan items "entity transparency" and "contact availability" flip to pass.
