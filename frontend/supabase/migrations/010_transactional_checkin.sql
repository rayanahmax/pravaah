-- PRAVAAH — Migration 010: transactional check-in
--
-- PRD §10 & docs/API.md:
-- Operator scans QR token, validates permit, date, destination, duplicate state,
-- and capacity headroom, then transactionally creates check_in, transitions permit
-- status to CHECKED_IN, updates daily_quotas.visitors_admitted, and returns updated
-- occupancy.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Enforce unique check-in per permit at schema level
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_permit_id_key
  ON public.check_ins (permit_id);

-- ============================================================
-- 2. Transactional check_in_permit RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_in_permit(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operator_id uuid := auth.uid();
  v_permit public.permits;
  v_destination public.destinations;
  v_capacity public.capacity_configurations;
  v_quota public.daily_quotas;
  v_check_in public.check_ins;
  v_occupancy numeric := 0;
  v_new_occupancy numeric := 0;
BEGIN
  IF NOT public.is_department_operator() THEN
    RETURN public.permit_refusal('FORBIDDEN',
      'This operation requires the department operator role.');
  END IF;

  IF p_qr_token IS NULL OR trim(p_qr_token) = '' THEN
    RETURN public.permit_refusal('VALIDATION_ERROR',
      'A QR token is required for check-in.');
  END IF;

  SELECT * INTO v_permit
    FROM public.permits
   WHERE qr_token_hash = trim(p_qr_token);

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND',
      'Permit not found for the provided QR token.');
  END IF;

  -- Transactional advisory lock on (destination, visit date), the SAME key
  -- request_permit and review_permit take in migration 008. Sharing the key is
  -- what makes the occupancy read here serialize against a concurrent approval
  -- for the same destination and day; a destination-only lock would not.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_permit.destination_id::text || '|' || v_permit.visit_date::text, 0)
  );

  -- Re-read under lock with FOR UPDATE
  SELECT * INTO v_permit
    FROM public.permits
   WHERE id = v_permit.id
     FOR UPDATE;

  -- Duplicate check-in checks
  IF v_permit.status = 'CHECKED_IN' THEN
    RETURN public.permit_refusal('CONFLICT',
      'This permit has already been checked in.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.check_ins WHERE permit_id = v_permit.id) THEN
    RETURN public.permit_refusal('CONFLICT',
      'A check-in record already exists for this permit.');
  END IF;

  IF v_permit.status <> 'APPROVED' THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'A permit in status ' || v_permit.status || ' cannot be checked in.');
  END IF;

  -- Visit date check
  IF v_permit.visit_date < current_date THEN
    RETURN public.permit_refusal('DATE_IN_PAST',
      'Permit visit date ' || to_char(v_permit.visit_date, 'YYYY-MM-DD') || ' has passed.');
  ELSIF v_permit.visit_date > current_date THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'Permit is valid for ' || to_char(v_permit.visit_date, 'YYYY-MM-DD') || ', not today.');
  END IF;

  -- Destination check
  SELECT * INTO v_destination
    FROM public.destinations
   WHERE id = v_permit.destination_id;

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Destination not found.');
  END IF;

  IF v_destination.access_status = 'CLOSED' THEN
    RETURN public.permit_refusal('DESTINATION_CLOSED', 'This destination is closed.');
  ELSIF v_destination.access_status = 'RESTRICTED' THEN
    RETURN public.permit_refusal('DESTINATION_RESTRICTED',
      'This destination is currently restricted and not accepting check-ins.');
  END IF;

  -- Capacity configuration check
  SELECT * INTO v_capacity
    FROM public.capacity_configurations
   WHERE destination_id = v_permit.destination_id;

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'This destination has no capacity configuration, so check-in cannot be processed.');
  END IF;

  -- Calculate current occupancy (active check-ins without check-out)
  SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy
    FROM public.check_ins ci
   WHERE ci.destination_id = v_permit.destination_id
     AND NOT EXISTS (
       SELECT 1 FROM public.check_outs co
        WHERE co.permit_id = ci.permit_id
          AND co.destination_id = ci.destination_id
     );

  IF v_occupancy + v_permit.group_size > v_capacity.maximum_capacity THEN
    RETURN public.permit_refusal('CAPACITY_EXCEEDED',
      'Checking in this group of ' || v_permit.group_size || ' would exceed the capacity of '
        || v_capacity.maximum_capacity || ' while ' || v_occupancy || ' are inside.');
  END IF;

  -- Update daily_quotas visitors_admitted. Fail closed on a missing quota row,
  -- the same way request_permit and review_permit do in 008: an undeclared day
  -- limit is not an unlimited one, and admitting without recording would let
  -- occupancy and the admitted counter disagree.
  SELECT * INTO v_quota
    FROM public.daily_quotas
   WHERE destination_id = v_permit.destination_id
     AND quota_date = v_permit.visit_date;

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'No daily quota is set for this date, so check-in cannot be processed.');
  END IF;

  UPDATE public.daily_quotas
     SET visitors_admitted = COALESCE(visitors_admitted, 0) + v_permit.group_size
   WHERE id = v_quota.id;

  -- Create check-in record
  INSERT INTO public.check_ins (
    permit_id, destination_id, group_size, operator_id, checked_in_at
  )
  VALUES (
    v_permit.id, v_permit.destination_id, v_permit.group_size, v_operator_id, now()
  )
  RETURNING * INTO v_check_in;

  -- Transition permit state to CHECKED_IN
  UPDATE public.permits
     SET status = 'CHECKED_IN'
   WHERE id = v_permit.id
  RETURNING * INTO v_permit;

  -- Compute new occupancy. The capacity *status band* is not derived here:
  -- lib/capacity.ts is the single source of the PRD §6 thresholds (its header
  -- states that outright) and is what GET /destinations/{id}/capacity returns
  -- through. Re-implementing the comparison in SQL dropped restricted_threshold
  -- and let the two endpoints disagree for the same row, so the caller runs the
  -- numbers through evaluateCapacity() instead. This function returns only the
  -- raw inputs that call needs.
  v_new_occupancy := v_occupancy + v_permit.group_size;

  RETURN jsonb_build_object(
    'ok', true,
    'check_in', jsonb_build_object(
      'id', v_check_in.id,
      'permit_id', v_check_in.permit_id,
      'destination_id', v_check_in.destination_id,
      'group_size', v_check_in.group_size,
      'operator_id', v_check_in.operator_id,
      'checked_in_at', v_check_in.checked_in_at
    ),
    'permit', public.permit_summary(v_permit),
    'capacity', jsonb_build_object(
      'maximum_capacity',        v_capacity.maximum_capacity,
      'occupancy',               v_new_occupancy,
      'available_threshold',     v_capacity.available_threshold,
      'near_capacity_threshold', v_capacity.near_capacity_threshold,
      'restricted_threshold',    v_capacity.restricted_threshold,
      'access_status',           v_destination.access_status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_permit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_permit(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_in_permit(text) IS
  'Operator-only transactional check-in. Validates QR token, permit state, date, '
  'destination status, duplicate check-in, and capacity before creating check_in, '
  'updating permit to CHECKED_IN, and incrementing admitted quota.';
