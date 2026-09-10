# PRAVAAH - AI Development Rules

## Source of Truth
The `/docs` directory is the source of truth for product, architecture, database, API, and development requirements.

Before implementing a feature:
1. Read the relevant docs.
2. Inspect the existing code.
3. Identify the minimum files that need changing.
4. Implement only the requested scope.
5. Run tests, type checks, and linting.
6. Verify acceptance criteria.

## Non-Negotiable Rules
1. Do not invent requirements.
2. Do not add unapproved features or technologies.
3. Do not introduce FastAPI/Python or microservices for the MVP.
4. Use Next.js server/API code as the business-logic layer.
5. Use Supabase PostgreSQL as the source of truth.
6. Never trust client-supplied capacity, occupancy, quota, role, or permit status.
7. Capacity and permit decisions must be enforced server-side.
8. Check-in/check-out operations must be transaction-safe.
9. Configure Supabase Row Level Security appropriately.
10. Never expose the Supabase service-role key to the browser.
11. Do not put unnecessary PII in QR codes.
12. AI must not approve/reject permits or make medical/safety decisions.
13. Do not use AI for authoritative weather/disaster prediction.
14. Do not modify unrelated features.
15. Do not perform large refactors unless required.
16. Keep APIs under `/api/v1`.
17. Preserve existing API contracts unless requirements explicitly change them.

## Architecture
```text
Next.js + TypeScript + React
        |
        v
Next.js Server/API Layer
        |
        v
Supabase
├── PostgreSQL
├── Auth
├── Realtime
└── Storage
```

## Core Workflow
```text
Destination
→ Capacity / Conditions
→ Permit Request
→ Permit Decision
→ QR Permit
→ Check-in
→ Occupancy +
→ Department Control
→ Check-out
→ Occupancy -
```

## AI Coding Protocol
```text
Read docs
→ Inspect code
→ Plan
→ Implement
→ Test
→ Verify
→ Summarize
```

If requirements are ambiguous, do not silently invent behavior. Use the smallest behavior consistent with the docs.

## Quality Principle
Prefer simple, explicit, testable code over unnecessary abstraction.

## UI/UX Engineering Rules
1. Enforce the `ui-ux-pro-max` design templates active in `.opencode/skills/`.
2. Map the workflow phases (Capacity monitoring, Permit status tracker, QR dynamic components, and Department control room) into a premium, clean UI layout.
3. Ensure absolute responsiveness for field use cases (e.g., QR checkpoint scanning screens must be highly optimized for mobile viewports).
