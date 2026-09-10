-- Fix: Replace all recursive EXISTS subqueries with auth.jwt() checks.
-- The old policies queried the profiles table from within policies ON profiles,
-- causing "infinite recursion detected in policy" errors.

-- ---- profiles ----
DROP POLICY IF EXISTS "Operators can view all profiles" ON public.profiles;
CREATE POLICY "Operators can view all profiles"
  ON public.profiles FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- destinations ----
DROP POLICY IF EXISTS "Operators can manage destinations" ON public.destinations;
CREATE POLICY "Operators can manage destinations"
  ON public.destinations FOR ALL
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- capacity_configurations ----
DROP POLICY IF EXISTS "Operators can manage capacity configurations" ON public.capacity_configurations;
CREATE POLICY "Operators can manage capacity configurations"
  ON public.capacity_configurations FOR ALL
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- daily_quotas ----
DROP POLICY IF EXISTS "Operators can manage daily quotas" ON public.daily_quotas;
CREATE POLICY "Operators can manage daily quotas"
  ON public.daily_quotas FOR ALL
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- permits ----
DROP POLICY IF EXISTS "Operators can view all permits" ON public.permits;
CREATE POLICY "Operators can view all permits"
  ON public.permits FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

DROP POLICY IF EXISTS "Operators can update permit status" ON public.permits;
CREATE POLICY "Operators can update permit status"
  ON public.permits FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- check_ins ----
DROP POLICY IF EXISTS "Operators can view check-ins" ON public.check_ins;
CREATE POLICY "Operators can view check-ins"
  ON public.check_ins FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

DROP POLICY IF EXISTS "Operators can create check-ins" ON public.check_ins;
CREATE POLICY "Operators can create check-ins"
  ON public.check_ins FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- check_outs ----
DROP POLICY IF EXISTS "Operators can view check-outs" ON public.check_outs;
CREATE POLICY "Operators can view check-outs"
  ON public.check_outs FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

DROP POLICY IF EXISTS "Operators can create check-outs" ON public.check_outs;
CREATE POLICY "Operators can create check-outs"
  ON public.check_outs FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- alerts ----
DROP POLICY IF EXISTS "Operators can view all alerts" ON public.alerts;
CREATE POLICY "Operators can view all alerts"
  ON public.alerts FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

DROP POLICY IF EXISTS "Operators can manage alerts" ON public.alerts;
CREATE POLICY "Operators can manage alerts"
  ON public.alerts FOR ALL
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- readiness_assessments ----
DROP POLICY IF EXISTS "Operators can view destination assessments" ON public.readiness_assessments;
CREATE POLICY "Operators can view destination assessments"
  ON public.readiness_assessments FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'DEPARTMENT_OPERATOR');

-- ---- profiles: add missing INSERT policy ----
-- (in case it wasn't applied earlier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can create own profile'
  ) THEN
    CREATE POLICY "Users can create own profile"
      ON public.profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;
