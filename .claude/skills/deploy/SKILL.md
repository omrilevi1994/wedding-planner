---
name: deploy
description: "Deploy the wedding-planner: run tests, push DB migrations + edge functions to cloud Supabase, deploy frontend to Vercel. Use for releases."
---

# Deploy the wedding-planner

Phase-2 deployment workflow. This targets **cloud** Supabase and Vercel, so it
requires real cloud credentials. Set these environment variables before you
start:

- `SUPABASE_ACCESS_TOKEN` — for `supabase link` / CLI auth
- `VERCEL_TOKEN` — for `vercel --prod`

Replace `<ref>` below with your actual Supabase project ref.

## 1. Preflight — tests + build

Do not deploy unless all of this passes:

```bash
npm run test:unit && npm run test:int && npm run build
```

## 2. Link the cloud Supabase project

Requires `SUPABASE_ACCESS_TOKEN` in the environment.

```bash
export SUPABASE_ACCESS_TOKEN=<your-access-token>
supabase link --project-ref <ref>
```

## 3. Push database migrations

```bash
supabase db push
```

## 4. Deploy edge functions

```bash
supabase functions deploy
```

## 5. Set edge function secrets

Provide the runtime secrets the functions need (e.g. the Anthropic API key):

```bash
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-api-key>
# add any other required secrets the same way, e.g.:
# supabase secrets set SOME_OTHER_SECRET=<value>
```

## 6. Configure Vercel environment variables

Set the frontend's Supabase connection details in production:

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

## 7. Deploy the frontend to Vercel

Requires `VERCEL_TOKEN` in the environment.

```bash
export VERCEL_TOKEN=<your-vercel-token>
vercel --prod --token "$VERCEL_TOKEN"
```

## Notes / post-deploy checks

- Keep everything within the **free tiers** of Supabase and Vercel.
- Open the deployed Vercel URL and confirm it **loads**.
- Confirm an **authenticated read** works end-to-end (sign in, then read data
  that requires auth) to verify the frontend, edge functions, and DB are all
  wired up correctly.
