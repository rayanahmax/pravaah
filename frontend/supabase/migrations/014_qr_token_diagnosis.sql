-- PRAVAAH — Migration 014: tell a permit reference apart from a QR token
--
-- An operator typed the "PRM-D8DE22" code printed on a visitor's pass into the
-- checkpoint scanner and was refused with "Permit not found for the provided QR
-- token." That message is true but useless at the gate: it does not say what went
-- wrong, so the natural conclusion is that the scanner or the permit is broken.
--
-- The two values are easy to confuse and are distinguished by nothing in the
-- current wording. A token is 64 lowercase hex characters minted by migration 009;
-- a reference is "PRM-" plus six hex characters, derived in the app by
-- permitReference() in lib/department-labels.ts, and is a display label only.
--
-- Scope and safety:
--   * The lookup is untouched. The diagnosis runs ONLY inside the branch that has
--     already found no matching permit, so no value that could legitimately match
--     is rejected any earlier or more often than before. A well-formed but unknown
--     token still gets the original message.
--   * The code stays NOT_FOUND. Adding a code would change the documented API
--     contract (AGENTS rule 17) and would be downgraded to INVALID_STATE by
--     apiRejection's RULE_CODES set in lib/api/error.ts unless that were changed
--     too. The message is what an operator reads, so the message is what improves.
--   * Nothing here decides a permit outcome. It is wording on a refusal that
--     already existed, and the operator gate ahead of it is unchanged.
--
-- Telling an operator the token's length and alphabet leaks nothing useful to an
-- attacker: the value is 244 bits of entropy visible in the QR on any pass, and
-- every call reaching this branch has already passed is_department_operator().
--
-- Idempotent: CREATE OR REPLACE on same-signature functions, grants re-asserted.

-- ============================================================
-- 1. The diagnosis helper
-- ============================================================

