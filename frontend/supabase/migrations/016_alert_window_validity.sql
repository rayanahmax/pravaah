-- PRAVAAH — Migration 016: an alert window cannot end before it starts
--
-- Phase 16 gives operators a create form with optional starts_at / ends_at bounds.
-- Both columns existed since 001 with no relationship between them, so a row could
-- already be stored that ends before it begins — and because listActiveAlerts only
-- shows an alert whose window contains now, such a row can never display. An
-- operator would have published a notice that silently does nothing, with no error
-- and no way to see why.
--
-- Enforced in the database rather than only in the API, following migration 004's
-- precedent of making an invariant the schema's rule instead of an app convention:
-- a row hand-edited in the dashboard is subject to the same law as one created
-- through the endpoint. lib/api/validation.ts applies the same rule first so a
-- legitimate mistake returns a readable 400 rather than surfacing a constraint
-- violation as a 500 (API rule 3).
--
-- NULLs are open-ended, which is the normal case for "raise until further notice",
-- so either side being absent is valid. The comparison is strict: a zero-length
-- window is refused for the same reason an inverted one is — it can never display.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS followed by ADD CONSTRAINT.

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_window_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_window_check
  CHECK (
    starts_at IS NULL
    OR ends_at IS NULL
    OR ends_at > starts_at
  );

COMMENT ON CONSTRAINT alerts_window_check ON public.alerts IS
  'A bounded alert must end strictly after it starts. Either bound may be NULL for '
  'an open-ended window. Mirrored by isWindowValid() in lib/alert-rules.ts so the '
  'API can refuse a bad window with a 400 before the database refuses it with a '
  'constraint violation.';
