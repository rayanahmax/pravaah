/**
 * Daily quota engine — pure, deterministic, and free of any I/O.
 *
 * Source of truth:
 *   docs/PRD.md §6   "Capacity and daily quota are separate."
 *   docs/DATABASE.md daily_quotas (destination_id, quota_date) unique
 *   docs/API.md      GET/PATCH quota endpoints
 *
 * Capacity answers "how many may be inside right now"; quota answers "how many
 * may enter today". They are deliberately not combined here, and nothing in this
 * module reads a database, a clock, or a request, so the Phase 6 permit rules can
 * call it the same way the capacity engine is called.
 */

export type QuotaState = {
  /** Declared admissions for the day, or null when the day is not configured. */
  quota: number | null;
  /** Visitors already admitted. Null only when no quota row exists at all. */
  visitorsAdmitted: number | null;
  /** Never negative; 0 when unconfigured or exhausted. */
  remaining: number;
};

function assertCount(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new TypeError(`quota: ${name} must be a whole number`);
  }
  if (value < 0) {
    throw new RangeError(`quota: ${name} must not be negative`);
  }
}

/**
 * An unconfigured day is not the same as a day with quota 0. The first has never
 * been declared; the second has been deliberately closed. Both admit nobody,
 * which is why `remaining` is 0 either way — the safe answer for an access
 * decision is the same even though the stored state differs.
 */
export function evaluateQuota(input: {
  quota: number | null;
  visitorsAdmitted: number | null;
}): QuotaState {
  if (input.quota === null) {
    return { quota: null, visitorsAdmitted: null, remaining: 0 };
  }

  assertCount(input.quota, "quota");
  // A nullable column with a default of 0: absent means nobody admitted yet.
  const admitted = input.visitorsAdmitted ?? 0;
  assertCount(admitted, "visitors_admitted");

  return {
    quota: input.quota,
    visitorsAdmitted: admitted,
    // Clamped: a row that somehow has more admitted than quota (only possible
    // before migration 004's CHECK existed) must not yield a negative remainder
    // that a caller could compare against.
    remaining: Math.max(0, input.quota - admitted),
  };
}

/**
 * Whether a group of `groupSize` fits in the day's remaining quota.
 *
 * Phase 6 calls this; nothing here knows about permits. A group must be at least
 * one person, and an unconfigured day admits nobody.
 */
export function canAdmitGroup(state: QuotaState, groupSize: number): boolean {
  assertCount(groupSize, "group_size");
  if (groupSize < 1) return false;
  if (state.quota === null) return false;
  return groupSize <= state.remaining;
}

/**
 * Whether lowering a quota to `proposedQuota` is consistent with visitors already
 * admitted.
 *
 * The database CHECK from migration 004 enforces this too; the API asks first so
 * the operator gets a readable error instead of a constraint violation. There is
 * deliberately no override: raise the quota, then admit more people.
 */
export function isQuotaReductionValid(
  proposedQuota: number,
  visitorsAdmitted: number | null
): boolean {
  assertCount(proposedQuota, "quota");
  const admitted = visitorsAdmitted ?? 0;
  assertCount(admitted, "visitors_admitted");
  return proposedQuota >= admitted;
}
