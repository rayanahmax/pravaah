-- PRAVAAH — Migration 007: permit fields a tourist may not edit after submitting
--
-- Migration 005 bounded which outcome a tourist's UPDATE may produce, and
-- migration 006 gave them a safe way to cancel. Both leave one gap, because row
-- level security can only constrain the resulting row, not which columns moved:
-- a single statement that sets status = 'CANCELLED' and also rewrites
-- qr_token_hash, group_size or visit_date satisfies 005's WITH CHECK exactly.
-- Confirmed by probe, not theorised.
--
-- This trigger closes it where RLS cannot: it compares OLD to NEW and refuses a
-- non-operator changing anything except status, and refuses a non-operator moving
-- status to anything other than CANCELLED. It is a BEFORE UPDATE row trigger, so
-- the statement never reaches the heap.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.reject_unauthorised_permit_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A NULL auth.uid() means the statement did not come from a user JWT: it is the
  -- service role or internal DDL, which already holds BYPASSRLS and is constrained
  -- by key custody rather than by row security. Letting it through keeps the
  -- server-side flows in Phase 8 working without weakening anything, because an
  -- anonymous REST caller cannot reach a row trigger at all — RLS filters the
  -- target rows first, as migration 005's probes demonstrated.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Department operators decide permits, so they may set any state and edit any
  -- field. Resolved from profiles through is_department_operator(), not a JWT claim.
  IF public.is_department_operator() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Only a department operator may change a permit decision'
      USING ERRCODE = 'PRV03';
  END IF;

  -- Everything except status and the maintained timestamp is frozen once the
  -- request exists, including the two contact columns: a cancelled permit must not
  -- be quietly rewritten after the fact.
  IF NEW.user_id              IS DISTINCT FROM OLD.user_id
    OR NEW.destination_id     IS DISTINCT FROM OLD.destination_id
    OR NEW.visit_date         IS DISTINCT FROM OLD.visit_date
    OR NEW.group_size         IS DISTINCT FROM OLD.group_size
    OR NEW.qr_token_hash      IS DISTINCT FROM OLD.qr_token_hash
    OR NEW.contact_information IS DISTINCT FROM OLD.contact_information
    OR NEW.emergency_contact   IS DISTINCT FROM OLD.emergency_contact
  THEN
    RAISE EXCEPTION 'Permit details cannot be changed after the request is submitted'
      USING ERRCODE = 'PRV03';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_unauthorised_permit_edits() IS
  'BEFORE UPDATE trigger on public.permits: a non-operator may only set status to '
  'CANCELLED and may not change any other column. Raises PRV03.';

REVOKE ALL ON FUNCTION public.reject_unauthorised_permit_edits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_unauthorised_permit_edits() TO authenticated, service_role;

DROP TRIGGER IF EXISTS permits_column_immutability ON public.permits;
CREATE TRIGGER permits_column_immutability
  BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.reject_unauthorised_permit_edits();
