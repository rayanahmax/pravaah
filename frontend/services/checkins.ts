import { createClient } from "@/lib/supabase/server";
import type { PermitSummary } from "@/services/permits";
import type { ApiErrorCode } from "@/lib/api/error";

/**
 * Check-in service layer.
 *
 * Wraps database function check_in_permit from migration 010. Validating capacity,
 * permit state, and date while creating the check_in record occurs inside one
 * database transaction behind an advisory lock, matching the permit review design in
 * migration 008.
 */

export type CheckInSummary = {
  id: string;
  permit_id: string;
  destination_id: string;
  group_size: number;
  operator_id: string;
  checked_in_at: string;
};

export type CheckInCapacitySummary = {
  capacity: number;
  occupancy: number;
  remaining: number;
  percentage: number;
  status: string;
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
    capacity?: CheckInCapacitySummary;
  };

  if (raw.ok && raw.check_in && raw.permit && raw.capacity) {
    return {
      ok: true,
      data: {
        check_in: raw.check_in,
        permit: raw.permit,
        capacity: raw.capacity,
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
