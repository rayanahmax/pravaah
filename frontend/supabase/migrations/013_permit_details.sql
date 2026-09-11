-- PRAVAAH — Migration 013: rich permit details (Phase 13 tourist permit)
--
-- Adds permits.permit_details, a JSONB document holding the government-style
-- eco-tourism payload (lead visitor, group members, visit/zone/gates, vehicle,
-- camera/equipment). It is stored ALREADY SANITIZED and MASKED by the Next server
-- layer (lib/permit-details.ts): unknown keys are dropped and government ID
-- numbers are reduced to their last four characters before this function ever
-- sees them, so the full identifiers are never persisted.
--
-- group_size remains the authoritative driver of capacity and quota. permit_details
-- is descriptive, not decisional — nothing here changes the booking math from
-- migration 008.
--
-- The request_permit signature gains one defaulted parameter, so this migration
-- drops the old overload and recreates it with the extra argument; the body is
-- otherwise identical to migration 008. The immutability trigger from migration
-- 007 is recreated to also freeze permit_details, so a tourist cannot rewrite the
-- submitted document afterwards.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS permit_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.permits.permit_details IS
  'Server-sanitized, ID-masked eco-tourism permit document (lead, members, visit, vehicle, equipment). Descriptive only; group_size drives capacity.';

-- ------------------------------------------------------------
-- Freeze permit_details for non-operators, alongside the other
-- immutable columns (mirrors migration 007, adding one line).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_unauthorised_permit_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_department_operator() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'Only a department operator may change a permit decision'
      USING ERRCODE = 'PRV03';
  END IF;

  IF NEW.user_id               IS DISTINCT FROM OLD.user_id
    OR NEW.destination_id      IS DISTINCT FROM OLD.destination_id
    OR NEW.visit_date          IS DISTINCT FROM OLD.visit_date
    OR NEW.group_size          IS DISTINCT FROM OLD.group_size
    OR NEW.qr_token_hash       IS DISTINCT FROM OLD.qr_token_hash
    OR NEW.contact_information IS DISTINCT FROM OLD.contact_information
    OR NEW.emergency_contact   IS DISTINCT FROM OLD.emergency_contact
    OR NEW.permit_details      IS DISTINCT FROM OLD.permit_details
  THEN
    RAISE EXCEPTION 'Permit details cannot be changed after the request is submitted'
      USING ERRCODE = 'PRV03';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS permits_column_immutability ON public.permits;
CREATE TRIGGER permits_column_immutability
  BEFORE UPDATE ON public.permits
  FOR EACH ROW EXECUTE FUNCTION public.reject_unauthorised_permit_edits();

-- ------------------------------------------------------------
-- request_permit gains p_permit_details. Body is migration 008
-- verbatim plus the one column on the INSERT.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.request_permit(uuid, date, integer, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.request_permit(
  p_destination_id uuid,
  p_visit_date date,
  p_group_size integer,
  p_contact_information jsonb DEFAULT NULL,
  p_emergency_contact jsonb DEFAULT NULL,
  p_permit_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_destination public.destinations;
  v_capacity public.capacity_configurations;
  v_quota public.daily_quotas;
  v_occupancy numeric := 0;
  v_booked numeric := 0;
  v_permit public.permits;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'request_permit requires an authenticated user'
      USING ERRCODE = 'PRV04';
  END IF;

  IF p_destination_id IS NULL OR p_visit_date IS NULL THEN
    RETURN public.permit_refusal('VALIDATION_ERROR',
      'A destination and a visit date are required.');
  END IF;
  IF p_group_size IS NULL OR p_group_size < 1 OR p_group_size > 100000 THEN
    RETURN public.permit_refusal('GROUP_SIZE_INVALID',
      'A permit must cover at least one visitor.');
  END IF;
  IF p_visit_date < current_date THEN
    RETURN public.permit_refusal('DATE_IN_PAST',
      'Visit date ' || to_char(p_visit_date, 'YYYY-MM-DD') || ' is in the past.');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_destination_id::text || '|' || p_visit_date::text, 0)
  );

  SELECT * INTO v_destination FROM public.destinations WHERE id = p_destination_id;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_FOUND', 'Destination not found.');
  END IF;
  IF v_destination.access_status = 'CLOSED' THEN
    RETURN public.permit_refusal('DESTINATION_CLOSED', 'This destination is closed.');
  ELSIF v_destination.access_status = 'RESTRICTED' THEN
    RETURN public.permit_refusal('DESTINATION_RESTRICTED',
      'This destination is currently restricted and not accepting new permits.');
  END IF;

  SELECT * INTO v_capacity FROM public.capacity_configurations
   WHERE destination_id = p_destination_id;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'This destination has no capacity configuration, so permits cannot be assessed.');
  END IF;

  SELECT * INTO v_quota FROM public.daily_quotas
   WHERE destination_id = p_destination_id AND quota_date = p_visit_date;
  IF NOT FOUND THEN
    RETURN public.permit_refusal('NOT_CONFIGURED',
      'No daily quota is set for this date, so permits cannot be assessed.');
  END IF;

  SELECT COALESCE(sum(ci.group_size), 0) INTO v_occupancy
    FROM public.check_ins ci
   WHERE ci.destination_id = p_destination_id
     AND NOT EXISTS (
       SELECT 1 FROM public.check_outs co
        WHERE co.permit_id = ci.permit_id
          AND co.destination_id = ci.destination_id
     );

  IF v_occupancy + p_group_size > v_capacity.maximum_capacity THEN
    RETURN public.permit_refusal('CAPACITY_EXCEEDED',
      'The requested group of ' || p_group_size || ' exceeds the remaining capacity of '
        || GREATEST(0, v_capacity.maximum_capacity - v_occupancy) || '.');
  END IF;

  SELECT COALESCE(sum(p.group_size), 0) INTO v_booked
    FROM public.permits p
   WHERE p.destination_id = p_destination_id
     AND p.visit_date = p_visit_date
     AND p.status IN ('PENDING', 'APPROVED');

  IF v_booked + COALESCE(v_quota.visitors_admitted, 0) + p_group_size > v_quota.quota THEN
    RETURN public.permit_refusal('QUOTA_EXCEEDED',
      'The requested group of ' || p_group_size || ' exceeds the remaining daily quota of '
        || GREATEST(0, v_quota.quota - v_booked - COALESCE(v_quota.visitors_admitted, 0)) || '.');
  END IF;

  INSERT INTO public.permits (
      user_id, destination_id, visit_date, group_size, status,
      contact_information, emergency_contact, permit_details
    )
  VALUES (
      v_caller, p_destination_id, p_visit_date, p_group_size, 'PENDING',
      p_contact_information, p_emergency_contact, COALESCE(p_permit_details, '{}'::jsonb)
    )
  RETURNING * INTO v_permit;

  RETURN jsonb_build_object('ok', true, 'permit', public.permit_summary(v_permit));
END;
$$;

REVOKE ALL ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_permit(uuid, date, integer, jsonb, jsonb, jsonb) IS
  'Checks capacity and daily quota and inserts a PENDING permit (with sanitized, '
  'ID-masked permit_details) in one transaction, locked per destination and visit '
  'date. Returns {ok,permit} or {ok:false,code,message}. Owner comes from auth.uid().';
