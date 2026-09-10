-- PRAVAAH — Migration 008: transactional permit request and review
--
-- Replaces a read-then-write race. The Phase 6 routes measured capacity, quota and
-- booked totals in one set of queries and inserted in a later one, so two
-- concurrent requests could each see room that the first of them then consumed. No
-- policy or column trigger can prevent that: the constraint is an aggregate over
-- rows that do not exist yet when the check runs.
--
-- Each function measures and writes inside one transaction behind a transactional
-- advisory lock on (destination, visit date), so the second caller waits, re-reads
-- the now-larger booked total and is refused.
--
-- SECURITY DEFINER is deliberate here and is the opposite of migration 006.
-- cancel_permit touches one row the caller already owns, so invoker rights let RLS
-- guard it. A booking check must sum group_size across every reservation for that
-- destination and date, and under a tourist's own SELECT policy that sum would
-- count only their own permits and silently over-admit the day. Reading the
-- aggregate correctly needs owner rights; the consequence is that RLS is not the
-- guard here, so both functions state their authorization explicitly and never
-- take an identity from an argument.
--
-- Refusals are returned as data rather than raised: a full day is an expected
-- outcome, and { ok: false, code: "QUOTA_EXCEEDED" } maps onto the docs/API.md
-- envelope without anyone parsing prose out of an exception. Only
-- "not authenticated" raises, because that is a programming error, not a decision.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- Shared helpers, defined first so the bodies below resolve them
-- ============================================================
CREATE OR REPLACE FUNCTION public.permit_refusal(p_code text, p_message text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('ok', false, 'code', p_code, 'message', p_message);
$$;

-- The one permit shape every response uses. Deliberately excludes qr_token_hash,
-- the contact blocks and user_id: docs/API.md rule 4 forbids returning
-- unnecessary PII, and a QR token is issued by Phase 7, not leaked by a status read.
CREATE OR REPLACE FUNCTION public.permit_summary(p_permit public.permits)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p_permit.id,
    'destination_id', p_permit.destination_id,
    'visit_date', to_char(p_permit.visit_date, 'YYYY-MM-DD'),
    'group_size', p_permit.group_size,
    'status', p_permit.status,
    'created_at', p_permit.created_at,
    'updated_at', p_permit.updated_at
  );
$$;

