/**
 * Permit rules — pure, deterministic, no I/O.
 *
 * Source of truth:
 *   docs/PRD.md §6  capacity status thresholds and department override
 *   docs/PRD.md §8  "Approval requires: valid destination/date, destination
 *                   accepts visitors, group fits remaining capacity, group fits
 *                   remaining daily quota, no blocking restriction."
 *   docs/PRD.md §12 controls, docs/API.md permit state list
 *
 * Why the checks are separated from the routes
 * ------------------------------------------------
 * These rules are the difference between an approved permit and an
 * overbooked destination, so they must be testable without a database and must
 * never be re-implemented at the call site. The caller supplies already-resolved
 * facts; nothing here queries Supabase or reads a clock, which is why `today` is
 * a parameter.
 *
 * Quota consumption
 * ------------------------------------------------
 * docs/PRD.md §8 asks for "group fits remaining daily quota", and
 * daily_quotas.visitors_admitted only moves at check-in (Phase 8). Read alone,
 * that makes the check pass for any group all the way up to Phase 8. So the
 * consuming figure is booked + admitted:
 *
 *   booked  = sum of group_size over this destination's permits for the visit
 *             date still in PENDING or APPROVED — reserved, not yet inside
 *   admitted = visitors_admitted for that date — actually entered
 *
 * The two sets do not overlap: a permit leaves booked when it becomes
 * CHECKED_IN, which is exactly when it starts counting toward admitted.
 * Cancelling or rejecting a permit releases its reservation, which is what makes
 * the cancel path in lib/quota.ts and migration 006 part of capacity control
 * rather than mere bookkeeping.
 */

export type PermitStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "RESTRICTED"
  | "CANCELLED"
  | "EXPIRED"
  | "CHECKED_IN"
  | "COMPLETED";

/** Statuses whose group_size reserves a place against capacity and quota. */
export const RESERVING_STATUSES: readonly PermitStatus[] = ["PENDING", "APPROVED"];

export type Rejection = { code: PermitRuleCode; message: string };
export type RuleOutcome = { ok: true } | { ok: false; rejection: Rejection };

export type PermitRuleCode =
  | "DATE_IN_PAST"
  | "GROUP_SIZE_INVALID"
  | "DESTINATION_CLOSED"
  | "DESTINATION_RESTRICTED"
  | "CAPACITY_EXCEEDED"
  | "QUOTA_EXCEEDED"
  | "NOT_CONFIGURED"
  | "INVALID_STATE";

export type EligibilityFacts = {
  /** ISO date the permit is for. */
  visitDate: string;
  /** Today's ISO date, supplied by the caller rather than read here. */
  today: string;
  groupSize: number;
  /** destinations.access_status. */
  accessStatus: "OPEN" | "RESTRICTED" | "CLOSED";
  /** capacity_configurations.maximum_capacity, or null when unset. */
  capacity: number | null;
  /** Occupancy derived from active check-ins (PRD §7). */
  occupancy: number;
  /** daily_quotas.quota for the visit date, or null when unset. */
  quota: number | null;
  /** Sum of group_size over PENDING/APPROVED permits for that visit date. */
  booked: number;
  /** daily_quotas.visitors_admitted for that date. */
  admitted: number;
};

/**
 * Unconfigured limits block rather than allow. A destination with no capacity
 * configuration or a day with no quota row has not declared that it may admit
 * anyone, and the same fail-closed rule already governs the capacity engine
 * (capacity 0 -> CLOSED).
 */
