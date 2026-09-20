# PRAVAAH

Regulated visitor access for ecologically sensitive, capacity-constrained adventure-tourism destinations.

Visitors browse a site's live carrying capacity and remaining daily quota, then submit an entry-permit application. The responsible department approves or rejects it. An approved permit becomes a QR pass that checkpoint staff scan on the day of the visit, and check-in and check-out move the occupancy count. Every capacity, quota and permit decision is made by the server, so the number at the gate and the number in the console always agree.

Built for Smart India Hackathon.

![PRAVAAH emblem](frontend/public/logo.jpeg)

## What it does

- Tourists browse destinations, see real-time capacity and remaining quota, and file a full eco-tourism entry-permit application (applicant and group details, vehicle, equipment, emergency contact, consent).
- The department reviews the permit queue, sets capacity and daily quota per destination, opens or closes sites, and raises alerts.
- Approved permits issue a QR pass. Staff check visitors in and out and occupancy updates transactionally.
- A readiness self-check (a deterministic rule engine) tells a visitor whether they are prepared for a given difficulty.
- Optional language layers can re-phrase the readiness and assistant answers. They never approve permits or make medical, safety, weather or disaster calls. The deterministic server-side output stays authoritative.

## Roles

Two roles live on the user profile and are enforced by Postgres row level security, not by the client:

- `TOURIST`: browse, apply, view and share their own permits, run the readiness check.
- `DEPARTMENT_OPERATOR`: the operations console, capacity and quota, permit review, checkpoint scanning, control room.

A signed-in visitor who opens a staff-only route is redirected to `/no-access`.

## Tech stack

- Next.js 16 (App Router) with TypeScript and React 19. The Next.js server and its route handlers are the business-logic layer.
- Supabase: PostgreSQL as the single source of truth, Auth (cookie sessions through `@supabase/ssr`), Realtime (`postgres_changes`), and Storage.
- Styling is hand-written CSS in `app/globals.css` plus CSS Modules. Tailwind v4 is installed but the UI does not depend on generated utility classes.
- `qrcode.react` renders the pass, `lucide-react` provides icons.

## Architecture

```text
Next.js (App Router) + TypeScript + React
        |
        v
Next.js server layer  ->  route handlers under /api/v1, services/, lib/
        |
        v
Supabase
  PostgreSQL   source of truth, RLS, transactional RPCs, advisory locks
  Auth         cookie-based sessions
  Realtime     live department console updates (re-read triggers only)
  Storage
```

Server-authoritative rules that the code holds to:

- The client never supplies capacity, quota, occupancy, role or permit status.
- Capacity and permit decisions are enforced in PostgreSQL.
- Check-in and check-out are transaction-safe, guarded by a per (destination, visit date) advisory lock.
- Row Level Security limits every read. Another user's row returns `404`, never `403`.
- The QR carries a one-time opaque token and no personal data. Personal details are masked server-side before storage.
- The `service_role` key is server-only and is never sent to the browser.

## Repository layout

The application lives in `frontend/` (there is no root `package.json`, so a host such as Vercel needs its root directory set to `frontend`).

```text
frontend/
  app/            routes: public pages, (tourist), (department), (auth), api/v1/*
  services/       server-side reads and mutations
  lib/            pure logic and the unit-tested rules (capacity, permits, check-in/out, readiness, ...)
  components/     React UI, grouped by tourist and department
  supabase/
    migrations/   ordered SQL, 001 to 016
    run-migration.js  applies a named migration from the CLI
  types/          shared API contracts
```

## Getting started

You need Node.js 20 or newer and a Supabase project with Postgres, Auth, Realtime and Storage.

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Then open http://localhost:3000.

### Point it at Supabase

1. Create a Supabase project.
2. Copy the project URL, the `anon` key, the `service_role` key and the Postgres (database) password from Project Settings.
3. Put them in `frontend/.env.local` (see the table below). That file is git-ignored; keep real values out of the repo.
4. Apply the schema, RLS policies and RPC functions. There is no bulk mode, so run each migration by name, in order:

```bash
# from frontend/, after NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD are set
node supabase/run-migration.js 001_initial_schema.sql
node supabase/run-migration.js 002_fix_rls_recursion.sql
# ... through 016, in numeric order
```

## Environment variables

All values are read from `frontend/.env.local`. Only the `NEXT_PUBLIC_` ones are exposed to the browser.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | public `anon` key, gated by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | admin key that bypasses RLS, never shipped to the browser |
| `SUPABASE_DB_PASSWORD` | tooling | database password used by `supabase/run-migration.js` |
| `SUPABASE_POOLER_REGION` | optional | AWS region of the connection pooler |
| `WEATHER_BASE_URL` | optional | override the weather host; default is Open-Meteo, no key needed |
| `CHAT_AI_BASE_URL` / `_API_KEY` / `_MODEL` | optional | assistant re-phrasing layer |
| `READINESS_AI_*` | optional | readiness re-phrasing layer, used when `CHAT_AI_*` is unset |

The AI and weather providers are optional. If they are unset or a call fails, the app returns its deterministic result unchanged.

## Routes

Public: `/`, `/destinations`, `/destinations/[id]`, `/login`, `/register`.

Tourist (signed in): `/visitor`, `/my-permits`, `/my-permits/new`, `/my-permits/[id]`, `/my-permits/[id]/qr`, `/readiness`.

Department (operator): `/overview`, `/capacity`, `/permits`, `/qr-checkpoint`, `/control-room`.

API surface: REST route handlers under `/api/v1` for `auth/profile`, `destinations`, `permits`, `checkins`, `checkouts`, `department/*` operations, `readiness/assess` and `chat`. Client components only call these handlers; they never talk to Supabase directly.

## Scripts

Run from `frontend/`.

| Command | Does |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | `node --test` over `lib/**/*.test.ts` |

## Deploying

See [`frontend/DEPLOYMENT.md`](frontend/DEPLOYMENT.md) for the production environment checklist and the Vercel root-directory note.

## Demo mode (for reviewers)

To let evaluators try the app without creating an account, set these environment
variables on the deployment:

- `DEMO_MODE=true`
- `DEMO_TOURIST_EMAIL` and `DEMO_TOURIST_PASSWORD`
- `DEMO_OPERATOR_EMAIL` and `DEMO_OPERATOR_PASSWORD`

Then run `node supabase/seed-demo.js` (from `frontend/`) once against the same
Supabase project. It creates the two throwaway accounts and a realistic set of
permits on a dedicated demo destination. The landing page then shows "Test the
app" buttons that sign a reviewer straight in as a visitor or as department
staff. When `DEMO_MODE` is not set, the buttons and the sign-in route are
disabled and the app uses normal login only.

## License

No license file is included yet. Add one before publishing if the submission requires it.
