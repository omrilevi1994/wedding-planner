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

`config.toml` sets `[functions.mcp] verify_jwt = false`, which the deploy picks
up; the `mcp` function validates bearer tokens itself (see `docs/mcp.md`).

### MCP server: one-time OAuth setup

The MCP is the OAuth server agents talk to; it signs users in through Supabase
Auth's OAuth 2.1 server as one upstream client (see `docs/mcp.md`). Once per
project:

1. Dashboard → Authentication → OAuth Server: enabled, **dynamic client
   registration OFF**, authorization path `/app/oauth/consent`. URL
   Configuration → Site URL = the production app origin.
2. Register the upstream client and set the function secrets
   (`MCP_UPSTREAM_CLIENT_ID`, `MCP_UPSTREAM_CLIENT_SECRET`, `MCP_PUBLIC_URL`,
   `MCP_TOKEN_SECRET`) — the script prints no secret values:

   ```bash
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> node scripts/register-mcp-oauth-client.mjs \
     --project-ref <ref> --public-url https://wedflow.live/mcp
   ```

   The `mcp` function refuses to start without these secrets, so do this
   before deploying it. Re-running needs `--rotate`; add `--keep-token-secret`
   unless you want every connected agent signed out.

The MCP's public URL is `https://wedflow.live/mcp` (rewrites in `vercel.json`).

Smoke tests:
- `curl -i -X POST https://wedflow.live/mcp` → `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://wedflow.live/mcp/.well-known/oauth-protected-resource"`.
- That URL → `authorization_servers: ["https://wedflow.live/mcp"]`.
- `https://wedflow.live/.well-known/oauth-authorization-server/mcp` → `issuer: https://wedflow.live/mcp`
  with `registration_endpoint`.
- `POST https://wedflow.live/mcp/register` with an untrusted redirect URI → `400 invalid_redirect_uri`.

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
