/**
 * Check-in rules — pure, deterministic, no I/O.
 *
 * Source of truth:
 *   docs/PRD.md §10 Check-in specification
 *   docs/API.md     POST /api/v1/checkins
 *
 * Validates:
 *   1. Token & permit lookup (handled at service/RPC level)
 *   2. Permit state (must be APPROVED)
 *   3. Duplicate state (no active check-in / status not CHECKED_IN)
 *   4. Date & destination (visit date is today, destination not CLOSED/RESTRICTED)
 *   5. Capacity headroom (occupancy + group_size <= maximum_capacity)
 */

import type { PermitStatus } from "@/lib/permit-rules";
import type { ApiErrorCode } from "@/lib/api/error";

export type CheckInRejection = { code: ApiErrorCode; message: string };
export type CheckInRuleOutcome = { ok: true } | { ok: false; rejection: CheckInRejection };

export type CheckInFacts = {
  /** The permit's current status. */
  permitStatus: PermitStatus;
  /** ISO visit date of the permit (e.g. "2026-09-11"). */
  visitDate: string;
  /** Today's ISO date. */
  today: string;
  /** Destination access_status. */
  accessStatus: "OPEN" | "RESTRICTED" | "CLOSED";
  /** Destination maximum capacity, or null if unconfigured. */
  capacity: number | null;
  /** Current derived occupancy before check-in. */
  occupancy: number;
  /** Group size for this permit. */
  groupSize: number;
  /** True if a check-in record already exists for this permit. */
  alreadyCheckedIn?: boolean;
};

export function evaluateCheckIn(facts: CheckInFacts): CheckInRuleOutcome {
  if (facts.alreadyCheckedIn || facts.permitStatus === "CHECKED_IN") {
    return reject("CONFLICT", "This permit has already been checked in.");
  }

  if (facts.permitStatus !== "APPROVED") {
    return reject(
      "INVALID_STATE",
      `A permit in status ${facts.permitStatus} cannot be checked in.`
    );
  }

  if (facts.visitDate < facts.today) {
    return reject(
      "DATE_IN_PAST",
      `Permit visit date ${facts.visitDate} has passed.`
    );
  }

  if (facts.visitDate > facts.today) {
    return reject(
      "INVALID_STATE",
      `Permit is valid for ${facts.visitDate}, not today.`
    );
  }

  if (facts.accessStatus === "CLOSED") {
    return reject("DESTINATION_CLOSED", "This destination is closed.");
  }

  if (facts.accessStatus === "RESTRICTED") {
    return reject(
      "DESTINATION_RESTRICTED",
      "This destination is currently restricted and not accepting check-ins."
    );
  }

  if (facts.capacity === null) {
    return reject(
      "NOT_CONFIGURED",
      "This destination has no capacity configuration, so check-in cannot be processed."
    );
  }

  if (facts.occupancy + facts.groupSize > facts.capacity) {
    return reject(
      "CAPACITY_EXCEEDED",
      `Checking in this group of ${facts.groupSize} would exceed the capacity of ${facts.capacity} while ${facts.occupancy} are inside.`
    );
  }

  return { ok: true };
}

function reject(code: ApiErrorCode, message: string): CheckInRuleOutcome {
  return { ok: false, rejection: { code, message } };
}
