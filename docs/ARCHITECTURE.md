# PRAVAAH - System Architecture

## Architecture Decision
PRAVAAH uses a Next.js full-stack application with Supabase. A separate FastAPI/Python backend is not required for the MVP.

## High-Level
```text
Next.js
├── Tourist UI
├── Department UI
└── Server/API Layer
          |
          v
      Supabase
      ├── PostgreSQL
      ├── Auth
      ├── Realtime
      └── Storage
```

## Responsibilities

### UI
Rendering, forms, navigation, loading/error states. UI is never authoritative for business decisions.

### Server/API
Authentication verification, authorization, validation, capacity rules, permit decisions, QR validation, check-in/out, external integrations.

### PostgreSQL
Source of truth for users, destinations, capacity, quotas, permits, check-ins, check-outs, alerts, and readiness.

### Realtime
Used for responsive occupancy, dashboard, alert, and permit-status updates. Realtime is not the source of truth.

## Core Flow
```text
Browser
→ Next.js API
→ Authenticate
→ Authorize
→ Validate
→ Business rules
→ PostgreSQL transaction
→ Updated state
→ Realtime notification
→ Browser
```

## Check-in
```text
QR Scanner
→ POST /api/v1/checkins
→ Verify operator
→ Validate QR/permit/date/destination
→ Check capacity
→ Transaction
→ Create check-in
→ Occupancy changes
→ Return result
```

## Security
- Supabase Auth for identity.
- Server-side authorization.
- Row Level Security.
- Service-role key only on server.
- Validate all client input.
- Never trust client occupancy/capacity/permit state.
- No unnecessary PII in QR.

## Scalability
Use a modular monolith. Do not prematurely add microservices, Kubernetes, queues, event buses, or distributed caches.

## Suggested Next.js Structure
```text
frontend/
├── app/
│   ├── api/
│   │   └── v1/
│   ├── dashboard/
│   ├── destinations/
│   └── permits/
├── components/
├── features/
├── hooks/
├── lib/
├── services/
└── types/
```

## Principle
> Keep UI simple, server logic authoritative, and database state consistent.
