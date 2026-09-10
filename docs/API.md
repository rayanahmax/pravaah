# PRAVAAH - API Contract

## API Style
REST, versioned under:

```text
/api/v1
```

## Error Format
```json
{
  "error": {
    "code": "CAPACITY_EXCEEDED",
    "message": "The requested group exceeds the remaining capacity."
  }
}
```

## Auth
### POST /api/v1/auth/profile
Return the authenticated application profile. Supabase Auth handles identity.

## Destinations
### GET /api/v1/destinations
List public destinations.

### GET /api/v1/destinations/{destination_id}
Return destination details plus capacity, occupancy, quota, status, and alerts.

### POST /api/v1/department/destinations
Create destination. Operator only.

### PATCH /api/v1/department/destinations/{destination_id}
Update destination. Operator only.

## Capacity
### GET /api/v1/destinations/{destination_id}/capacity
Return:
```json
{
  "data": {
    "capacity": 500,
    "occupancy": 425,
    "remaining": 75,
    "percentage": 85,
    "status": "NEAR_CAPACITY"
  }
}
```

### PATCH /api/v1/department/destinations/{destination_id}/capacity
Request:
```json
{ "capacity": 440 }
```

## Quota
### GET /api/v1/destinations/{destination_id}/quota?date=YYYY-MM-DD
### PATCH /api/v1/department/destinations/{destination_id}/quota
Request:
```json
{ "date": "YYYY-MM-DD", "quota": 500 }
```

## Permits
### POST /api/v1/permits
Create request.

### GET /api/v1/permits/{permit_id}
Get authorized permit.

### GET /api/v1/permits/my
Tourist permits.

### GET /api/v1/department/permits
Operator permit list.

### POST /api/v1/department/permits/{permit_id}/approve
Approve after server-side rules.

### POST /api/v1/department/permits/{permit_id}/reject
Reject.

### POST /api/v1/department/permits/{permit_id}/restrict
Restrict.

### POST /api/v1/permits/{permit_id}/cancel
Cancel eligible permit.

## QR
### GET /api/v1/permits/{permit_id}/qr
Return QR representation for an approved permit.

## Check-in
### POST /api/v1/checkins

Request:
```json
{ "qr_token": "secure-token" }
```

Validate:
- Operator role
- Token
- Permit status
- Destination
- Visit date
- Duplicate state
- Capacity

Then transactionally create the check-in and update/derive occupancy.

## Check-out
### POST /api/v1/checkouts

Request:
```json
{ "qr_token": "secure-token" }
```

Validate active check-in and duplicate state, then transactionally create checkout and update/derive occupancy.

## Dashboard
### GET /api/v1/department/destinations/{destination_id}/dashboard
Return occupancy, capacity, quota, pending permits, recent events, alerts, and access status.

## Access
### POST /api/v1/department/destinations/{destination_id}/restrict
### POST /api/v1/department/destinations/{destination_id}/close
### POST /api/v1/department/destinations/{destination_id}/open

## Alerts
### GET /api/v1/destinations/{destination_id}/alerts
### POST /api/v1/department/destinations/{destination_id}/alerts
### PATCH /api/v1/department/alerts/{alert_id}

## Readiness
### POST /api/v1/readiness/assess
Return deterministic structured readiness results. AI explanation is optional and non-authoritative.

## Weather
### GET /api/v1/destinations/{destination_id}/weather
Server retrieves and normalizes external weather data.

## API Rules
1. Validate all requests.
2. Authorize server-side.
3. Do not expose database internals.
4. Do not return unnecessary PII.
5. Keep business logic server-side.
6. Use transactions for capacity-sensitive operations.
7. Preserve `/api/v1` versioning.
