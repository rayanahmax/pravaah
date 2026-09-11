-- PRAVAAH — Migration 015: allow the CAUTION alert severity
--
-- PRD §16 suggests four severities — INFO, CAUTION, WARNING, CRITICAL — but
-- migration 001 created alerts_severity_check with only three, so CAUTION has
-- never been storable. The mismatch was recorded in continue.md as a product
-- decision rather than a bug, and it had to be settled before Phase 16 builds the
-- operator's alert form: a three-value picker migrated to four afterwards is
-- rework nobody wants.
--
-- Resolved in the PRD's favour. The intermediate tier is the one real field
-- notices occupy — a muddy trail, festival crowding, leeches after rain — and
-- forcing those into WARNING inflates the word until actual hazards stop
-- registering with readers.
--
-- What the ladder means, so the levels stay distinguishable rather than sliding
-- into one another:
--   INFO      no hazard; something a visitor should know
--   CAUTION   minor hazard or degraded conditions; extra awareness warranted
--   WARNING   hazard present on the route or at the site
--   CRITICAL  danger; the destination may be closed, and access_status decides
--
-- Widening an IN-list can only ever make more values acceptable, so no existing
-- row can become invalid and no data backfill is required. Narrowing would have
-- been the dangerous direction.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS followed by ADD CONSTRAINT.

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_severity_check;

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_severity_check
  CHECK (severity IN ('INFO', 'CAUTION', 'WARNING', 'CRITICAL'));

COMMENT ON COLUMN public.alerts.severity IS
  'INFO | CAUTION | WARNING | CRITICAL, per PRD §16. Ordered by escalating risk: '
  'no hazard, minor hazard, hazard present, danger. Informational for visitors and '
  'never an access decision — destinations.access_status governs entry.';
