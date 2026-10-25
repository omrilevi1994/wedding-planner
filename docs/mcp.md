# WedFlow MCP server

WedFlow exposes a **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server so people can connect their AI agents (Claude, ChatGPT, Cursor, …) and ask
questions about *their* wedding: "who hasn't RSVP'd from the groom's side?",
"how much do we still owe vendors?", "what's left on the checklist?".

## How it works

```
Agent (MCP client) ──sealed token──▶ https://wedflow.live/mcp ─(vercel rewrite)─▶ edge function `mcp`
   │                                                                   │ unseal → Supabase JWT
   │                                                                   ▼
   │                                                          Postgres as the user (RLS)
   └─OAuth 2.1 (PKCE)─▶ MCP /register /authorize /token ──▶ Supabase Auth OAuth server
                         (the MCP is the only upstream client)        └▶ /app/oauth/consent
```

- **Endpoint:** `POST https://wedflow.live/mcp` (Streamable HTTP, stateless, JSON responses).
  `vercel.json` rewrites `/mcp`, `/mcp/*`, `/.well-known/oauth-protected-resource[/mcp]`,
  `/.well-known/oauth-authorization-server[/mcp]` and `/.well-known/openid-configuration/mcp`
  to the `mcp` edge function; the function advertises the public URL from `MCP_PUBLIC_URL`.
- **Auth — the MCP is the OAuth server** (`supabase/functions/mcp/oauth.ts`). The agent
  discovers it from the 401 `WWW-Authenticate` header → protected-resource metadata
  (`authorization_servers: ["https://wedflow.live/mcp"]`) → RFC 8414 metadata. Agents
  register at `/register`, send the user to `/authorize` and get tokens from `/token`.
  The MCP signs the user in through Supabase Auth's OAuth server as **one** confidential
  upstream client ("WedFlow MCP", redirect `https://wedflow.live/mcp/callback`); the user
  approves on `/app/oauth/consent` as before. At `/callback` the MCP exchanges the code with
  its client secret, records an `mcp_connections` row and redirects to the agent with a
  short-lived sealed one-time code; `/token` (PKCE) turns that into the agent's tokens.
- **Agent tokens are sealed, not JWTs.** Access token = AES-GCM-sealed {Supabase access
  token, connection id, expiry}; refresh token = sealed {Supabase refresh token, connection
  id}. Only the MCP (key `MCP_TOKEN_SECRET`) can open them, and Supabase rejects them. On
  every call the MCP unseals, checks the connection isn't revoked (cached 30s), validates the
  inner token with Supabase Auth and queries as the user.
- **Scoping:** the MCP never uses the service role for wedding data. Every query runs
  as the signed-in user with their (inner) access token, so existing RLS
  (`is_wedding_member`) guarantees an agent only sees weddings the user belongs to.
  On top of RLS the MCP applies role-based field filtering (below).
- **Read-only:** the MCP exposes no write tools, and the inner token is an OAuth token
  (it has a `client_id` claim), so migration `0026_oauth_read_only.sql` denies it
  INSERT/UPDATE/DELETE and write edge functions reject it (`_shared/auth.ts`).

## Role-based visibility

RLS decides *which weddings*; the MCP decides *which fields* per the caller's
`wedding_members.role` (`wedding_role(wid)`; platform admins = owner).

| Data | owner / coplanner | event_manager | family |
| --- | --- | --- | --- |
| Wedding summary (date, venue, times, guest counts) | ✓ | ✓ | ✓ |
| Budget / money (budget_target, expenses, payments, gifts, guest `gift_amount`) | ✓ | ✗ | ✗ |
| Guests (name, side, status, people counts, table) | ✓ all | ✓ all | ✓ own `wedding_sides` only |
| Guest `phone`, `notes` | ✓ | ✗ | ✓ own sides |
| Seating (tables + seated guests) | ✓ | ✓ | tables + counts; names only for own sides |
| Vendors (incl. contact) | ✓ | ✓ (no costs) | ✗ |
| Checklist | ✓ | ✓ | ✓ |

A tool the caller's role can't use returns an MCP tool error (`isError: true`) with a
plain message, never a JSON-RPC protocol error.

## Tools (v1)

All tools except `list_weddings` take a required `wedding_id` (string).
List tools take optional `limit` (default 50, max 200) and `offset` (default 0) and
return `{ items, total, limit, offset }`.

