-- PRAVAAH — Migration 005: restrict tourist permit updates to cancellation
--
-- Security prerequisite for Phase 6. docs/PRD.md §8 puts permit approval with a
-- department operator, and AGENTS.md rules 6 and 7 require capacity and permit
-- decisions to be enforced server-side. Until now the database did not enforce
-- that for the owner of a permit.
--
-- "Tourists can cancel own permits" (migration 001) declared FOR UPDATE with a
-- USING clause and no WITH CHECK. PostgreSQL then reuses USING as the write
-- check, and that expression admits any row whose status is 'PENDING' or
-- 'APPROVED' — so a tourist writing status='APPROVED' satisfied it. In other
-- words an account could approve its own permit, or reject it, or rewrite
-- group_size, visit_date and qr_token_hash, and the database would accept it.
--
-- Migration 002 and 003 touched only the operator policies, so this gap was
-- never closed. Idempotent: safe to re-run.

-- ============================================================
-- Tourist UPDATE: cancellation only
-- ============================================================
-- USING is unchanged: a tourist may act on their own permit while it is PENDING
-- or APPROVED, which is what docs/API.md means by "eligible" for cancel.
--
-- WITH CHECK now constrains the resulting row: it must still belong to them and
-- its status must be CANCELLED. Anything that leaves the row PENDING or moves it
-- to APPROVED, REJECTED, RESTRICTED, EXPIRED, CHECKED_IN or COMPLETED is refused,
-- which removes self-approval and self-rejection.
--
-- The policy name is kept identical to migration 001's so existing references and
-- the intent recorded in docs remain traceable; only its behaviour tightens.
DROP POLICY IF EXISTS "Tourists can cancel own permits" ON public.permits;

CREATE POLICY "Tourists can cancel own permits"
  ON public.permits FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('PENDING', 'APPROVED')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'CANCELLED'
  );

-- ============================================================
-- Deliberately not changed
-- ============================================================
-- "Operators can view all permits" and "Operators can update permit status"
-- already carry both USING and WITH CHECK from migration 003, and were verified
-- by inspection rather than assumed. Tourist SELECT and INSERT policies are
-- untouched: cancellation is an update, and reading or creating one's own permit
-- is unaffected.
--
-- RESIDUAL LIMITATION, stated so it is not mistaken for full column protection:
-- RLS evaluates WITH CHECK against the whole resulting row, not per column. A
-- tourist can therefore still change group_size, visit_date or qr_token_hash in
-- the same single statement that sets status to 'CANCELLED'. That leaves a dead
-- permit with inconsistent history rather than a live permit with forged terms,
-- which is the exposure Phase 6 must not carry. Closing it completely needs a
-- column-immutability trigger or a cancellation RPC, and belongs with the permit
-- workflow rather than being added silently here.
