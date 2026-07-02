---
name: run-local
description: "Start the local Supabase stack and Vite dev server for the wedding-planner with correct env. Use when the user wants to run/develop the app locally."
---

# Run the wedding-planner locally

Follow these steps to bring up the local Supabase stack and the Vite dev server.

## 1. Ensure Docker is running

Supabase local dev runs inside Docker. Confirm the daemon is up before starting:

```bash
docker info
```

If this errors, start Docker Desktop (or your Docker engine) and wait until it reports as running.

## 2. Start the local Supabase stack

```bash
npx supabase start
```

This spins up Postgres, the API gateway, Studio, and related services. On success it **prints your local keys and URLs**, including the `API URL`, the `anon key`, and the `service_role key`. Keep this output — you need it for the next step.

## 3. Configure `.env`

Ensure your project `.env` contains the local API URL plus the anon and service_role keys printed by `npx supabase start`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste the printed anon key>
SUPABASE_SERVICE_ROLE_KEY=<paste the printed service_role key>
```

The `VITE_SUPABASE_URL` must match the local API URL exactly. Paste the anon key and the service_role key verbatim from the `npx supabase start` output.

## 4. Start the Vite dev server

```bash
npm run dev
```

The app will be served by Vite. Open the URL it prints (typically `http://127.0.0.1:5173`).

## 5. Supabase Studio

The local Supabase Studio (database, auth, table editor) is available at:

```
http://127.0.0.1:54323
```

## Notes

- **Node < 22:** older Node versions need a `ws` (WebSocket) polyfill for Supabase realtime. This is already wired into the npm scripts, so no manual action is required.

## Troubleshooting

- **npm install / npm run fails with 401 Unauthorized:** the project-level `.npmrc` pins installs to the public npm registry. Make sure you are using the project `.npmrc` (run npm commands from the project root) so requests go to the public registry rather than a private/authenticated one.
