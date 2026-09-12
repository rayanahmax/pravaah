# Vercel Deployment Checklist — PRAVAAH

The Next.js app lives in `frontend/`, **not** the repo root. The root has no
`package.json`, so Vercel must be pointed at `frontend` or the build fails with
`No Next.js version detected`. This file is the reproducible runbook for that.

## 1. Project settings (dashboard — cannot live in `vercel.json`)

| Setting | Value |
| --- | --- |
| **Root Directory** | `frontend` |
| Framework Preset | Next.js (auto-detected) |
| Build Command | `npm run build` (pinned in `vercel.json`) |
| Install Command | `npm ci` (uses committed `frontend/package-lock.json`) |
| Output Directory | `.next` |

`vercel.json` (in `frontend/`) pins the framework, commands, and output
directory. **Root Directory is a project-level setting only** — set it once
under **Settings → General → Build & Development Settings → Root Directory**,
then redeploy.

## 2. Environment variables

Set every variable below in the Vercel dashboard under **Project → Settings →
Environment Variables**, enabled for both **Production** and **Preview**.
`NEXT_PUBLIC_*` values are inlined at **build time**, so they must be present
before the first build, not just at runtime.

### Required

| Variable | Scope | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Build + browser | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + browser | Supabase → Project Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Supabase → Project Settings → API → `service_role` key |

> `SUPABASE_SERVICE_ROLE_KEY` has **no** `NEXT_PUBLIC_` prefix on purpose —
> the app must never ship it to the browser. Confirm it is set as a **Sensitive**
> secret in Vercel and that no `NEXT_PUBLIC_` variable was used to paste it in.

### Optional — safe to leave unset

| Variable | If unset | Notes |
| --- | --- | --- |
| `WEATHER_BASE_URL` | Uses `https://api.open-meteo.com/v1/forecast` | PRD §15. Only set to point at a mock or self-hosted provider. |
| `CHAT_AI_BASE_URL` / `CHAT_AI_API_KEY` / `CHAT_AI_MODEL` | Assistant returns the deterministic grounded answer unchanged | Optional language layer over the tourist chat. All three of a group must be set to activate. |
| `READINESS_AI_BASE_URL` / `READINESS_AI_API_KEY` / `READINESS_AI_MODEL` | Readiness AI stays deterministic | Reused as fallback when `CHAT_AI_*` is unset, so an existing OpenAI-compatible endpoint need not be duplicated. |

### Do NOT add to Vercel

`SUPABASE_DB_PASSWORD` and `SUPABASE_POOLER_REGION` are used only by
`supabase/run-migration.js` (local migration tooling), never by the deployed
app. Keep them in local `.env.local` only.

## 3. Local source of truth

`frontend/.env.local.example` documents the same variables for local dev. When
you add or rename an env var in code (`grep process.env.` across `app/`, `lib/`,
`services/`, `proxy.ts`), update that example **and** this checklist together.

## 4. Post-deploy verification

- [ ] Build log shows dependencies installing inside `frontend/` and Next.js
      version `16.3.4` detected.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` resolves in the browser — Supabase client
      initializes (no "invalid URL" / missing-key console errors).
- [ ] Tourist landing page (`/`) and `/visitor` render.
- [ ] Login / signup round-trips against Supabase Auth.
- [ ] A permit QR flow works end to end; check-in/out RPCs return success.
- [ ] Server-only routes (control room, capacity, `/api/v1/*`) still work,
      confirming `SUPABASE_SERVICE_ROLE_KEY` reached the server without being
      exposed client-side.
