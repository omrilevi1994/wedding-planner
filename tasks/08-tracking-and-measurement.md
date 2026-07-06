# 08 — Tracking & measurement

**Priority:** P1 · **Depends on:** 01 (verification requires working robots/sitemap) · **Effort:** ~half a day setup + ongoing

You can't manage what you can't see. Set up the measurement stack the day the landing page ships — baselines are only free once.

## Subtasks

### 8.1 Google Search Console (do first)
- [ ] Verify `wedflow.live` (DNS TXT record — domain-level property).
- [ ] Submit `sitemap.xml` (after task 1.2).
- [ ] Request indexing of `/` once the landing page (task 02) is live.
- [ ] Check: coverage report shows no soft-404s after task 1.3 (this is the verification for that fix).

### 8.2 Bing Webmaster Tools
- [ ] Verify + submit sitemap. Cheap, and Bing's index feeds ChatGPT/Copilot answers — disproportionately valuable for GEO.

### 8.3 Analytics — PostHog (already integrated)
- [ ] Confirm PostHog captures the new public pages (landing, guides, trust pages), not just the app.
- [ ] Define conversion events: `landing_signup_click`, `signup_completed`, per-source attribution.
- [ ] Dashboard: organic sessions → signup conversion funnel.

### 8.4 AI-referral tracking
- [ ] Segment sessions by referrer: `chat.openai.com` / `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`.
- [ ] PostHog insight: AI-referral sessions over time + their signup conversion vs. organic. Expect ~0 at baseline; the trend is the metric.

### 8.5 Rank tracking
- [ ] Track the validated keyword set (task 5.1) — weekly snapshots. Minimum viable: GSC position data per query; upgrade to a rank tracker if/when budget allows.
- [ ] Log a dated baseline the week the landing page ships.

### 8.6 Reporting cadence
- [ ] Monthly review: GSC impressions/clicks/position, PostHog organic + AI-referral funnel, GEO probe log (task 4.6), new backlinks.
- [ ] Keep Measured vs. Estimated labeling in every report; note data source + date.
- [ ] Alerts (optional, later): GSC email alerts on coverage errors are on by default; add threshold alerts only when there's traffic worth alerting on.

## Acceptance criteria

- GSC + Bing verified, sitemap submitted, landing page indexed (site:wedflow.live shows it).
- PostHog funnel live: organic session → signup, with AI-referrer segmentation.
- Dated baseline snapshot recorded (rankings ~none, AI referrals ~0, backlinks ~0) — the "before" picture for every future report.
