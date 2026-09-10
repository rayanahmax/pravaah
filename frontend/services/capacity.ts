import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_THRESHOLDS,
  deriveOccupancy,
  evaluateCapacity,
  type CapacityResult,
  type CapacityThresholds,
} from "@/lib/capacity";
import { toNumber } from "@/services/destinations";
import type {
  CapacityConfigurationRow,
  CheckInRow,
  CheckOutRow,
  DestinationRow,
} from "@/types/rows";

/**
 * Capacity and occupancy reads.
 *
 * Occupancy is derived from check-in/check-out events, per docs/PRD.md §7; the
 * frontend never supplies it, and no caller can push a number in here. This
 * module only reads and computes — enforcement stays with whoever calls it, and
 * writes are gated by row level security on the operator policies.
 */

type RawCapacityRow = Omit<
  CapacityConfigurationRow,
  "available_threshold" | "near_capacity_threshold" | "restricted_threshold"
> & {
  available_threshold: string | number | null;
  near_capacity_threshold: string | number | null;
  restricted_threshold: string | number | null;
};

function threshold(value: string | number | null, fallback: number): number {
  const n = toNumber(value);
  return n === null || n < 0 ? fallback : n;
}

/**
 * The most recent configuration for a destination, or null when none exists.
 *
 * Note: capacity_configurations has no unique constraint on destination_id
 * (docs/DATABASE.md does not specify one), so a destination could in principle
 * hold several rows. Taking the newest is the documented-shaped behaviour we can
 * implement without inventing a schema change; a uniqueness migration should
 * accompany Phase 5.
 */
export async function findCapacityConfiguration(
  destinationId: string
): Promise<CapacityConfigurationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capacity_configurations")
    .select(
      "id, destination_id, maximum_capacity, available_threshold, near_capacity_threshold, restricted_threshold, created_at, updated_at"
    )
    .eq("destination_id", destinationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RawCapacityRow>();

  if (error) throw new Error(`findCapacityConfiguration: ${error.message}`);
  if (!data) return null;

  return {
    ...data,
    available_threshold: threshold(data.available_threshold, DEFAULT_THRESHOLDS.available),
    near_capacity_threshold: threshold(data.near_capacity_threshold, DEFAULT_THRESHOLDS.nearCapacity),
    restricted_threshold: threshold(data.restricted_threshold, DEFAULT_THRESHOLDS.restricted),
  };
}

/**
 * Current occupancy = group sizes of check-ins with no matching check-out.
 *
 * Read as two queries rather than one join because the REST client cannot
 * aggregate across check_outs. A SQL function or the transactional counter
 * mentioned in docs/DATABASE.md is the right upgrade when write paths land.
 */
export async function getOccupancy(destinationId: string): Promise<number> {
  const supabase = await createClient();

  const [checkInsResult, checkOutsResult] = await Promise.all([
    supabase
      .from("check_ins")
      .select("id, permit_id, destination_id, group_size")
      .eq("destination_id", destinationId),
    supabase
      .from("check_outs")
      .select("id, permit_id, destination_id, group_size")
      .eq("destination_id", destinationId),
  ]);

  if (checkInsResult.error) throw new Error(`getOccupancy: ${checkInsResult.error.message}`);
  if (checkOutsResult.error) throw new Error(`getOccupancy: ${checkOutsResult.error.message}`);

  return deriveOccupancy(
    (checkInsResult.data as CheckInRow[] | null) ?? [],
    (checkOutsResult.data as CheckOutRow[] | null) ?? []
  );
}

/**
 * Full capacity view for one destination: stored configuration, derived
 * occupancy, and the department access override from destinations.access_status.
 *
 * A destination with no capacity_configurations row is treated as admitting
 * nobody (capacity 0 -> CLOSED). Failing closed is the safe default for an
 * access-control surface; guessing a capacity would be inventing a requirement.
 */
export async function buildCapacityView(
  destination: DestinationRow
): Promise<CapacityResult> {
  const [configuration, occupancy] = await Promise.all([
    findCapacityConfiguration(destination.id),
    getOccupancy(destination.id),
  ]);

  const thresholds: CapacityThresholds = configuration
    ? {
        available: Number(configuration.available_threshold ?? DEFAULT_THRESHOLDS.available),
        nearCapacity: Number(configuration.near_capacity_threshold ?? DEFAULT_THRESHOLDS.nearCapacity),
        restricted: Number(configuration.restricted_threshold ?? DEFAULT_THRESHOLDS.restricted),
      }
    : DEFAULT_THRESHOLDS;

  return evaluateCapacity({
    occupancy,
    capacity: configuration?.maximum_capacity ?? 0,
    thresholds,
    override: destination.access_status,
  });
}

/**
 * Operator capacity write.
 *
 * Updates the newest configuration row, or creates one. Because there is no
 * unique constraint to upsert against this is a read-then-write pair, which is
 * acceptable for a single operator editing a number but is NOT safe against two
 * operators editing at once. The concurrency guarantee Phase 8 needs comes from
 * a unique index plus a transaction, which is a schema change and belongs with
 * the check-in work.
 */
export async function setCapacity(
  destinationId: string,
  capacity: number
): Promise<CapacityConfigurationRow> {
  const supabase = await createClient();
  const existing = await findCapacityConfiguration(destinationId);
  const values = { maximum_capacity: capacity, destination_id: destinationId };
  const columns =
    "id, destination_id, maximum_capacity, available_threshold, near_capacity_threshold, restricted_threshold, created_at, updated_at";

  const { data, error } = existing
    ? await supabase
        .from("capacity_configurations")
        .update(values)
        .eq("id", existing.id)
        .select(columns)
        .single<RawCapacityRow>()
    : await supabase
        .from("capacity_configurations")
        .insert(values)
        .select(columns)
        .single<RawCapacityRow>();

  if (error) throw new Error(`setCapacity: ${error.message}`);

  return {
    ...data,
    available_threshold: threshold(data.available_threshold, DEFAULT_THRESHOLDS.available),
    near_capacity_threshold: threshold(data.near_capacity_threshold, DEFAULT_THRESHOLDS.nearCapacity),
    restricted_threshold: threshold(data.restricted_threshold, DEFAULT_THRESHOLDS.restricted),
  };
}

/**
 * The exact shape docs/API.md specifies for the capacity block. The engine keeps
 * extra fields (percentageExact, computedStatus, overridden) for internal
 * decisions; they stay out of responses so the contract is not quietly widened.
 */
export function toCapacityDto(result: CapacityResult) {
  return {
    capacity: result.capacity,
    occupancy: result.occupancy,
    remaining: result.remaining,
    percentage: result.percentage,
    status: result.status,
  };
}
