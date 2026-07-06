# WedFlow

A wedding-planning app: guests, seating, vendors, expenses, payments, gifts,
checklists, and a live "wedding mode" for the event day.

## Stack

- **Frontend:** Vite + React, Tailwind, shadcn/ui, React Query
- **Backend:** Supabase — Postgres + Row-Level Security + Auth, plus Deno edge functions
- **Hosting:** Vercel (frontend), Supabase Cloud (data + functions)

Data access goes through a small client shim at `src/api/wedflowClient.js`, which
maps entity calls onto `@supabase/supabase-js`.

## Local development

**Prerequisites:** Node, Docker (for local Supabase), and the Supabase CLI.

```bash
npm install
cp .env.example .env   # then fill in the Supabase keys printed by `supabase start`
npm run db:start       # local Supabase (Postgres + Auth + Storage) in Docker
npm run functions:serve
npm run dev            # Vite dev server
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type-check via jsconfig |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase lifecycle |
| `npm run functions:serve` | Serve edge functions locally |
| `npm run test:unit` / `test:int` | Vitest suites |

## Deploy

Use the `deploy` skill: it runs the tests, pushes DB migrations + edge functions
to Supabase Cloud, and deploys the frontend to Vercel.
