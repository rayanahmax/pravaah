-- ============================================================
-- 012 — Realtime publication for the department console
-- ============================================================
--
-- Phase 12 (docs/DEVELOPMENT_PLAN.md) adds Supabase Realtime so the console
-- reflects live occupancy, checkpoint activity, permit state, quota, capacity
-- and access changes without a manual refresh.
--
-- Realtime is a NOTIFICATION channel only. docs/ARCHITECTURE.md §Realtime and
-- AGENTS.md are explicit that PostgreSQL remains the source of truth: the
-- browser subscribes to postgres_changes and re-reads authoritative state from
-- the Next server layer. It never trusts the event payload as data, and no
-- capacity, occupancy, quota or permit decision is made from a Realtime message.
--
-- postgres_changes delivery is gated by the SAME row level security SELECT
-- policies as ordinary reads, so a subscriber only receives events for rows they
-- could already read (an operator sees every destination; a tourist sees their
-- own permits). Adding tables to the publication does not widen visibility.
--
-- REPLICA IDENTITY FULL is required so UPDATE/DELETE events carry the full row
-- (including destination_id) and the per-destination server filter can match.
--
-- Idempotent by design: safe to re-run through supabase/run-migration.js.

-- The publication Supabase manages for realtime changes. Create it only if the
-- project does not already have it (it normally does).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

DO $$
DECLARE
  t text;
  watched text[] := ARRAY[
    'check_ins',
    'check_outs',
    'permits',
    'alerts',
    'capacity_configurations',
    'daily_quotas',
    'destinations'
  ];
BEGIN
  FOREACH t IN ARRAY watched LOOP
    -- Add to the publication only when it is not already a member.
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    -- Emit full rows on UPDATE/DELETE so the destination filter can match.
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END
$$;

COMMENT ON PUBLICATION supabase_realtime IS
  'Realtime change feed for the department console (Phase 12). Notification only; PostgreSQL stays authoritative.';
