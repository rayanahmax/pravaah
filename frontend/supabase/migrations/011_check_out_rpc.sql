-- PRAVAAH — Migration 011: transactional check-out RPC
--
-- Implements PRD §11 check-out flow:
--   1. Validate QR/token  → find permit
--   2. Find active check-in (has check_in, no check_out yet)
--   3. Prevent duplicate checkout
--   4. Transaction-safe: INSERT check_out, UPDATE permit → COMPLETED, re-derive occupancy
--
-- Uses the same transactional advisory lock key (destination || visit date) as
-- check_in_permit (migration 010), so a concurrent check-in and check-out for the
-- same destination/day queue behind each other rather than race.
--
-- Reuses permit_refusal() and permit_summary() from migration 008.
-- SECURITY DEFINER: must bypass RLS to read all check-in/check-out rows for the
-- destination when deriving occupancy, for the same reason as check_in_permit.
--
-- Quota decision (confirmed product intent): capacity is "how many are inside now"
-- and the daily quota is "how many have entered today". Occupancy therefore drops on
-- check-out (re-derived from check_ins minus check_outs), but daily_quotas.visitors_admitted
-- is deliberately NOT decremented — a visitor who entered today still counts against
-- today's admissions even after they leave. Do not "fix" this asymmetry.
--
-- Idempotent: safe to re-run.

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
      'Invalid QR token or permit not found.');
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
  'the occupancy figure under the same advisory lock as process_check_in.';
