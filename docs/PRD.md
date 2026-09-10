# PRAVAAH - Product Requirements Document

## 1. Product Overview
PRAVAAH is a tourism management platform for ecologically sensitive and capacity-constrained adventure-tourism destinations.

It centralizes fragmented destination information and connects real-time visitor occupancy with tourist permits, allowing authorized departments to dynamically control access.

### Core Principle
> Visitor access should reflect the destination's current carrying capacity and operational conditions.

## 2. Problem
Tourism destinations may manage visitor capacity, permits, checkpoints, alerts, and destination information through fragmented processes. This can make it difficult for tourists to understand current access and for departments to connect live occupancy with permit decisions.

PRAVAAH provides one operational source of truth.

## 3. Users

### Tourist
- View destination information.
- See current capacity/status.
- Complete readiness assessment.
- Request a permit.
- Receive QR permit.
- Check in and out using QR.

### Department Operator
- Manage destinations.
- Configure capacity and quotas.
- Review permits.
- Monitor occupancy.
- Scan QR permits.
- Restrict/close access.
- Publish alerts.

## 4. MVP Scope

### MUST
1. Authentication
2. Destination management
3. Centralized destination information
4. Capacity management
5. Occupancy tracking
6. Daily quota management
7. Permit application
8. Permit approval/rejection/restriction
9. QR permit
10. QR check-in
11. QR check-out
12. Automatic occupancy updates
13. Department dashboard
14. Department access control
15. Tourist-facing destination status

### SHOULD
- Readiness assessment
- Weather information
- Destination alerts

### IF TIME
- Permit history
- Preparation checklist
- Basic analytics
- Basic reports

### OUT OF SCOPE
- Nationwide tourism directory
- Hotel booking
- Marketplace
- Medical fitness assessment
- AI permit approval
- AI safety prediction
- AI weather prediction
- Bluetooth mesh SOS
- Advanced GIS
- Crowdsourced trail reporting
- Complex recommendation engine
- Microservices
- Blockchain
- Cryptocurrency

## 5. Centralized Destination View
A destination page should show:
- Name and description
- Location
- Difficulty/elevation/duration
- Current occupancy
- Capacity
- Remaining capacity
- Daily quota and remaining quota
- Access status
- Alerts
- Weather context
- Permit availability
- Restrictions

## 6. Capacity
Capacity and daily quota are separate.

Default status thresholds:

| Occupancy | Status |
|---|---|
| 0-70% | AVAILABLE |
| >70-90% | NEAR_CAPACITY |
| >90-100% | RESTRICTED |
| >=100% | CLOSED |

Department-enforced access restrictions override automatic status.

## 7. Occupancy
For MVP:

> Current occupancy is visitors represented by active check-ins that have not yet been checked out.

```text
CHECK-IN  → occupancy +
CHECK-OUT → occupancy -
```

The frontend never directly modifies authoritative occupancy.

## 8. Permits
States:
```text
PENDING
APPROVED
REJECTED
RESTRICTED
CANCELLED
EXPIRED
CHECKED_IN
COMPLETED
```

Approval requires:
- Valid destination/date
- Destination accepts visitors
- Group fits remaining capacity
- Group fits remaining daily quota
- No blocking restriction

## 9. QR
Approved permits receive a QR containing a secure token/reference. Do not include unnecessary personal information.

```text
QR → Backend validation → Permit → Destination/date/status → Action
```

## 10. Check-in
1. Scan QR.
2. Validate token and permit.
3. Validate destination/date/status.
4. Prevent duplicate check-in.
5. Check capacity.
6. Create check-in transactionally.
7. Update/derive occupancy.
8. Return new status.

Example: `425 → 429` for group size 4.

## 11. Check-out
1. Scan QR.
2. Validate token.
3. Find active check-in.
4. Prevent duplicate checkout.
5. Create checkout transactionally.
6. Decrease/derive occupancy.
7. Complete permit when appropriate.

Example: `429 → 425`.

## 12. Department Dashboard
Show:
- Current visitors
- Capacity
- Occupancy %
- Remaining capacity
- Daily quota
- Remaining quota
- Pending permits
- Recent check-ins/check-outs
- Alerts
- Access status

Controls:
- Change capacity
- Change quota
- Restrict
- Close
- Reopen

## 13. Readiness
Rule-based and informational. Inputs can include trekking experience, high-altitude experience, and activity level.

The system must not claim medical fitness or guarantee safety.

## 14. AI
AI is an explanation layer over deterministic readiness results.

AI must not:
- Approve/reject permits
- Determine medical fitness
- Override capacity rules
- Predict disasters
- Invent destination requirements

If the AI provider fails, deterministic readiness results must still work.

## 15. Weather
Weather is informational. Show current conditions, temperature, precipitation information, timestamp, and advisory. The prototype may use Open-Meteo.

Weather failure must not break permits or occupancy.

## 16. Alerts
Department operators can create, activate, and deactivate destination alerts.

Suggested severity:
`INFO`, `CAUTION`, `WARNING`, `CRITICAL`.

## 17. Demo
Initial:
```text
Capacity = 500
Occupancy = 425
Daily quota = 500
```

A group of 4 receives an approved QR permit.

Check-in:
`425 → 429`

Department changes capacity:
`500 → 440`

`429 / 440 = 97.5%` → `RESTRICTED`

Check-out:
`429 → 425`

This is the primary demonstration of PRAVAAH.
