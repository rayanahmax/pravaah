import { createClient } from "@/lib/supabase/server";
import type { PermitSummary } from "@/services/permits";
import type { ApiErrorCode } from "@/lib/api/error";
import {
  evaluateCapacity,
  DEFAULT_THRESHOLDS,
  type CapacityStatus,
  type AccessOverride,
} from "@/lib/capacity";

/**
 * Check-in service layer.
 *
 * Wraps database function check_in_permit from migration 010. Validating capacity,
 * permit state, and date while creating the check_in record occurs inside one
 * database transaction behind an advisory lock, matching the permit review design in
 * migration 008.
 *
 * The database returns the raw capacity inputs (limit, new occupancy, thresholds,
 * access override); the status band itself is derived here through lib/capacity.ts.
 * That keeps check-in's answer and GET /destinations/{id}/capacity on the single
 * expression of the PRD §6 thresholds rather than two copies that can drift.
 */

export type CheckInSummary = {
  id: string;
  permit_id: string;
  destination_id: string;
  group_size: number;
  operator_id: string;
  checked_in_at: string;
};

/** The raw capacity sub-object check_in_permit returns. */
type CheckInCapacityRaw = {
  maximum_capacity: number | string;
  occupancy: number | string;
  available_threshold: number | string | null;
  near_capacity_threshold: number | string | null;
  restricted_threshold: number | string | null;
  access_status: AccessOverride;
};

/** The client-facing capacity block, computed by evaluateCapacity(). */
export type CheckInCapacitySummary = {
  capacity: number;
  occupancy: number;
  remaining: number;
  percentage: number;
  status: CapacityStatus;
};

export type CheckInSuccessData = {
  check_in: CheckInSummary;
  permit: PermitSummary;
  capacity: CheckInCapacitySummary;
};

export type CheckInRejection = {
  code: ApiErrorCode;
  message: string;
};

export type CheckInResult =
  | { ok: true; data: CheckInSuccessData }
  | { ok: false; rejection: CheckInRejection };

export async function checkIn(qrToken: string): Promise<CheckInResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_in_permit", {
    p_qr_token: qrToken,
  });

  if (error) {
    throw new Error(`checkIn: ${error.message}`);
  }

  const raw = (data ?? {}) as {
    ok?: boolean;
    code?: ApiErrorCode;
    message?: string;
    check_in?: CheckInSummary;
    permit?: PermitSummary;
    capacity?: CheckInCapacityRaw;
  };

  if (raw.ok && raw.check_in && raw.permit && raw.capacity) {
    return {
      ok: true,
      data: {
        check_in: raw.check_in,
        permit: raw.permit,
        capacity: toCapacitySummary(raw.capacity),
      },
    };
  }

  return {
    ok: false,
    rejection: {
      code: raw.code ?? "INVALID_STATE",
      message: raw.message ?? "The database did not return a valid check-in outcome.",
    },
  };
}

/**
 * Feed the raw capacity inputs check_in_permit returns through the shared
 * capacity engine. Numbers may arrive as numeric strings (PostgREST returns
 * Postgres NUMERIC that way), so every value is coerced before evaluateCapacity's
 * finite/non-negative guard sees it. Null thresholds fall back to the documented
 * PRD §6 defaults rather than being passed through as 0.
 */
function toCapacitySummary(raw: CheckInCapacityRaw): CheckInCapacitySummary {
  const num = (value: number | string | null, fallback: number): number => {
    if (value === null || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const result = evaluateCapacity({
    occupancy: num(raw.occupancy, 0),
    capacity: num(raw.maximum_capacity, 0),
    thresholds: {
      available: num(raw.available_threshold, DEFAULT_THRESHOLDS.available),
      nearCapacity: num(raw.near_capacity_threshold, DEFAULT_THRESHOLDS.nearCapacity),
      restricted: num(raw.restricted_threshold, DEFAULT_THRESHOLDS.restricted),
    },
    override: raw.access_status,
  });

  return {
    capacity: result.capacity,
    occupancy: result.occupancy,
    remaining: result.remaining,
    percentage: result.percentage,
    status: result.status,
  };
}