CREATE OR REPLACE FUNCTION public.qr_token_diagnosis(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
-- Pinned like every other function here: an IMMUTABLE SQL function resolved
-- through a mutable search_path is a search-path hijack waiting to happen.
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- The printed reference. Tokens never contain a dash, so this shape can only
    -- ever be the display label.
    WHEN upper(trim(p_value)) LIKE 'PRM-%' THEN
      'That is the permit reference printed on the pass, which only identifies the '
      || 'permit for reading and speaking. Ask the visitor for the checkpoint token '
      || 'shown under their QR, or scan the QR.'

    -- Almost always a truncated paste or a different code entirely, and the count
    -- is the fastest way for an operator to see it.
    WHEN length(trim(p_value)) <> 64 THEN
      'A checkpoint token is 64 characters; this value is '
      || length(trim(p_value))
      || ', so it is incomplete or is not a token.'

    -- Migration 009 mints the token from gen_random_uuid()::text, which is
    -- lowercase hex. This also catches a reference typed without its prefix and
    -- any value whose case was changed by an autofill.
    WHEN trim(p_value) !~ '^[0-9a-f]{64}$' THEN
      'A checkpoint token is 64 lowercase hexadecimal characters, so this value '
      || 'contains characters a token never has.'

    -- Well-formed and simply unknown: the caller gets the original message alone.
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.qr_token_diagnosis(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qr_token_diagnosis(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.qr_token_diagnosis(text) IS
  'Pure wording helper: a plain-language reason a submitted value cannot be a '
  'checkpoint token, or NULL when it is well-formed. Diagnostic only — it never '
  'gates a lookup and decides no permit outcome.';

-- ============================================================
-- 2. check_in_permit — unchanged except the NOT_FOUND message
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
      'Permit not found for the provided QR token.'
      || COALESCE(' ' || public.qr_token_diagnosis(p_qr_token), ''));
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
  'updating permit to CHECKED_IN, and incrementing admitted quota. An unmatched '
  'token is refused with a qr_token_diagnosis hint when the value is a permit '
  'reference or otherwise cannot be a token.';

-- ============================================================
-- 3. process_check_out — unchanged except the NOT_FOUND message
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_check_out(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller      uuid := auth.uid();
  v_permit      public.permits;
  v_check_in    public.check_ins;
  v_check_out   public.check_outs;
  v_capacity    public.capacity_configurations;
  v_occupancy_before numeric := 0;
  v_occupancy_after  numeric := 0;
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────────────
  IF NOT public.is_department_operator() THEN
    RETURN public.permit_refusal('FORBIDDEN',
      'This operation requires the department operator role.');
  END IF;

  -- ── Input guard ──────────────────────────────────────────────────────────────
  IF p_qr_token IS NULL OR trim(p_qr_token) = '' THEN
    RETURN public.permit_refusal('VALIDATION_ERROR',
      'A QR token is required.');
  END IF;

  -- ── Find permit by token. Matched exactly as check_in_permit does: migration
  -- 009 stores the raw opaque token in qr_token_hash, so a scan presents that
  -- same value. The previous `OR sha256(token)` branch never matched a real
  -- token and let check-out and check-in accept different encodings. ──────────
  SELECT * INTO v_permit
    FROM public.permits
   WHERE qr_token_hash = trim(p_qr_token);

  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND',
      'Invalid QR token or permit not found.'
      || COALESCE(' ' || public.qr_token_diagnosis(p_qr_token), ''));
  END IF;

  -- ── Take advisory lock (same key as check-in so both queue behind each other) ─
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_permit.destination_id::text || '|' || v_permit.visit_date::text, 0)
  );

  -- ── Re-read permit under row lock ────────────────────────────────────────────
  SELECT * INTO v_permit
    FROM public.permits
   WHERE id = v_permit.id
     FOR UPDATE;

  -- ── Permit must be CHECKED_IN to allow checkout ──────────────────────────────
  IF v_permit.status = 'COMPLETED' THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'This permit has already been checked out.');
  END IF;

  IF v_permit.status <> 'CHECKED_IN' THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'A permit in status ' || v_permit.status || ' cannot be checked out. '
      || 'The permit must be CHECKED_IN first.');
  END IF;

  -- ── Find active check-in (exists and has no matching check-out) ───────────────
  SELECT * INTO v_check_in
    FROM public.check_ins
   WHERE permit_id = v_permit.id
   ORDER BY checked_in_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'No active check-in found for this permit.');
  END IF;

  -- ── Duplicate checkout prevention ────────────────────────────────────────────
  IF EXISTS (
    SELECT 1
      FROM public.check_outs
     WHERE permit_id = v_permit.id
  ) THEN
    RETURN public.permit_refusal('INVALID_STATE',
      'This permit has already been checked out.');
  END IF;

  -- ── Derive occupancy BEFORE checkout ─────────────────────────────────────────
  SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy_before
    FROM public.check_ins ci
   WHERE ci.destination_id = v_permit.destination_id
     AND NOT EXISTS (
       SELECT 1 FROM public.check_outs co
        WHERE co.permit_id = ci.permit_id
          AND co.destination_id = ci.destination_id
     );

  -- ── Transactionally create check-out ─────────────────────────────────────────
  INSERT INTO public.check_outs (
    permit_id, destination_id, group_size, operator_id, checked_out_at
  ) VALUES (
    v_permit.id, v_permit.destination_id, v_check_in.group_size, v_caller, now()
  )
  RETURNING * INTO v_check_out;

  -- ── Complete permit ──────────────────────────────────────────────────────────
  UPDATE public.permits
     SET status = 'COMPLETED'
   WHERE id = v_permit.id
  RETURNING * INTO v_permit;

  -- ── Derive occupancy AFTER checkout ──────────────────────────────────────────
  -- Re-derive so the figure is exact regardless of any concurrent writes.
  SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy_after
    FROM public.check_ins ci
   WHERE ci.destination_id = v_permit.destination_id
     AND NOT EXISTS (
       SELECT 1 FROM public.check_outs co
        WHERE co.permit_id = ci.permit_id
          AND co.destination_id = ci.destination_id
     );

  -- ── Capacity for response ────────────────────────────────────────────────────
  SELECT * INTO v_capacity
    FROM public.capacity_configurations
   WHERE destination_id = v_permit.destination_id;

  RETURN jsonb_build_object(
    'ok', true,
    'check_out', jsonb_build_object(
      'id',             v_check_out.id,
      'permit_id',      v_check_out.permit_id,
      'destination_id', v_check_out.destination_id,
      'group_size',     v_check_out.group_size,
      'operator_id',    v_check_out.operator_id,
      'checked_out_at', v_check_out.checked_out_at
    ),
    'permit',   public.permit_summary(v_permit),
    'occupancy', jsonb_build_object(
      'previous',  v_occupancy_before,
      'current',   v_occupancy_after,
      'capacity',  COALESCE(v_capacity.maximum_capacity, NULL),
      'remaining', CASE
                     WHEN v_capacity.maximum_capacity IS NOT NULL
                     THEN GREATEST(0, v_capacity.maximum_capacity - v_occupancy_after)
                     ELSE NULL
                   END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_check_out(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_check_out(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.process_check_out(text) IS
  'Validates QR token, finds active check-in, prevents duplicate checkout, then '
  'transactionally creates a check-out row, marks permit COMPLETED, and re-derives '
  'the occupancy figure under the same advisory lock as check_in_permit. An '
  'unmatched token is refused with a qr_token_diagnosis hint when the value is a '
  'permit reference or otherwise cannot be a token.';
