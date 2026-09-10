# PRAVAAH - Development Plan

## Strategy
Build database and server/API contracts first, then build the UI against stable behavior.

```text
Plan → Implement → Test → Verify → Commit → Next feature
```

## Phase 0 - Setup
- [ ] Git repository
- [ ] Next.js app
- [ ] TypeScript
- [ ] Tailwind/shadcn/ui
- [ ] Supabase project
- [ ] Environment variables
- [ ] AGENTS.md
- [ ] Docs
- [ ] Linting/formatting

## Phase 1 - Database
- [ ] profiles
- [ ] destinations
- [ ] capacity_configurations
- [ ] daily_quotas
- [ ] permits
- [ ] check_ins
- [ ] check_outs
- [ ] alerts
- [ ] readiness_assessments
- [ ] constraints
- [ ] indexes
- [ ] RLS

## Phase 2 - Authentication
- [ ] Supabase Auth
- [ ] Registration/login
- [ ] Profiles
- [ ] Roles
- [ ] Server-side auth verification
- [ ] Protected operator routes

## Phase 3 - Destination API
- [ ] List
- [ ] Detail
- [ ] Create
- [ ] Update
- [ ] Public destination information

## Phase 4 - Capacity Engine
- [ ] Occupancy
- [ ] Remaining capacity
- [ ] Percentage
- [ ] Status
- [ ] Configurable thresholds
- [ ] Access override
- [ ] Unit tests for 70%, 70.1%, 90%, 90.1%, 100%, 100.1%

## Phase 5 - Quota
- [ ] Create/update
- [ ] Remaining quota
- [ ] Permit integration
- [ ] Validation

## Phase 6 - Permits
- [ ] Create
- [ ] Tourist list
- [ ] Detail
- [ ] Operator list
- [ ] Approve
- [ ] Reject
- [ ] Restrict
- [ ] Cancel
- [ ] Capacity/quota rules

## Phase 7 - QR
- [ ] Secure token
- [ ] Token hash
- [ ] QR generation
- [ ] Tourist QR screen

## Phase 8 - Check-in
- [ ] QR validation
- [ ] Permit validation
- [ ] Date/destination validation
- [ ] Duplicate prevention
- [ ] Capacity validation
- [ ] Transaction-safe occupancy update

## Phase 9 - Check-out
- [ ] QR validation
- [ ] Active check-in validation
- [ ] Duplicate prevention
- [ ] Transaction-safe checkout
- [ ] Occupancy update
- [ ] Permit completion

## Phase 10 - Department Dashboard
- [ ] Occupancy
- [ ] Capacity
- [ ] Quota
- [ ] Permits
- [ ] Checkpoint activity
- [ ] Alerts

## Phase 11 - Department Controls
- [ ] Capacity update
- [ ] Quota update
- [ ] Restrict
- [ ] Close
- [ ] Reopen
- [ ] Verify tourist-facing changes

## Phase 12 - Realtime
Use Supabase Realtime for:
- [ ] Occupancy
- [ ] Dashboard
- [ ] Alerts
- [ ] Permit status where useful

Realtime improves UX but PostgreSQL remains authoritative.

## Phase 13 - Tourist UI
- [ ] Landing
- [ ] Destination list
- [ ] Destination detail
- [ ] Capacity/status
- [ ] Alerts
- [ ] Weather
- [ ] Readiness
- [ ] Permit form
- [ ] Permit status
- [ ] QR

## Phase 14 - Readiness + AI
- [ ] Questionnaire
- [ ] Rules
- [ ] Structured result
- [ ] Optional LLM explanation
- [ ] AI fallback

## Phase 15 - Weather
- [ ] Server integration
- [ ] Normalize response
- [ ] UI
- [ ] Failure state

## Phase 16 - Alerts
- [ ] Create
- [ ] Display
- [ ] Deactivate
- [ ] Expiry

## Phase 17 - Integration Test
```text
Login
→ Destination
→ Permit
→ Approval
→ QR
→ Check-in
→ Occupancy +
→ Capacity change
→ Restricted
→ New access restricted
→ Check-out
→ Occupancy -
```

## Phase 18 - UI Polish
Only after functionality:
- [ ] Typography
- [ ] Spacing
- [ ] Status hierarchy
- [ ] Loading/empty/error states
- [ ] Mobile
- [ ] Accessibility

Avoid neon gradients, excessive glassmorphism, and generic AI-dashboard styling.

## Phase 19 - Demo
Use:
```text
Capacity = 500
Occupancy = 425
Quota = 500
Group = 4
```

Demonstrate permit → QR → check-in → 429 occupancy → capacity 440 → RESTRICTED → check-out → 425.

## Commit Strategy
```text
feat: add supabase schema
feat: add authentication
feat: add destination api
feat: add capacity engine
feat: add permit workflow
feat: add qr permits
feat: add checkin flow
feat: add checkout flow
feat: add department dashboard
```
