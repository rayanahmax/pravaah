-- PRAVAAH — Migration 009: QR token issued when a permit is approved
--
-- PRD §9: "Approved permits receive a QR containing a secure token / reference."
-- docs/DATABASE.md already reserves permits.qr_token_hash TEXT UNIQUE for that
-- value, and 008's review_permit deliberately does not touch it (the response
-- shape permit_summary also omits it so the operator's decision call never leaks
-- the token). This migration closes the loop.
--
-- Why a trigger rather than a change to review_permit:
--   review_permit already runs the approval state machine inside one advisory
--   lock. Adding an UPDATE clause there is possible but rewrites a working,
--   tested function, and the invariant ("any row that reaches APPROVED has a
--   token") is really a property of the row, not of that one path. A BEFORE
--   UPDATE trigger keeps the invariant true for every writer, including any
--   Phase 8 or Phase 9 flow that transitions RESTRICTED back to APPROVED, and
--   keeps 008 as it is.
--
-- Trigger ordering:
--   Postgres fires same-event row triggers in alphabetical order by trigger
--   name, so permits_column_immutability (007) runs before this one. That is
--   the safe order: the immutability check sees NEW.qr_token_hash equal to
--   OLD.qr_token_hash and passes, and only then does this trigger fill it in.
--   Had the names sorted the other way, a tourist could never trigger it (the
--   status gate stops them first) but a service-role flow would look like an
--   unexpected column write to 007. Ordering matters and is deliberate.
--
-- Token shape:
--   Two concatenated gen_random_uuid() calls, dashes stripped, gives 64 hex
--   characters and ~244 bits of entropy. gen_random_uuid() is already used in
--   001 as a column default, so this adds no extension dependency. A UUID v4
--   on its own (122 bits) would be enough for an unguessable opaque handle;
--   doubling it makes the value visually distinct from a bare UUID and leaves
--   headroom for hash-then-lookup patterns a later phase may adopt.
--
-- Idempotent: CREATE OR REPLACE FUNCTION plus a DROP TRIGGER IF EXISTS guard.

-- ============================================================
-- Trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION public.issue_qr_token_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER is the default and is what we want: the trigger never
-- queries anything and never reads auth.uid(), so whose rights it runs under
-- makes no difference to what it can do. Keeping it INVOKER means a future
-- edit cannot accidentally start trusting a bypassed policy.
VOLATILE
AS $$
BEGIN
  -- Only on arrival at APPROVED, and only if no token exists yet. That last
  -- condition means a RESTRICTED → APPROVED re-approval keeps the original
  -- token rather than silently rotating it, so a tourist who has already
  -- displayed a QR is not left holding a dead code. Cancellation, expiry and
  -- check-in transitions never satisfy the status gate.
  IF NEW.status = 'APPROVED' AND NEW.qr_token_hash IS NULL THEN
    NEW.qr_token_hash :=
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.issue_qr_token_on_approval() IS
  'BEFORE UPDATE trigger on public.permits: on the first transition to APPROVED, '
  'fill qr_token_hash with a 64-hex random token. Never rotates an existing token.';

-- The trigger function is only ever reached as part of a row update, so
-- execute rights on it are not a client-facing surface; still, restrict them
-- to the roles that already operate on permits rather than leaving the default
-- PUBLIC grant in place.
REVOKE ALL ON FUNCTION public.issue_qr_token_on_approval() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_qr_token_on_approval() TO authenticated, service_role;

-- ============================================================
-- Attach the trigger
-- ============================================================

DROP TRIGGER IF EXISTS permits_issue_qr_on_approval ON public.permits;
CREATE TRIGGER permits_issue_qr_on_approval
  BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.issue_qr_token_on_approval();