export function evaluatePermitEligibility(facts: EligibilityFacts): RuleOutcome {
  if (!Number.isInteger(facts.groupSize) || facts.groupSize < 1) {
    return reject("GROUP_SIZE_INVALID", "A permit must cover at least one visitor.");
  }

  if (facts.visitDate < facts.today) {
    return reject(
      "DATE_IN_PAST",
      `Visit date ${facts.visitDate} is in the past.`
    );
  }

  if (facts.accessStatus === "CLOSED") {
    return reject("DESTINATION_CLOSED", "This destination is closed.");
  }
  if (facts.accessStatus === "RESTRICTED") {
    return reject(
      "DESTINATION_RESTRICTED",
      "This destination is currently restricted and not accepting new permits."
    );
  }

  if (facts.capacity === null) {
    return reject(
      "NOT_CONFIGURED",
      "This destination has no capacity configuration, so permits cannot be assessed."
    );
  }

  const inside = facts.occupancy;
  if (inside + facts.groupSize > facts.capacity) {
    return reject(
      "CAPACITY_EXCEEDED",
      `The requested group of ${facts.groupSize} exceeds the remaining capacity of ${Math.max(0, facts.capacity - inside)}.`
    );
  }

  if (facts.quota === null) {
    return reject(
      "NOT_CONFIGURED",
      "No daily quota is set for this date, so permits cannot be assessed."
    );
  }

  const consumed = facts.booked + facts.admitted;
  if (consumed + facts.groupSize > facts.quota) {
    return reject(
      "QUOTA_EXCEEDED",
      `The requested group of ${facts.groupSize} exceeds the remaining daily quota of ${Math.max(0, facts.quota - consumed)}.`
    );
  }

  return { ok: true };
}

/**
 * Re-checking an existing request at review time.
 *
 * Approval must satisfy the same destination, capacity and quota conditions as the
 * request did, but without adding a group: the permit being reviewed is already
 * counted inside `booked`. Expressing this as "approve a group of 1" would test
 * the wrong quantity and quietly fail a permit that exactly filled the day.
 */
export type ApprovalFacts = {
  accessStatus: "OPEN" | "RESTRICTED" | "CLOSED";
  capacity: number | null;
  occupancy: number;
  quota: number | null;
  booked: number;
  admitted: number;
};

export function evaluateApproval(facts: ApprovalFacts): RuleOutcome {
  if (facts.accessStatus === "CLOSED") {
    return reject("DESTINATION_CLOSED", "This destination is closed.");
  }
  if (facts.accessStatus === "RESTRICTED") {
    return reject(
      "DESTINATION_RESTRICTED",
      "This destination is currently restricted and not accepting permits."
    );
  }

  if (facts.capacity === null) {
    return reject(
      "NOT_CONFIGURED",
      "This destination has no capacity configuration, so permits cannot be approved."
    );
  }
  if (facts.occupancy > facts.capacity) {
    return reject(
      "CAPACITY_EXCEEDED",
      `The destination is already holding ${facts.occupancy} of ${facts.capacity} visitors.`
    );
  }

  if (facts.quota === null) {
    return reject(
      "NOT_CONFIGURED",
      "No daily quota is set for this date, so permits cannot be approved."
    );
  }
  if (facts.booked + facts.admitted > facts.quota) {
    return reject(
      "QUOTA_EXCEEDED",
      `The day is already committed to ${facts.booked + facts.admitted} of ${facts.quota} quota.`
    );
  }

  return { ok: true };
}

/**
 * PRD §8 state machine. Terminal states accept nothing. CHECKED_IN and COMPLETED
 * are reached only by the Phase 8 and 9 flows, never by an approval call.
 */
const TRANSITIONS: Record<PermitStatus, readonly PermitStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "RESTRICTED", "CANCELLED", "EXPIRED"],
  APPROVED: ["RESTRICTED", "CANCELLED", "EXPIRED", "CHECKED_IN"],
  RESTRICTED: ["APPROVED", "CANCELLED", "EXPIRED", "CHECKED_IN"],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  CHECKED_IN: ["COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: PermitStatus, to: PermitStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function invalidState(from: PermitStatus, to: PermitStatus): Rejection {
  return {
    code: "INVALID_STATE",
    message: `A permit in status ${from} cannot become ${to}.`,
  };
}

function reject(code: PermitRuleCode, message: string): RuleOutcome {
  return { ok: false, rejection: { code, message } };
}
