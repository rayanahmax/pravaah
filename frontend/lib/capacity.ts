/**
 * Capacity engine — pure, deterministic, and free of any I/O.
 *
 * Source of truth:
 *   docs/PRD.md §6  status thresholds + department override
 *   docs/PRD.md §7  occupancy is derived from active check-ins
 *   docs/DATABASE.md thresholds live on capacity_configurations
 *
 * This module is the only place the threshold bands are expressed. It must stay
 * free of Supabase, Next.js, and Date access so it is unit testable, and its
 * output is advisory: it never grants or denies access by itself (AGENTS.md
 * rules 6 and 7 — the server that calls it is the enforcement point).
 */

export type CapacityStatus =
  | "AVAILABLE"
  | "NEAR_CAPACITY"
  | "RESTRICTED"
  | "CLOSED";

/** destinations.access_status — a department override beats the computed status. */
export type AccessOverride = "OPEN" | "RESTRICTED" | "CLOSED";

export type CapacityThresholds = {
  /** Upper bound, inclusive, of the AVAILABLE band. */
  available: number;
  /** Upper bound, inclusive, of the NEAR_CAPACITY band. */
  nearCapacity: number;
  /** Occupancy percentage at or above which the destination is CLOSED. */
  restricted: number;
};

export const DEFAULT_THRESHOLDS: CapacityThresholds = {
  available: 70,
  nearCapacity: 90,
  restricted: 100,
};

export type CapacityInput = {
  occupancy: number;
  capacity: number;
  thresholds?: CapacityThresholds;
  /** destinations.access_status for the destination. */
  override?: AccessOverride;
};

export type CapacityResult = {
  capacity: number;
  occupancy: number;
  /** Never negative: an over-capacity destination has no remaining places. */
  remaining: number;
  /** Unrounded percentage, kept for comparisons in callers that need it. */
  percentageExact: number;
  /** Reported percentage, rounded to one decimal (PRD §16 shows 97.5%). */
  percentage: number;
  /** Status computed from occupancy against capacity. */
  computedStatus: CapacityStatus;
  /** computedStatus after the department override is applied. */
  status: CapacityStatus;
  /** True when `override` changed the computed answer. */
  overridden: boolean;
};

/**
 * Rejects nonsense before it reaches the band logic, so a bad row cannot be
 * silently coerced into an "everything is fine" status.
 */
export function assertCapacityInput(input: {
  occupancy: number;
  capacity: number;
}): void {
  for (const [name, value] of [
    ["occupancy", input.occupancy],
    ["capacity", input.capacity],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`capacity engine: ${name} must be a finite number`);
    }
    if (value < 0) {
      throw new RangeError(`capacity engine: ${name} must not be negative`);
    }
  }
}

/**
 * PRD §6 bands:
 *   0 .. available            -> AVAILABLE
 *   available .. nearCapacity -> NEAR_CAPACITY   (strictly above the lower bound)
 *   nearCapacity .. restricted -> RESTRICTED
 *   >= restricted              -> CLOSED
 *
 * Comparisons use the exact percentage. Rounding only happens in the reported
 * figure, so a destination at 70.04% is NEAR_CAPACITY and merely *displays* 70%.
 */
export function computeStatus(
  percentageExact: number,
  thresholds: CapacityThresholds
): CapacityStatus {
  if (percentageExact >= thresholds.restricted) return "CLOSED";
  if (percentageExact > thresholds.nearCapacity) return "RESTRICTED";
  if (percentageExact > thresholds.available) return "NEAR_CAPACITY";
  return "AVAILABLE";
}

/**
 * A department override always wins (PRD §6). RESTRICTED and CLOSED force the
 * status; OPEN means "no override", which falls back to the computed value.
 * The forced status is at least as strict as the computed one: an explicit
 * RESTRICTED never relaxes a computed CLOSED back down.
 */
export function applyOverride(
  computed: CapacityStatus,
  override: AccessOverride | undefined
): { status: CapacityStatus; overridden: boolean } {
  if (!override || override === "OPEN") {
    return { status: computed, overridden: false };
  }

  const forced: CapacityStatus = override === "CLOSED" ? "CLOSED" : "RESTRICTED";
  const rank: Record<CapacityStatus, number> = {
    AVAILABLE: 0,
    NEAR_CAPACITY: 1,
    RESTRICTED: 2,
    CLOSED: 3,
  };

  const stricter = rank[forced] > rank[computed] ? forced : computed;
  return { status: stricter, overridden: stricter !== computed };
}

export function evaluateCapacity(input: CapacityInput): CapacityResult {
  assertCapacityInput(input);
  const { occupancy, capacity, override } = input;
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;

  // capacity 0 means the destination admits nobody; treat it as fully occupied
  // rather than dividing by zero.
  const percentageExact = capacity === 0 ? 100 : (occupancy / capacity) * 100;
  const computedStatus = computeStatus(percentageExact, thresholds);
  const { status, overridden } = applyOverride(computedStatus, override);

  return {
    capacity,
    occupancy,
    remaining: Math.max(0, capacity - occupancy),
    percentageExact,
    percentage: Math.round(percentageExact * 10) / 10,
    computedStatus,
    status,
    overridden,
  };
}

/**
 * Sum active check-ins minus check-outs for a destination (PRD §7). Pure so the
 * pairing rules are testable: a permit is active when it has a check-in with no
 * matching check-out for the same permit.
 */
export function deriveOccupancy(
  checkIns: ReadonlyArray<{ permit_id: string; group_size: number }>,
  checkOuts: ReadonlyArray<{ permit_id: string }>
): number {
  const departed = new Set(checkOuts.map((c) => c.permit_id));
  return checkIns.reduce(
    (total, entry) => (departed.has(entry.permit_id) ? total : total + entry.group_size),
    0
  );
}
