import { createClient } from "@/lib/supabase/server";
import type { PermitSummary } from "@/services/permits";
import type { ApiErrorCode } from "@/lib/api/error";

/**
 * Service for operator check-out processing.
 *
 * Wraps the transactional database RPC process_check_out (migration 010).
 * All enforcement — duplicate prevention, status transition, occupancy
 * re-derivation — happens inside the RPC under the same advisory lock used by
 * process_check_in, so a concurrent check-in and check-out for the same
 * destination/date queue rather than race.
 */

export type CheckOutPayload = {
  check_out: {
    id: string;
    permit_id: string;
    destination_id: string;
    group_size: number;
    operator_id: string;
    checked_out_at: string;
  };
  permit: PermitSummary;
  occupancy: {
    previous: number;
    current: number;
    capacity: number | null;
    remaining: number | null;
  };
};

export type CheckOutRejection = { code: ApiErrorCode; message: string };

export type CheckOutWriteResult =
  | { ok: true; data: CheckOutPayload }
  | { ok: false; rejection: CheckOutRejection };

function toCheckOutResult(raw: unknown): CheckOutWriteResult {
  const value = (raw ?? {}) as {
    ok?: boolean;
    check_out?: CheckOutPayload["check_out"];
    permit?: CheckOutPayload["permit"];
    occupancy?: CheckOutPayload["occupancy"];
    code?: ApiErrorCode;
    message?: string;
  };

  if (value.ok && value.check_out && value.permit && value.occupancy) {
    return {
      ok: true,
      data: {
        check_out: value.check_out,
        permit: value.permit,
        occupancy: value.occupancy,
      },
    };
  }

  return {
    ok: false,
    rejection: {
      code: value.code ?? "INVALID_STATE",
      message: value.message ?? "The database did not return a check-out result.",
    },
  };
}

export async function processCheckOut(qrToken: string): Promise<CheckOutWriteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("process_check_out", {
    p_qr_token: qrToken,
  });

  if (error) throw new Error(`processCheckOut: ${error.message}`);
  return toCheckOutResult(data);
}
