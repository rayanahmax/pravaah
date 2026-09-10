-- PRAVAAH — Migration 004: one capacity configuration per destination, quota invariants
--
-- Two things the API layer has been assuming but the schema did not enforce:
--
--   1. capacity_configurations had no uniqueness on destination_id, so a
--      destination could hold several rows and "the" capacity was whichever read
--      happened to win. services/capacity.ts worked around this with a
--      read-then-write, which is not safe against two operators editing at once.
--   2. daily_quotas had no numeric invariants, so a quota of -5 or
--      visitors_admitted above quota was storable.
--
-- Both tables' row level security from migration 003 is unchanged. Idempotent:
-- safe to re-run.

-- ============================================================
-- 1. Collapse duplicate capacity configurations
-- ============================================================
-- Keep the newest row per destination. created_at alone can tie, so ctid breaks
-- the tie deterministically; without that the delete would keep an arbitrary row.
DELETE FROM public.capacity_configurations older
 USING public.capacity_configurations newer
 WHERE older.destination_id = newer.destination_id
   AND (
     older.created_at < newer.created_at
     OR (older.created_at = newer.created_at AND older.ctid < newer.ctid)
   );

-- ============================================================
-- 2. One authoritative capacity configuration per destination
-- ============================================================
-- A unique index rather than ALTER TABLE ADD CONSTRAINT because CREATE INDEX is
-- idempotent with IF NOT EXISTS, and it gives PostgREST the conflict target the
-- API's atomic upsert needs.
CREATE UNIQUE INDEX IF NOT EXISTS capacity_configurations_destination_id_key
  ON public.capacity_configurations (destination_id);

-- Zero capacity is meaningful (it closes a destination); negative is not.
ALTER TABLE public.capacity_configurations
  DROP CONSTRAINT IF EXISTS capacity_configurations_maximum_capacity_non_negative;
ALTER TABLE public.capacity_configurations
  ADD CONSTRAINT capacity_configurations_maximum_capacity_non_negative
  CHECK (maximum_capacity >= 0);

-- ============================================================
-- 3. daily_quotas: verify the documented uniqueness
-- ============================================================
-- docs/DATABASE.md already specifies UNIQUE (destination_id, quota_date) and
-- migration 001 created it. Re-assert only if it is absent, so this migration is
-- safe on a database that 001 created correctly and on one that it did not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.daily_quotas'::regclass
       AND conname  = 'daily_quotas_destination_id_quota_date_key'
  ) THEN
    ALTER TABLE public.daily_quotas
      ADD CONSTRAINT daily_quotas_destination_id_quota_date_key
      UNIQUE (destination_id, quota_date);
  END IF;
END
$$;

-- ============================================================
-- 4. daily_quotas: numeric invariants
-- ============================================================
-- NULL is allowed by these checks (three-valued logic treats NULL >= 0 as
-- unknown, which passes), which matches visitors_admitted being nullable with a
-- default of 0 in docs/DATABASE.md.

ALTER TABLE public.daily_quotas
  DROP CONSTRAINT IF EXISTS daily_quotas_quota_non_negative;
ALTER TABLE public.daily_quotas
  ADD CONSTRAINT daily_quotas_quota_non_negative
  CHECK (quota >= 0);

ALTER TABLE public.daily_quotas
  DROP CONSTRAINT IF EXISTS daily_quotas_visitors_admitted_non_negative;
ALTER TABLE public.daily_quotas
  ADD CONSTRAINT daily_quotas_visitors_admitted_non_negative
  CHECK (visitors_admitted >= 0);

-- Nobody may be recorded as admitted beyond the day's declared quota. This is the
-- hard backstop behind the API rule that lowering a quota below the current
-- visitors_admitted is rejected. docs/API.md and docs/PRD.md describe no
-- administrative override, so there is deliberately no escape hatch here: an
-- operator raises the quota first, then admits more visitors.
ALTER TABLE public.daily_quotas
  DROP CONSTRAINT IF EXISTS daily_quotas_visitors_admitted_within_quota;
ALTER TABLE public.daily_quotas
  ADD CONSTRAINT daily_quotas_visitors_admitted_within_quota
  CHECK (visitors_admitted <= quota);
