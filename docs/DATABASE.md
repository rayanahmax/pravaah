# PRAVAAH - Database Design

## Database
Use Supabase PostgreSQL.

## Tables
```text
profiles
destinations
capacity_configurations
daily_quotas
permits
check_ins
check_outs
alerts
readiness_assessments
```

## profiles
```text
id UUID PRIMARY KEY
full_name TEXT
phone TEXT
role TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Roles: `TOURIST`, `DEPARTMENT_OPERATOR`.

Supabase Auth owns identity. `profiles.id` references the authenticated user.

## destinations
```text
id UUID PRIMARY KEY
name TEXT NOT NULL
description TEXT
type TEXT
latitude NUMERIC
longitude NUMERIC
difficulty TEXT
elevation INTEGER
estimated_duration_minutes INTEGER
access_status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Access: `OPEN`, `RESTRICTED`, `CLOSED`.

## capacity_configurations
```text
id UUID PRIMARY KEY
destination_id UUID REFERENCES destinations(id)
maximum_capacity INTEGER NOT NULL
available_threshold NUMERIC DEFAULT 70
near_capacity_threshold NUMERIC DEFAULT 90
restricted_threshold NUMERIC DEFAULT 100
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## daily_quotas
```text
id UUID PRIMARY KEY
destination_id UUID REFERENCES destinations(id)
quota_date DATE NOT NULL
quota INTEGER NOT NULL
visitors_admitted INTEGER DEFAULT 0
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Unique: `(destination_id, quota_date)`.

## permits
```text
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
destination_id UUID REFERENCES destinations(id)
visit_date DATE NOT NULL
group_size INTEGER NOT NULL
status TEXT NOT NULL
qr_token_hash TEXT UNIQUE
contact_information JSONB
emergency_contact JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Statuses:
`PENDING`, `APPROVED`, `REJECTED`, `RESTRICTED`, `CANCELLED`, `EXPIRED`, `CHECKED_IN`, `COMPLETED`.

## check_ins
```text
id UUID PRIMARY KEY
permit_id UUID REFERENCES permits(id)
destination_id UUID REFERENCES destinations(id)
group_size INTEGER NOT NULL
operator_id UUID REFERENCES profiles(id)
checked_in_at TIMESTAMPTZ NOT NULL
```

## check_outs
```text
id UUID PRIMARY KEY
permit_id UUID REFERENCES permits(id)
destination_id UUID REFERENCES destinations(id)
group_size INTEGER NOT NULL
operator_id UUID REFERENCES profiles(id)
checked_out_at TIMESTAMPTZ NOT NULL
```

## alerts
```text
id UUID PRIMARY KEY
destination_id UUID REFERENCES destinations(id)
title TEXT NOT NULL
message TEXT NOT NULL
severity TEXT NOT NULL
active BOOLEAN DEFAULT TRUE
starts_at TIMESTAMPTZ
ends_at TIMESTAMPTZ
created_by UUID REFERENCES profiles(id)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## readiness_assessments
```text
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles(id)
destination_id UUID REFERENCES destinations(id)
visit_date DATE
answers JSONB
result JSONB
created_at TIMESTAMPTZ
```

## Relationships
```text
profiles
├── permits
└── readiness_assessments

destinations
├── capacity_configurations
├── daily_quotas
├── permits
├── check_ins
├── check_outs
└── alerts

permits
├── check_ins
└── check_outs
```

## Occupancy
MVP definition:
```text
Current occupancy =
sum(group_size of active check-ins without checkout)
```

A transactional counter may be introduced for performance later, but consistency with check-in/out events is mandatory.

## Indexes
At minimum:
```text
permits(destination_id)
permits(visit_date)
permits(status)
permits(user_id)
check_ins(destination_id)
check_ins(permit_id)
check_outs(destination_id)
check_outs(permit_id)
daily_quotas(destination_id, quota_date)
alerts(destination_id, active)
```

## RLS
Examples:
- Tourists read their own permits.
- Public users read public destination data.
- Operators manage authorized department resources.
- Clients cannot directly change occupancy or permit approval.
- Authoritative operations use protected server-side logic.

## Principle
> PostgreSQL is the source of truth. Client state is never authoritative.
