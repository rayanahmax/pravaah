-- PRAVAAH — Fix 003: profile provisioning + real operator authorization
--
-- Addresses four verified defects:
--   1. profiles rows were never created (auth.users existed, public.profiles empty
--      -> .single() returned PGRST116 "cannot coerce the result to a single JSON object")
--   2. every "Operators can ..." policy compared auth.jwt() ->> 'role', but Supabase
--      reserves that claim for the Postgres role ("authenticated"), so all of them
--      silently denied everyone, including real operators
--   3. the client could insert its own profile with a self-chosen role
--      (privilege escalation; violates AGENTS.md rule 6 "never trust client-supplied role")
--   4. existing users had no profile at all
--
-- Idempotent: safe to re-run. Run in the Supabase SQL editor.

-- ============================================================
-- 1. Operator check as a SECURITY DEFINER function
-- ============================================================
-- Reads public.profiles as the table owner, so RLS on profiles does not apply
-- inside it. That is what breaks the policy recursion that migration 002 was
-- trying to avoid, without relying on JWT claims that do not exist.
CREATE OR REPLACE FUNCTION public.is_department_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'DEPARTMENT_OPERATOR'
  );
$$;

REVOKE ALL ON FUNCTION public.is_department_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_department_operator() TO anon, authenticated, service_role;

-- ============================================================
-- 2. Provision a profile automatically on signup
-- ============================================================
-- Role is hardcoded to TOURIST. It is never read from user metadata, because
-- raw_user_meta_data is client-controlled at signUp time. Operators are
-- promoted deliberately (section 6), not self-selected.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    NEW.raw_user_meta_data ->> 'phone',
    'TOURIST'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. Backfill profiles for users that already exist
-- ============================================================
INSERT INTO public.profiles (id, full_name, phone, role)
SELECT
  u.id,
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', '')), ''),
  u.raw_user_meta_data ->> 'phone',
  'TOURIST'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Close the self-escalation path
-- ============================================================
-- Profiles are created by the trigger (SECURITY DEFINER), so the client no
-- longer needs any INSERT policy on this table.
DROP POLICY IF EXISTS "Users can create own profile" ON public.profiles;

-- ============================================================
-- 5. Replace every dead JWT-role policy
-- ============================================================

-- ---- profiles ----
DROP POLICY IF EXISTS "Operators can view all profiles" ON public.profiles;
CREATE POLICY "Operators can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_department_operator());

-- ---- destinations ----
DROP POLICY IF EXISTS "Operators can manage destinations" ON public.destinations;
CREATE POLICY "Operators can manage destinations"
  ON public.destinations FOR ALL
  USING (public.is_department_operator())
  WITH CHECK (public.is_department_operator());

-- ---- capacity_configurations ----
DROP POLICY IF EXISTS "Operators can manage capacity configurations" ON public.capacity_configurations;
CREATE POLICY "Operators can manage capacity configurations"
  ON public.capacity_configurations FOR ALL
  USING (public.is_department_operator())
  WITH CHECK (public.is_department_operator());

-- ---- daily_quotas ----
DROP POLICY IF EXISTS "Operators can manage daily quotas" ON public.daily_quotas;
CREATE POLICY "Operators can manage daily quotas"
  ON public.daily_quotas FOR ALL
  USING (public.is_department_operator())
  WITH CHECK (public.is_department_operator());

-- ---- permits ----
DROP POLICY IF EXISTS "Operators can view all permits" ON public.permits;
CREATE POLICY "Operators can view all permits"
  ON public.permits FOR SELECT
  USING (public.is_department_operator());

DROP POLICY IF EXISTS "Operators can update permit status" ON public.permits;
CREATE POLICY "Operators can update permit status"
  ON public.permits FOR UPDATE
  USING (public.is_department_operator())
  WITH CHECK (public.is_department_operator());

-- ---- check_ins ----
DROP POLICY IF EXISTS "Operators can view check-ins" ON public.check_ins;
CREATE POLICY "Operators can view check-ins"
  ON public.check_ins FOR SELECT
  USING (public.is_department_operator());

DROP POLICY IF EXISTS "Operators can create check-ins" ON public.check_ins;
CREATE POLICY "Operators can create check-ins"
  ON public.check_ins FOR INSERT
  WITH CHECK (public.is_department_operator());

-- ---- check_outs ----
DROP POLICY IF EXISTS "Operators can view check-outs" ON public.check_outs;
CREATE POLICY "Operators can view check-outs"
  ON public.check_outs FOR SELECT
  USING (public.is_department_operator());

DROP POLICY IF EXISTS "Operators can create check-outs" ON public.check_outs;
CREATE POLICY "Operators can create check-outs"
  ON public.check_outs FOR INSERT
  WITH CHECK (public.is_department_operator());

-- ---- alerts ----
DROP POLICY IF EXISTS "Operators can view all alerts" ON public.alerts;
CREATE POLICY "Operators can view all alerts"
  ON public.alerts FOR SELECT
  USING (public.is_department_operator());

DROP POLICY IF EXISTS "Operators can manage alerts" ON public.alerts;
CREATE POLICY "Operators can manage alerts"
  ON public.alerts FOR ALL
  USING (public.is_department_operator())
  WITH CHECK (public.is_department_operator());

-- ---- readiness_assessments ----
DROP POLICY IF EXISTS "Operators can view destination assessments" ON public.readiness_assessments;
CREATE POLICY "Operators can view destination assessments"
  ON public.readiness_assessments FOR SELECT
  USING (public.is_department_operator());

-- ============================================================
-- 6. Promote an operator (deliberate, out-of-band action)
-- ============================================================
-- Uncomment, replace the email, and run once. This is the only supported way
-- to create an operator while self-insert on profiles is closed.
--
-- UPDATE public.profiles p
--    SET role = 'DEPARTMENT_OPERATOR'
--   FROM auth.users u
--  WHERE p.id = u.id
--    AND u.email = 'operator@example.com';