-- ============================================================
-- request_permit — a tourist asks for a place
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_permit(
  p_destination_id uuid,
  p_visit_date date,
  p_group_size integer,
  p_contact_information jsonb DEFAULT NULL,
  p_emergency_contact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_destination public.destinations;
  v_capacity public.capacity_configurations;
  v_quota public.daily_quotas;
  v_occupancy numeric := 0;
  v_booked numeric := 0;
  v_permit public.permits;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'request_permit requires an authenticated user'
      USING ERRCODE = 'PRV04';
  END IF;

  -- Structural bounds only; the real limits are capacity and quota below.
  IF p_destination_id IS NULL OR p_visit_date IS NULL THEN
    RETURN public.permit_refusal('VALIDATION_ERROR',
      'A destination and a visit date are required.');
  END IF;
  IF p_group_size IS NULL OR p_group_size < 1 OR p_group_size > 100000 THEN
    RETURN public.permit_refusal('GROUP_SIZE_INVALID',
      'A permit must cover at least one visitor.');
  END IF;
  IF p_visit_date < current_date THEN
    RETURN public.permit_refusal('DATE_IN_PAST',
      'Visit date ' || to_char(p_visit_date, 'YYYY-MM-DD') || ' is in the past.');
  END IF;

  -- Held to commit, so simultaneous requests for the same day queue rather than
  -- each measuring the same empty space. hashtextextended widens past 32 bits to
  -- keep unrelated destinations off one lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_destination_id::text || '|' || p_visit_date::text, 0)
  );

  SELECT * INTO v_destination FROM public.destinations WHERE id = p_destination_id;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Destination not found.');
  END IF;
  IF v_destination.access_status = 'CLOSED' THEN
    RETURN public.permit_refusal('DESTINATION_CLOSED', 'This destination is closed.');
  ELSIF v_destination.access_status = 'RESTRICTED' THEN
    RETURN public.permit_refusal('DESTINATION_RESTRICTED',
      'This destination is currently restricted and not accepting new permits.');
  END IF;

  SELECT * INTO v_capacity FROM public.capacity_configurations
   WHERE destination_id = p_destination_id;
  IF NOT FOUND THEN
    -- Fails closed, matching the capacity engine: an undeclared limit is not an
    -- unlimited one.
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'This destination has no capacity configuration, so permits cannot be assessed.');
  END IF;

  SELECT * INTO v_quota FROM public.daily_quotas
   WHERE destination_id = p_destination_id AND quota_date = p_visit_date;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'No daily quota is set for this date, so permits cannot be assessed.');
  END IF;

  -- Visitors with an active check-in and no check-out (PRD §7).
  SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy
    FROM public.check_ins ci
   WHERE ci.destination_id = p_destination_id
     AND NOT EXISTS (
       SELECT 1 FROM public.check_outs co
        WHERE co.permit_id = ci.permit_id
          AND co.destination_id = ci.destination_id
     );

  IF v_occupancy + p_group_size > v_capacity.maximum_capacity THEN
    RETURN public.permit_refusal('CAPACITY_EXCEEDED',
      'The requested group of ' || p_group_size || ' exceeds the remaining capacity of '
        || GREATEST(0, v_capacity.maximum_capacity - v_occupancy) || '.');
  END IF;

  SELECT COALESCE(sum(p.group_size), 0) INTO v_booked
    FROM public.permits p
   WHERE p.destination_id = p_destination_id
     AND p.visit_date = p_visit_date
     AND p.status IN ('PENDING', 'APPROVED');

  IF v_booked + COALESCE(v_quota.visitors_admitted, 0) + p_group_size > v_quota.quota THEN
    RETURN public.permit_refusal('QUOTA_EXCEEDED',
      'The requested group of ' || p_group_size || ' exceeds the remaining daily quota of '
        || GREATEST(0, v_quota.quota - v_booked - COALESCE(v_quota.visitors_admitted, 0)) || '.');
  END IF;

  -- Ownership comes from the token, never an argument: there is no parameter
  -- through which to request on someone else's behalf.
  INSERT INTO public.permits (
      user_id, destination_id, visit_date, group_size, status,
      contact_information, emergency_contact
    )
  VALUES (
      v_caller, p_destination_id, p_visit_date, p_group_size, 'PENDING',
      p_contact_information, p_emergency_contact
    )
  RETURNING * INTO v_permit;

  RETURN jsonb_build_object('ok', true, 'permit', public.permit_summary(v_permit));
END;
$$;