| Tool | Args | Returns |
| --- | --- | --- |
| `list_weddings` | – | weddings the user belongs to: `id, couple_names, wedding_date, venue, role` |
| `get_wedding_summary` | `wedding_id` | date, venue, ceremony/reception times, event manager, currency, guest counts by status and side (invited people, confirmed people, children), checklist progress; plus budget target / committed / paid for money roles |
| `search_guests` | `wedding_id`, `query?` (name/phone substring), `side?`, `status?`, `table_id?`, `unseated?` (bool), `limit?`, `offset?` | guests filtered per role |
| `get_seating` | `wedding_id` | guest tables (`id, name, capacity, element_type`) with `seated_people`, `free_seats` and guest list; non-seating `layout_elements` (stage/bar); plus unseated counts |
| `list_vendors` | `wedding_id`, `category?`, `limit?`, `offset?` | vendors per role |
| `get_budget` | `wedding_id` | money roles only: budget target, totals by category and status, upcoming/overdue payments (next 60 days) |
| `list_expenses` | `wedding_id`, `category?`, `status?`, `limit?`, `offset?` | money roles only |
| `list_payments` | `wedding_id`, `status?`, `due_before?` (YYYY-MM-DD), `limit?`, `offset?` | money roles only |
| `list_gifts` | `wedding_id`, `limit?`, `offset?` | money roles only; gift + guest name |
| `get_checklist` | `wedding_id`, `include_completed?` (default false) | groups with items (`title, completed, notes`) |

Data conventions:
- Wedding date/venue/times/currency/budget target come from `wedding_settings` (what the
  Settings page edits) when set, falling back to the `weddings` row — the Settings page only
  syncs to `weddings` when the editor is the owner, so `wedding_settings` is the fresher source.
- Guest `status` values are stored in Hebrew (`הוזמן` invited, `אישר` confirmed, `אולי` maybe,
  `לא מגיע` declined, `הגיע` arrived); `search_guests` also accepts the English words and `none`.
  Expense/payment `status`: `שולם` paid, `מתוכנן` planned (English accepted too).
- People counts follow the app: invited = `total_people` (default 1); confirmed/seated =
  `confirmed_people` if set, else `total_people`; budget totals exclude expenses paid by
  `הורים`/`אחר` (as the dashboard does).
- `search_guests` only matches `phone` for roles that may see phones.

Tool results are returned as one `text` content item containing pretty JSON, plus
`structuredContent` with the same object. User-entered strings (names, notes) are
returned as data only — never interpolated into instructions.

## Limits and auditing

- Result caps: list `limit` ≤ 200; `get_seating` / `get_checklist` capped at 2000 rows.
- Rate limit: 60 tool calls / minute / user (in-memory per isolate; best-effort).
- Each `tools/call` is logged to `activity_logs` (`action_type = 'mcp_read'`,
  `entity_type = <tool name>`, `user_email`, `description = 'AI agent read via MCP'`,
  `details = {args, connection_id, client_name}`) for wedding-scoped tools — written with
  the service role since agent tokens are read-only.
- `mcp_connections.last_used_at` is updated at most every 5 minutes per connection.

## Security model

