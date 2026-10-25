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
  `entity_type = <tool name>`, `user_email`, `description = 'AI agent read via MCP'`)
  for wedding-scoped tools — written with the service role since agent tokens are read-only.

## Security model and known limits

- **Data writes:** blocked for agent tokens at three layers: the MCP exposes no write
  tools, restrictive RLS (`0026_oauth_read_only.sql`) denies INSERT/UPDATE/DELETE on all
  public tables and `storage.objects` when the JWT has `client_id`, and user-facing edge
  functions call `rejectOAuthClient()` (`_shared/auth.ts`; a unit test fails if a new
  function forgets it).
- **Auth endpoints (known limit):** an agent's access token is a real Supabase user JWT,
  and GoTrue does not restrict OAuth tokens on `/auth/v1/user` — it can update user
  metadata and, while the session is under 24h old, the password. Mitigations:
  - The consent page only releases codes to trusted redirect targets (`isTrustedRedirect`
    in `src/lib/mcp.js`: claude.ai, claude.com, chatgpt.com, chat.openai.com, loopback,
    `cursor:`/`vscode:`; extend with `VITE_MCP_TRUSTED_REDIRECT_HOSTS`). Dynamically
    registered phishing clients with their own redirect host can't be approved, and the
    "already consented" auto-redirect is re-checked too.
  - `secure_password_change = true` (password changes need re-authentication once a
    session is older than 24h) and `double_confirm_changes = true` (email changes must be
    confirmed from both addresses).
  - Trusted agent platforms keep tokens server-side; the model never sees them.
  - **Full fix (planned):** have the MCP server issue its own wrapped tokens (OAuth proxy)
    so agents never hold a Supabase JWT. Needs a custom domain for AS metadata discovery.

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
5. Cloud Auth settings: enable "Secure password change" and "Secure email change"
   (mirrors `secure_password_change` / `double_confirm_changes` in config.toml).

## Local development and tests

The edge-runtime container isn't required: tests spawn the function with Deno
(`tests/integration/mcp-server.js`, flags `--node-modules-dir=none --no-lock`).

```bash
env -u SUPABASE_SERVICE_ROLE_KEY npx vitest run tests/unit/mcp-server.test.js \
  tests/integration/mcp.test.js tests/integration/oauth-readonly.test.js
```

(`env -u` only matters if your shell exports a non-local service-role key; `.env` must
hold the local keys.)
