# Phase 13 — Tourist UI: team division of work

This document is the contract for building **Phase 13 (Tourist UI)** with three
people without stepping on each other. It exists because the failure mode of a
parallel UI sprint is not "who writes which component" — it is **two people
editing the same shared file** and **clean-but-wrong merges**. Everything below is
designed to make those impossible.

Scope for this sprint: **Phase 13 only.** Weather (Phase 15) and Readiness
(Phase 14) have no endpoints yet, so their panels render a graceful "coming soon"
state and are **not** built here. `qrcode.react` is the one approved new
dependency (added by the foundation).

---

## 1. Sequencing (order matters)

1. **Foundation PR** (this branch) merges to `main` first. It creates the tourist
   shell, the shared UI primitives, the frozen API contract, CI, CODEOWNERS, and a
   **stub file for every Phase 13 route**.
2. All three owners **re-branch from `main` after the foundation merges**, then
   build their streams in parallel.
3. Merge order on the way back in: **A → B → C** (B links to A's routes; C links
   to B's). Re-run the build on `main` after each merge.

Because the foundation pre-creates every route file, no two people ever "create"
the same file — the classic new-file collision cannot happen.

---

## 2. Ownership map

| Owner | Streams | Owns (edit freely) |
|---|---|---|
| **Lead / foundation** | shell, primitives, contract, CI | `app/(tourist)/layout.tsx`, `app/(tourist)/tourist-shell.module.css`, `components/tourist/ui/**`, `types/tourist.ts`, `app/page.tsx`, `package.json`, `lib/supabase/**`, `services/**`, `app/api/**`, `supabase/migrations/**`, `.github/**`, `docs/**` |
| **Person A — Discovery** | browse destinations | `app/(tourist)/destinations/**`, `components/tourist/discovery/**` |
| **Person B — Permits** | request → status → cancel | `app/(tourist)/my-permits/page.tsx`, `my-permits/new/**`, `my-permits/[id]/page.tsx`, `components/tourist/permits/**` |
| **Person C — QR + polish** | QR screen, cross-links, a11y/responsive, integration smoke | `app/(tourist)/my-permits/[id]/qr/**`, `components/tourist/qr/**` |

Route paths are namespaced away from the operator console (which already owns
`/permits`, `/capacity`, `/overview`), so a tourist and an operator never collide
on a URL:

- `/destinations`, `/destinations/[id]`
- `/my-permits`, `/my-permits/new`, `/my-permits/[id]`, `/my-permits/[id]/qr`

---

## 3. The rules that make it "work perfectly"

1. **Styling is per-component CSS Modules only.** Never edit `app/globals.css`.
   Each of your components imports its own `*.module.css`. The shared primitives
   already use `components/tourist/ui/ui.module.css` (lead-owned). This removes
   the single biggest merge-conflict source.
2. **The API contract is frozen** in `types/tourist.ts`. Import these types; do
   not edit the file to suit your page. Need a shape changed? That is a lead PR
   reviewed by all three.
3. **Consume, don't edit, the primitives** in `components/tourist/ui/`
   (`Card`, `SectionHeader`, `StatusPill`, `EmptyState`, `Skeleton`). Request a
   change via an issue; the lead lands it once.
4. **No new migrations.** Phase 13 is UI over existing endpoints. If you think you
   need one, stop and raise it — two people grabbing `013_` silently breaks the
   build.
5. **Never run `next build` while `next dev` is serving in your checkout** — it
   corrupts the shared `.next` and causes phantom route flips. Builds happen in CI
   or a clean checkout.
6. **Client components mutate through `/api/v1` routes only** (see
   `lib/client-api.ts`), then `router.refresh()`. Never call services/Supabase
   writes from the browser; the server re-derives every authoritative value.
7. **Rebase onto `main` before opening each PR**, and **run typecheck + build on
   the merged result** — a clean auto-merge can still hide a duplicate same-named
   export across two branches.

---

## 4. Branch / PR flow

- Branch per stream: `phase13/discovery`, `phase13/permits`, `phase13/qr`.
- PR into `main`; CI must be green (typecheck → lint → test → build).
- CODEOWNERS auto-requests the right reviewer; a shared/foundation file cannot
  merge without the lead.
- Small, frequent PRs beat one big one.

---

## 5. Integration checklist (the "works perfectly" gate)

- [ ] Foundation merged; all three re-branch from `main`.
- [ ] Each stream: CI green + 1 review + CODEOWNER approval.
- [ ] Merge A, then rebase+merge B, then C — **re-run build on `main` after each**.
- [ ] Person C runs the end-to-end smoke against the live DB:
      browse → request → status → QR.
      Note: the browser session is operator-authed; for a tourist flow you need a
      TOURIST login (signup creates a `TOURIST` profile via the DB trigger).
- [ ] Confirm weather/readiness panels show the "coming soon" state, not a crash.

---

## 6. What each stub expects (so streams line up)

Every stub file already renders `SectionHeader` + `RouteStub` with the exact
endpoint and behaviour it should implement. Open the stub — the `purpose` text is
your spec. The response shapes are in `types/tourist.ts`.
