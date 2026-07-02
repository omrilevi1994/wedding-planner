# Phase 2: Cloud Go-Live (Supabase Cloud + Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Take the working local app to production — a cloud Supabase project + Vercel-hosted frontend, with Google + email auth, the real data migrated, all on free tiers.

**Architecture:** Same code as Phase 1. We link the repo to a cloud Supabase project, push the migrations and edge functions, migrate data via the existing scripts pointed at the cloud, configure auth providers, and deploy the Vite build to Vercel.

**Tech Stack:** Supabase CLI (cloud), Vercel CLI, existing scripts.

**Prerequisite (BLOCKS this plan):** the user must supply credentials in Task 0.
The `deploy` skill (`.claude/skills/deploy/SKILL.md`) documents the recurring form of this.

---

## Task 0: Credentials intake (user action required)

- [ ] **Step 1: Supabase cloud project + token**

User: create a free project at https://supabase.com/dashboard (choose a region near Israel, e.g. `eu-central-1`). Then:
- Account → Access Tokens → generate → provide as `SUPABASE_ACCESS_TOKEN`.
- Project Settings → General → copy the **project ref** (e.g. `abcd1234...`).
- Project Settings → API → copy the **anon** and **service_role** keys and the **project URL**.

- [ ] **Step 2: Vercel token**

User: create account at https://vercel.com, then Account Settings → Tokens → create → provide as `VERCEL_TOKEN`.

- [ ] **Step 3: Anthropic key**

User: provide `ANTHROPIC_API_KEY` (console.anthropic.com) for the AI import function.

- [ ] **Step 4: Google OAuth (optional now, required for Google login)**

User: in Google Cloud Console create an OAuth 2.0 Client (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Provide client id + secret. (Email/password works without this.)

- [ ] **Step 5: Store secrets locally**

Add to `.env` (git-ignored): `SUPABASE_ACCESS_TOKEN`, and create `.env.production` with the CLOUD `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Keep the cloud `service_role` key only in the shell for the migration step; never commit it.

---

## Task 1: Link project and push schema

**Files:** none (CLI operations)

- [ ] **Step 1: Install Vercel CLI**

Run: `npm install -D vercel` ; verify `npx vercel --version`.

- [ ] **Step 2: Link to the cloud project**

Run: `SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref <ref>`
Expected: "Finished supabase link".

- [ ] **Step 3: Push migrations to cloud**

Run: `SUPABASE_ACCESS_TOKEN=<token> npx supabase db push`
Expected: applies 0001–0005; prints "Finished supabase db push".

- [ ] **Step 4: Verify cloud schema**

Run: `SUPABASE_ACCESS_TOKEN=<token> npx supabase db diff --linked`
Expected: no differences (schema in sync).

---

## Task 2: Deploy edge functions + secrets

- [ ] **Step 1: Set function secrets**

Run:
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set ANTHROPIC_API_KEY=<key>
```
(SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY are injected automatically for deployed functions.)

- [ ] **Step 2: Deploy all functions**

Run: `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy`
Expected: deploys bulkUpdateGuestStatus, resetSeatingPlan, iplanBulkImport, inviteUserToWedding, getWeddingUsers, extractGuestData.

- [ ] **Step 3: Smoke-invoke extractGuestData**

Run:
```bash
curl -s -X POST "https://<ref>.functions.supabase.co/extractGuestData" \
  -H "Authorization: Bearer <cloud-anon-key>" -H "Content-Type: application/json" \
  -d '{"text":"John Doe 050-1234567 חתן 2"}'
```
Expected: `{ "output": [ ... ] }`.

---

## Task 3: Migrate data to cloud

**Files:** none (reuse Phase 1 scripts)

- [ ] **Step 1: Pull fresh from base44**

Run: `npm run data:pull`
Expected: current counts (~352 guests).

- [ ] **Step 2: Import into cloud**

Run (point the import at the cloud, not local):
```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<cloud-service-role> \
npm run data:import
```
Expected: per-table counts, dangling FKs nulled, no errors.

- [ ] **Step 3: Verify counts on cloud**

Run a `select count(*)` via the SQL editor or:
```bash
curl -s "https://<ref>.supabase.co/rest/v1/guests?select=count" \
  -H "apikey: <cloud-service-role>" -H "Authorization: Bearer <cloud-service-role>" \
  -H "Prefer: count=exact" -I | grep -i content-range
```
Expected: 352.

---

## Task 4: Configure auth providers + seed real users

- [ ] **Step 1: Enable email + Google in Supabase**

Dashboard → Authentication → Providers: enable Email; enable Google and paste client id/secret (from Task 0 Step 4). Set Site URL to the Vercel domain (after Task 5, revisit).

- [ ] **Step 2: Create auth users for the 6 base44 users**

Run a Node script (mirror the Phase 1 admin-create pattern) that, for each entry in `.data-snapshots/User.json`, calls `admin.auth.admin.createUser({email, email_confirm:true})` (or `inviteUserByEmail`) and updates the matching `profiles` row (by email) with role/wedding_id/wedding_sides/max_guests/is_approved from the snapshot.
Expected: 6 auth users; profiles linked by email; the 2 admins have role=admin.

- [ ] **Step 3: Verify an authenticated cloud read**

Sign in as the admin (script: signInWithPassword against cloud anon) and `select count` guests → 352 through RLS.

---

## Task 5: Deploy frontend to Vercel

- [ ] **Step 1: Set Vercel env vars**

Run:
```bash
VERCEL_TOKEN=<token> npx vercel env add VITE_SUPABASE_URL production   # paste cloud URL
VERCEL_TOKEN=<token> npx vercel env add VITE_SUPABASE_ANON_KEY production  # paste cloud anon
```

- [ ] **Step 2: Deploy**

Run: `VERCEL_TOKEN=<token> npx vercel --prod --yes`
Expected: prints a production URL.

- [ ] **Step 3: Update Supabase Site URL + Google redirect**

Dashboard → Authentication → URL Configuration: set Site URL to the Vercel domain and add it to Redirect URLs. Update the Google OAuth authorized redirect if needed.

---

## Task 6: Production smoke checklist (manual)

- [ ] Load the Vercel URL → login screen renders.
- [ ] Log in (email) → dashboard shows real totals (₪ values, 503 guests).
- [ ] Guests page lists 352; add/edit/delete a test guest; delete it.
- [ ] Seating page renders tables; assign/unassign a guest.
- [ ] Expenses/Payments/Gifts/Checklist/Vendors each load.
- [ ] Upload a receipt (storage) on an expense → file_url resolves.
- [ ] AI guest import (extractGuestData) returns rows.
- [ ] Log in with Google (if configured).

---

## Task 7: CI (GitHub Actions)

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1: Add CI running unit tests + build on push**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit
      - run: npm run build
        env:
          VITE_SUPABASE_URL: http://localhost:54321
          VITE_SUPABASE_ANON_KEY: dummy
```
(Integration tests need a live Supabase; run them locally or add a supabase-in-CI job later.)

- [ ] **Step 2: Commit and confirm the run is green.**

---

## Out of scope (future)
- Telegram notifications (`sendTelegramChecklistUpdate`).
- Billing / paid feature gating (subscriptions + paywall).
- Playwright e2e in CI against a preview deployment.

## Post-launch
- **Rotate the base44 `api_key`** (shared in plaintext during migration).
- Remove the base44 SDK deps (`@base44/sdk`, `@base44/vite-plugin`) and the base44 vite proxy once confirmed unused.
