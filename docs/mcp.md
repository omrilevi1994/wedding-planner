# WedFlow MCP server

WedFlow exposes a **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server so people can connect their AI agents (Claude, ChatGPT, Cursor, …) and ask
questions about *their* wedding: "who hasn't RSVP'd from the groom's side?",
"how much do we still owe vendors?", "what's left on the checklist?".

## How it works

```
Agent (MCP client) ──Bearer token──▶  Edge function `mcp`  ──user JWT──▶  Postgres (RLS)
        │                                   │
        └──OAuth 2.1 (PKCE, DCR)──▶  Supabase Auth OAuth server ──▶ /app/oauth/consent (WedFlow UI)
```

- **Endpoint:** `POST {SUPABASE_URL}/functions/v1/mcp` (Streamable HTTP, stateless, JSON responses).
- **Auth:** OAuth 2.1 via Supabase Auth's built-in OAuth server. The agent discovers it
  from the 401 `WWW-Authenticate` header → `GET /functions/v1/mcp/.well-known/oauth-protected-resource`
  → `authorization_servers: ["{SUPABASE_URL}/auth/v1"]`. Clients register dynamically,
  the user signs in to WedFlow and approves on `/app/oauth/consent`.
- **Scoping:** the MCP never uses the service role for wedding data. Every query runs
  as the signed-in user with their access token, so existing RLS
  (`is_wedding_member`) guarantees an agent only sees weddings the user belongs to.
  On top of RLS the MCP applies role-based field filtering (below).
- **Read-only:** the MCP exposes no write tools. Because an OAuth access token is a
  full Supabase user JWT (with a `client_id` claim), migration `0026_oauth_read_only.sql`
  adds *restrictive* RLS policies that deny INSERT/UPDATE/DELETE to any token carrying
  `client_id`, and write edge functions reject such tokens (`_shared/auth.ts`).
  Agent tokens therefore can't write even if used directly against the REST API.

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
| `get_seating` | `wedding_id` | tables (`id, name, capacity, element_type`) with `seated_people` and guest list; plus unseated count |
| `list_vendors` | `wedding_id`, `category?` | vendors per role |
| `get_budget` | `wedding_id` | money roles only: budget target, totals by category and status, upcoming/overdue payments (next 60 days) |
| `list_expenses` | `wedding_id`, `category?`, `status?`, `limit?`, `offset?` | money roles only |
| `list_payments` | `wedding_id`, `status?`, `due_before?` (YYYY-MM-DD), `limit?`, `offset?` | money roles only |
| `list_gifts` | `wedding_id`, `limit?`, `offset?` | money roles only; gift + guest name |
| `get_checklist` | `wedding_id`, `include_completed?` (default false) | groups with items (`title, completed, notes`) |

Tool results are returned as one `text` content item containing pretty JSON, plus
`structuredContent` with the same object. User-entered strings (names, notes) are
returned as data only — never interpolated into instructions.

## Limits and auditing

- Result caps: list `limit` ≤ 200; `get_seating` / `get_checklist` capped at 2000 rows.
- Rate limit: 60 tool calls / minute / user (in-memory per isolate; best-effort).
- Each `tools/call` is logged to `activity_logs` (`action_type = 'mcp_read'`,
  `entity_type = <tool name>`, `user_email`, `description = 'AI agent read via MCP'`)
  for wedding-scoped tools — written with the service role since agent tokens are read-only.

## Connecting an agent

Users find the server URL under **Settings → AI agents** in the app.

- **Claude (claude.ai / Desktop):** Settings → Connectors → Add custom connector → paste the URL.
- **Claude Code:** `claude mcp add --transport http wedflow <URL>` then `/mcp` to sign in.
- **ChatGPT / Cursor / others:** add a remote MCP server with the URL; OAuth starts automatically.

Users can see and revoke connected agents in **Settings → AI agents**.

## Configuration / deploy

1. `supabase/config.toml`: `[auth.oauth_server] enabled = true`,
   `allow_dynamic_registration = true`, `authorization_url_path = "/app/oauth/consent"`;
   `[functions.mcp] verify_jwt = false` (the function validates tokens itself so it
   can return the OAuth `WWW-Authenticate` challenge).
2. Cloud project: Authentication → OAuth Server → enable, enable dynamic client
   registration, authorization path `/app/oauth/consent`; Site URL must be the app origin.
3. Deploy the function: `supabase functions deploy mcp --no-verify-jwt`.
4. Apply migration `0026_oauth_read_only.sql`.
