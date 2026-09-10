-- PRAVAAH — Phase 1: Database Schema
-- Tables, constraints, indexes, and Row Level Security.
-- Source of truth: docs/DATABASE.md

-- ============================================================
-- 0. Helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. profiles
-- ============================================================

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT,
  phone      TEXT,
  role       TEXT NOT NULL DEFAULT 'TOURIST',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT profiles_role_check CHECK (role IN ('TOURIST', 'DEPARTMENT_OPERATOR'))
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 2. destinations
-- ============================================================

CREATE TABLE public.destinations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  description                 TEXT,
  type                        TEXT,
  latitude                    NUMERIC,
  longitude                   NUMERIC,
  difficulty                  TEXT,
  elevation                   INTEGER,
  estimated_duration_minutes  INTEGER,
  access_status               TEXT NOT NULL DEFAULT 'OPEN',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT destinations_access_status_check
    CHECK (access_status IN ('OPEN', 'RESTRICTED', 'CLOSED'))
);

CREATE TRIGGER destinations_updated_at
  BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 3. capacity_configurations
-- ============================================================

CREATE TABLE public.capacity_configurations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id          UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  maximum_capacity        INTEGER NOT NULL,
  available_threshold     NUMERIC DEFAULT 70,
  near_capacity_threshold NUMERIC DEFAULT 90,
  restricted_threshold    NUMERIC DEFAULT 100,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER capacity_configurations_updated_at
  BEFORE UPDATE ON public.capacity_configurations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 4. daily_quotas
-- ============================================================

CREATE TABLE public.daily_quotas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id   UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  quota_date       DATE NOT NULL,
  quota            INTEGER NOT NULL,
  visitors_admitted INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT daily_quotas_destination_id_quota_date_key
    UNIQUE (destination_id, quota_date)
);

CREATE TRIGGER daily_quotas_updated_at
  BEFORE UPDATE ON public.daily_quotas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 5. permits
-- ============================================================

CREATE TABLE public.permits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destination_id       UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  visit_date           DATE NOT NULL,
  group_size           INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'PENDING',
  qr_token_hash        TEXT UNIQUE,
  contact_information  JSONB,
  emergency_contact    JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT permits_status_check
    CHECK (status IN (
      'PENDING', 'APPROVED', 'REJECTED', 'RESTRICTED',
      'CANCELLED', 'EXPIRED', 'CHECKED_IN', 'COMPLETED'
    ))
);

CREATE TRIGGER permits_updated_at
  BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 6. check_ins
-- ============================================================

CREATE TABLE public.check_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id       UUID NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  group_size      INTEGER NOT NULL,
  operator_id     UUID NOT NULL REFERENCES public.profiles(id),
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. check_outs
-- ============================================================

CREATE TABLE public.check_outs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id       UUID NOT NULL REFERENCES public.permits(id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  group_size      INTEGER NOT NULL,
  operator_id     UUID NOT NULL REFERENCES public.profiles(id),
  checked_out_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. alerts
-- ============================================================

CREATE TABLE public.alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id  UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  severity        TEXT NOT NULL,
  active          BOOLEAN DEFAULT TRUE,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT alerts_severity_check
    CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))
);

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 9. readiness_assessments
-- ============================================================

CREATE TABLE public.readiness_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES public.destinations(id) ON DELETE CASCADE,
  visit_date      DATE,
  answers         JSONB,
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. Indexes
-- ============================================================

CREATE INDEX idx_permits_destination_id    ON public.permits (destination_id);
CREATE INDEX idx_permits_visit_date        ON public.permits (visit_date);
CREATE INDEX idx_permits_status            ON public.permits (status);
CREATE INDEX idx_permits_user_id           ON public.permits (user_id);

CREATE INDEX idx_check_ins_destination_id  ON public.check_ins (destination_id);
CREATE INDEX idx_check_ins_permit_id       ON public.check_ins (permit_id);

CREATE INDEX idx_check_outs_destination_id ON public.check_outs (destination_id);
CREATE INDEX idx_check_outs_permit_id      ON public.check_outs (permit_id);

CREATE INDEX idx_daily_quotas_dest_date    ON public.daily_quotas (destination_id, quota_date);

CREATE INDEX idx_alerts_dest_active        ON public.alerts (destination_id, active);

-- ============================================================
-- 11. Row Level Security
-- ============================================================

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quotas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_outs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readiness_assessments   ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
-- Users can read/update their own profile.
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);-- Operators can view all profiles (needed for permit/check-in management).
-- Uses auth.jwt() to avoid infinite recursion from querying the same table.
CREATE POLICY "Operators can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- destinations ----
-- Public: anyone can read destinations.
CREATE POLICY "Public can view destinations"
  ON public.destinations FOR SELECT
  USING (true);

-- Operators can create/update destinations.
CREATE POLICY "Operators can manage destinations"
  ON public.destinations FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- capacity_configurations ----
-- Public read for capacity info.
CREATE POLICY "Public can view capacity configurations"
  ON public.capacity_configurations FOR SELECT
  USING (true);

-- Operators can manage capacity configurations.
CREATE POLICY "Operators can manage capacity configurations"
  ON public.capacity_configurations FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- daily_quotas ----
-- Public read for quota info.
CREATE POLICY "Public can view daily quotas"
  ON public.daily_quotas FOR SELECT
  USING (true);

-- Operators can manage daily quotas.
CREATE POLICY "Operators can manage daily quotas"
  ON public.daily_quotas FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- permits ----
-- Tourists can read their own permits.
CREATE POLICY "Tourists can view own permits"
  ON public.permits FOR SELECT
  USING (auth.uid() = user_id);

-- Operators can view all permits.
CREATE POLICY "Operators can view all permits"
  ON public.permits FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- Tourists can create permit requests.
CREATE POLICY "Tourists can create permits"
  ON public.permits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Tourists can cancel their own eligible permits.
CREATE POLICY "Tourists can cancel own permits"
  ON public.permits FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('PENDING', 'APPROVED')
  );

-- Operators can update permit status (approve/reject/restrict).
CREATE POLICY "Operators can update permit status"
  ON public.permits FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- check_ins ----
-- Operators can view check-ins for their destinations.
CREATE POLICY "Operators can view check-ins"
  ON public.check_ins FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- Operators can create check-ins (server-side enforced).
CREATE POLICY "Operators can create check-ins"
  ON public.check_ins FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- check_outs ----
-- Operators can view check-outs.
CREATE POLICY "Operators can view check-outs"
  ON public.check_outs FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- Operators can create check-outs (server-side enforced).
CREATE POLICY "Operators can create check-outs"
  ON public.check_outs FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- alerts ----
-- Public can read active alerts.
CREATE POLICY "Public can view active alerts"
  ON public.alerts FOR SELECT
  USING (active = true);

-- Operators can view all alerts (including inactive).
CREATE POLICY "Operators can view all alerts"
  ON public.alerts FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- Operators can manage alerts.
CREATE POLICY "Operators can manage alerts"
  ON public.alerts FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );

-- ---- readiness_assessments ----
-- Tourists can read their own assessments.
CREATE POLICY "Tourists can view own assessments"
  ON public.readiness_assessments FOR SELECT
  USING (auth.uid() = user_id);

-- Tourists can create their own assessments.
CREATE POLICY "Tourists can create assessments"
  ON public.readiness_assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Operators can view assessments for their destinations.
CREATE POLICY "Operators can view destination assessments"
  ON public.readiness_assessments FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR'
  );
