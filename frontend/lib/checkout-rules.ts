/**
 * Pure, deterministic check-out rule evaluation — no I/O.
 *
 * Source of truth:
 *   docs/PRD.md §11 Check-out workflow
 *   docs/API.md §Check-out
 *
 * Validates (in order):
 *  1. QR token present and non-empty
 *  2. Permit found
 *  3. Permit status is CHECKED_IN (not COMPLETED, not pre-check-in states)
 *  4. Active check-in exists (a check_in row with no matching check_out)
 *  5. No duplicate checkout (check_out row already present for this permit)
 *
 * No capacity check at checkout: removing visitors cannot exceed capacity.
 * No date check: PRD §11 does not require it and checkout of a multi-day
 * permit on a different day is operationally valid.
 */

import type { PermitStatus } from "@/lib/permit-rules";
import type { ApiErrorCode } from "@/lib/api/error";

export type CheckOutRejection = { code: ApiErrorCode; message: string };
export type CheckOutOutcome = { ok: true } | { ok: false; rejection: CheckOutRejection };

export type CheckOutFacts = {
  /** Raw token string scanned from QR. */
  qrToken?: string | null;
  /** Permit row resolved from the token, or null when the token is invalid. */
  permit: {
    id: string;
    destination_id: string;
    visit_date: string;
    group_size: number;
    status: PermitStatus;
  } | null;
  /** True when a check_in row exists for this permit. */
  hasActiveCheckIn: boolean;
  /** True when a check_out row already exists for this permit. */
  alreadyCheckedOut: boolean;
};

function reject(code: ApiErrorCode, message: string): CheckOutOutcome {
  return { ok: false, rejection: { code, message } };
}

export function evaluateCheckOut(facts: CheckOutFacts): CheckOutOutcome {
  if (!facts.qrToken || facts.qrToken.trim() === "") {
    return reject("VALIDATION_ERROR", "A QR token is required.");
  }

  if (!facts.permit) {
    return reject("NOT_FOUND", "Invalid QR token or permit not found.");
  }

  // Duplicate checkout — check this before the status guard so the message is
  // precise: "already checked out" is more useful than "status is COMPLETED".
  if (facts.alreadyCheckedOut || facts.permit.status === "COMPLETED") {
    return reject("INVALID_STATE", "This permit has already been checked out.");
  }

  // Only CHECKED_IN permits can proceed; every other status is wrong.
  if (facts.permit.status !== "CHECKED_IN") {
    return reject(
      "INVALID_STATE",
      `A permit in status ${facts.permit.status} cannot be checked out. ` +
        "The permit must be CHECKED_IN first."
    );
  }

  // Guard against a data inconsistency: status says CHECKED_IN but no row exists.
  if (!facts.hasActiveCheckIn) {
    return reject(
      "INVALID_STATE",
      "No active check-in found for this permit."
    );
  }

  return { ok: true };
}
