-- PRAVAAH — Migration 006: owner-only permit cancellation RPC
--
-- Closes the residual left by migration 005. That policy stops a tourist
-- approving their own permit, but WITH CHECK is evaluated against the whole
-- resulting row, so one statement that sets status = 'CANCELLED' *and* forges
-- qr_token_hash, group_size or visit_date still satisfies it. RLS checks the
-- outcome of a write; it cannot express "these other columns must not move".
--
-- cancel_permit(p_permit_id) closes that by construction rather than by more
-- policy text: the function takes a single uuid argument and its body assigns
-- exactly one column. There is no parameter through which a caller could supply
-- another field, and the UPDATE never reads a caller-supplied value for one.
--
-- Runs as the calling user (SECURITY INVOKER, the default) so row level security
-- stays an independent second gate underneath the explicit checks; a bug in this
-- function cannot widen what RLS already forbids. Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.cancel_permit(p_permit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_permit public.permits;
  v_updated integer;
BEGIN
  IF p_permit_id IS NULL THEN
    -- Same message and code as the not-found path: this function must not become
    -- an existence oracle for permits the caller does not own.
    RAISE EXCEPTION 'Permit not found' USING ERRCODE = 'PRV01';
  END IF;

  -- A plain read, not SELECT ... FOR UPDATE: a locking clause is filtered by the
  -- UPDATE policies, so the owner's own permit in a non-cancellable state would be
  -- invisible here and every ineligible state would collapse into PRV01 "not
  -- found". The UPDATE below takes the row lock and re-checks status itself, so
  -- nothing is race-dependent about reading without one.
  SELECT * INTO v_permit
    FROM public.permits
   WHERE id = p_permit_id;

  IF NOT FOUND THEN
    -- Reached when the row does not exist, and equally when RLS hides it because
    -- it belongs to someone else. Both answer identically on purpose.
    RAISE EXCEPTION 'Permit not found' USING ERRCODE = 'PRV01';
  END IF;

  -- Redundant under RLS's "Tourists can view own permits", kept as an explicit
  -- assertion so ownership does not depend on one policy staying as written.
  IF v_permit.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Permit not found' USING ERRCODE = 'PRV01';
  END IF;

  IF v_permit.status NOT IN ('PENDING', 'APPROVED') THEN
    RAISE EXCEPTION 'Permit in status % cannot be cancelled', v_permit.status
      USING ERRCODE = 'PRV02';
  END IF;

  -- status is the only assignment. The redundant status predicate guards the
  -- state against anything that changed between the read and this statement.
  UPDATE public.permits
     SET status = 'CANCELLED'
   WHERE id = p_permit_id
     AND user_id = auth.uid()
     AND status IN ('PENDING', 'APPROVED');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- The guarded update matched nothing, so v_permit.status read above is stale.
    -- Report the change rather than quoting a status that may no longer be true.
    RAISE EXCEPTION 'Permit state changed before the cancellation could be applied'
      USING ERRCODE = 'PRV02';
  END IF;

  SELECT * INTO v_permit FROM public.permits WHERE id = p_permit_id;

  -- Deliberately not the whole row: docs/API.md rule 4 says do not return
  -- unnecessary PII, and permits holds contact_information and emergency_contact.
  RETURN jsonb_build_object(
    'id',           v_permit.id,
    'destination_id', v_permit.destination_id,
    'visit_date',   v_permit.visit_date,
    'group_size',   v_permit.group_size,
    'status',       v_permit.status,
    'updated_at',   v_permit.updated_at
  );
END;
$$;

-- COMMENT ON takes one string literal; it is not an expression, so this cannot be
-- built by concatenating fragments.
COMMENT ON FUNCTION public.cancel_permit(uuid) IS
  'Owner-only cancellation of a PENDING or APPROVED permit. Sets status to CANCELLED
   and nothing else. Raises SQLSTATE PRV01 when the permit does not exist or is not
   the caller''s, and PRV02 when its state forbids cancelling.';

-- Only signed-in users may call it: an anonymous caller can never own a permit,
-- and EXECUTE is not needed for anything else.
REVOKE ALL ON FUNCTION public.cancel_permit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_permit(uuid) TO authenticated;

-- Note, not changed here: direct PATCH on /rest/v1/permits can still combine
-- cancellation with a forged column in one statement, and operators legitimately
-- change status through that path. Making every non-status column immutable for a
-- tourist needs a trigger on public.permits; that is a separate decision from
-- adding this RPC and is recorded rather than assumed.