- **Agents never hold a Supabase JWT.** Everything an agent receives from the MCP — client
  id, authorization code, access and refresh tokens — is sealed with AES-256-GCM
  (`seal.ts`; the blob type is bound as additional data, so a code can't be used as a token).
  A leaked agent token is useless against Supabase: `/auth/v1/user` (password / email /
  metadata changes) and PostgREST reject it. The inner refresh token is useless on its own
  too: Supabase only refreshes it for the upstream client, with the MCP's client secret.
- **Who gets a code:** `/register` only accepts redirect URIs on known agent platforms
  (claude.ai, claude.com, chatgpt.com, chat.openai.com), loopback and `cursor:`/`vscode:`
  apps (`trust.ts`; extend with the `MCP_TRUSTED_REDIRECT_HOSTS` secret). The consent page
  applies the same rules (`isTrustedRedirect` in `src/lib/mcp.js`, kept in sync by
  `tests/unit/mcp-oauth.test.js`) and treats `<MCP>/callback` as trusted. Supabase's own
  dynamic client registration is **off**, so the MCP is its only OAuth client.
- **Always-explicit consent.** Supabase auto-approves a returning user's repeat consent for
  the upstream client; for MCP flows the consent page still asks, naming the agent and its
  destination from the `wedflow_mcp_agent` cookie that `/authorize` sets on `/app/oauth`.
- **Code protection:** PKCE S256 is required; codes live 2 minutes, are bound to the client
  and redirect URI, and are single-use (`mcp_connections.code_used_at`). A replayed code
  revokes the connection it created. `/callback` only completes in the browser that started
  `/authorize` (HttpOnly nonce cookie on the MCP path), which stops login-CSRF.
- **Revocation:** Settings → AI agents → Disconnect calls `revoke_mcp_connection()`, and
  `/revoke` (RFC 7009) does the same: the connection is marked revoked and its Supabase
  session is deleted, so the agent is cut off immediately while the user's other agents and
  app sessions keep working. Refresh is refused for revoked connections.
- **Data writes:** blocked at three layers (no write tools; restrictive RLS from
  `0026_oauth_read_only.sql` on the inner OAuth token; `rejectOAuthClient()` in user-facing
  edge functions — a unit test fails if a new function forgets it).
- **Secrets:** `MCP_TOKEN_SECRET` (≥32 chars; rotating it logs every agent out),
  `MCP_UPSTREAM_CLIENT_ID` / `MCP_UPSTREAM_CLIENT_SECRET`, `MCP_PUBLIC_URL`. The function
  refuses to start without them.
- Defence in depth that stays on: `secure_password_change = true` and
  `double_confirm_changes = true`.

## Connecting an agent

Users find the server URL under **Settings → AI agents** in the app.

- **Claude (claude.ai / Desktop):** Settings → Connectors → Add custom connector → paste the URL.
- **Claude Code:** `claude mcp add --transport http wedflow <URL>` then `/mcp` to sign in.
- **ChatGPT / Cursor / others:** add a remote MCP server with the URL; OAuth starts automatically.

Users see each connected agent (name, destination, connected / last used) in
**Settings → AI agents** and can disconnect it there.

## Configuration / deploy

1. `supabase/config.toml`: `[auth.oauth_server] enabled = true`,
   `allow_dynamic_registration = false`, `authorization_url_path = "/app/oauth/consent"`;
   `[functions.mcp] verify_jwt = false` (the function validates tokens itself so it
   can return the OAuth `WWW-Authenticate` challenge).
2. Cloud project: Authentication → OAuth Server → enable, **dynamic client registration
   off**, authorization path `/app/oauth/consent`; Site URL = the app origin
   (`https://wedflow.live`). Enable "Secure password change" and "Secure email change".
3. Apply migrations `0026_oauth_read_only.sql` and `0027_mcp_connections.sql`.
4. Register the upstream client and set the secrets (prints no secret values):
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=… node scripts/register-mcp-oauth-client.mjs \
     --project-ref <ref> --public-url https://wedflow.live/mcp
   ```
   This creates the confidential client "WedFlow MCP" (redirect
   `https://wedflow.live/mcp/callback`) and sets `MCP_UPSTREAM_CLIENT_ID`,
   `MCP_UPSTREAM_CLIENT_SECRET`, `MCP_PUBLIC_URL` and a fresh `MCP_TOKEN_SECRET`.
   `--rotate` re-issues the client secret; `--keep-token-secret` keeps agents signed in.
5. Deploy the function: `supabase functions deploy mcp --no-verify-jwt`, and the frontend
   (`vercel.json` rewrites, consent page, Settings). The app shows
   `https://wedflow.live/mcp` in production builds (`PRODUCTION_MCP_URL` in
   `src/lib/mcp.js`; `VITE_MCP_URL` overrides it).

## Local development and tests

The edge-runtime container isn't required: tests spawn the function with Deno
(`tests/integration/mcp-server.js`, flags `--node-modules-dir=none --no-lock`). `startMcp()`
registers its own upstream client through the admin API and passes the secrets; `wrap()`
mints a sealed token around a normal session for tool tests. `mcp-oauth.test.js` walks the
real flow (register → authorize → consent → callback → token) and the security properties.

```bash
env -u SUPABASE_SERVICE_ROLE_KEY npx vitest run tests/unit/mcp-server.test.js tests/unit/mcp-oauth.test.js \
  tests/integration/mcp.test.js tests/integration/mcp-oauth.test.js tests/integration/oauth-readonly.test.js
```

(`env -u` only matters if your shell exports a non-local service-role key; `.env` must
hold the local keys.)