-- ============================================================
-- review_permit — an operator decides
-- ============================================================
CREATE OR REPLACE FUNCTION public.review_permit(p_permit_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lock_destination uuid;
  v_lock_date date;
  v_permit public.permits;
  v_destination public.destinations;
  v_capacity public.capacity_configurations;
  v_quota public.daily_quotas;
  v_occupancy numeric := 0;
  v_booked numeric := 0;
BEGIN
  IF NOT public.is_department_operator() THEN
    -- Stated explicitly because this function bypasses RLS to read aggregates, so
    -- the policies are not the guard here.
    RETURN public.permit_refusal('FORBIDDEN',
      'This operation requires the department operator role.');
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('APPROVED', 'REJECTED', 'RESTRICTED') THEN
    RETURN public.permit_refusal('VALIDATION_ERROR',
      'A decision must be APPROVED, REJECTED or RESTRICTED.');
  END IF;

  IF p_permit_id IS NULL THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Permit not found.');
  END IF;

  -- Read once only to learn which lock to take. The authoritative read happens
  -- after the lock is held, because another review may still be in flight.
  SELECT destination_id, visit_date INTO v_lock_destination, v_lock_date
    FROM public.permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Permit not found.');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_lock_destination::text || '|' || v_lock_date::text, 0)
  );

  -- Re-read under the lock, and lock the row itself so a concurrent cancel or
  -- second review cannot slip between the check and the update.
  SELECT * INTO v_permit FROM public.permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Permit not found.');
  END IF;

  -- Mirrors the state machine in lib/permit-rules.ts. The two must stay aligned:
  -- the TypeScript is what the routes and tests reason about, this is what the
  -- database will not let through.
  IF p_decision = 'APPROVED' AND v_permit.status NOT IN ('PENDING', 'RESTRICTED') THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'A permit in status ' || v_permit.status || ' cannot become APPROVED.');
  ELSIF p_decision = 'REJECTED' AND v_permit.status <> 'PENDING' THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'A permit in status ' || v_permit.status || ' cannot become REJECTED.');
  ELSIF p_decision = 'RESTRICTED' AND v_permit.status NOT IN ('PENDING', 'APPROVED') THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'A permit in status ' || v_permit.status || ' cannot become RESTRICTED.');
  END IF;

  -- Only an approval has to fit; rejecting and restricting always reduce exposure.
  IF p_decision = 'APPROVED' THEN
    IF v_permit.visit_date < current_date THEN
      RETURN public.permit_refusal('DATE_IN_PAST',
        'This permit''s visit date has passed, so it cannot be approved.');
    END IF;

    SELECT * INTO v_destination FROM public.destinations WHERE id = v_permit.destination_id;
    IF NOT FOUND THEN
      RETURN public.permit_refusal('NOT_FOUND', 'Destination not found.');
    END IF;
    IF v_destination.access_status <> 'OPEN' THEN
      RETURN public.permit_refusal(
        CASE WHEN v_destination.access_status = 'CLOSED'
             THEN 'DESTINATION_CLOSED' ELSE 'DESTINATION_RESTRICTED' END,
        'This destination is ' || lower(v_destination.access_status)
          || ', so permits cannot be approved.');
    END IF;

    SELECT * INTO v_capacity FROM public.capacity_configurations
     WHERE destination_id = v_permit.destination_id;
    IF NOT FOUND THEN
      RETURN public.permit_refusal('NOT_CONFIGURED',
        'This destination has no capacity configuration, so permits cannot be approved.');
    END IF;

    SELECT * INTO v_quota FROM public.daily_quotas
     WHERE destination_id = v_permit.destination_id AND quota_date = v_permit.visit_date;
    IF NOT FOUND THEN
      RETURN public.permit_refusal('NOT_CONFIGURED',
        'No daily quota is set for this date, so permits cannot be approved.');
    END IF;

    SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy
      FROM public.check_ins ci
     WHERE ci.destination_id = v_permit.destination_id
       AND NOT EXISTS (
         SELECT 1 FROM public.check_outs co
          WHERE co.permit_id = ci.permit_id AND co.destination_id = ci.destination_id
       );

    IF v_occupancy + v_permit.group_size > v_capacity.maximum_capacity THEN
      RETURN public.permit_refusal('CAPACITY_EXCEEDED',
        'Approving this group of ' || v_permit.group_size || ' would exceed the capacity of '
          || v_capacity.maximum_capacity || ' while ' || v_occupancy || ' are inside.');
    END IF;

    -- The permit being reviewed is itself still PENDING, so it is already inside
    -- this total and its group must not be added again.
    SELECT COALESCE(sum(p.group_size), 0) INTO v_booked
      FROM public.permits p
     WHERE p.destination_id = v_permit.destination_id
       AND p.visit_date = v_permit.visit_date
       AND p.status IN ('PENDING', 'APPROVED');

    IF v_booked + COALESCE(v_quota.visitors_admitted, 0) > v_quota.quota THEN
      RETURN public.permit_refusal('QUOTA_EXCEEDED',
        'The day is already committed to '
          || (v_booked + COALESCE(v_quota.visitors_admitted, 0)) || ' of '
          || v_quota.quota || ' quota.');
    END IF;
  END IF;

  UPDATE public.permits
     SET status = p_decision
   WHERE id = p_permit_id
  RETURNING * INTO v_permit;

  RETURN jsonb_build_object('ok', true, 'permit', public.permit_summary(v_permit));
END;
$$;

REVOKE ALL ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_permit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_permit(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb) IS
  'Checks capacity and daily quota and inserts a PENDING permit in one transaction, '
  'locked per destination and visit date. Returns {ok,permit} or '
  '{ok:false,code,message}. Owner comes from auth.uid(), never an argument.';
COMMENT ON FUNCTION public.review_permit(uuid, text) IS
  'Operator-only APPROVED, REJECTED or RESTRICTED decision. Approval re-checks the '
  'capacity and quota applying on the day of review.';
