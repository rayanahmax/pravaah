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

const CAPACITY_COLUMNS =
  "id, destination_id, maximum_capacity, available_threshold, near_capacity_threshold, restricted_threshold, created_at, updated_at";

function threshold(value: string | number | null, fallback: number): number {
  const n = toNumber(value);
  return n === null || n < 0 ? fallback : n;
}

function normaliseCapacity(row: RawCapacityRow): CapacityConfigurationRow {
  return {
    ...row,
    available_threshold: threshold(row.available_threshold, DEFAULT_THRESHOLDS.available),
    near_capacity_threshold: threshold(row.near_capacity_threshold, DEFAULT_THRESHOLDS.nearCapacity),
    restricted_threshold: threshold(row.restricted_threshold, DEFAULT_THRESHOLDS.restricted),
  };
}

/**
 * The destination's capacity configuration, or null when none exists.
 *
 * Migration 004 adds UNIQUE (destination_id), so new writes cannot produce more
 * than one row. The explicit newest-row selection stays as a safety net for a
 * database that duplicated before that constraint existed: maybeSingle() raises
 * PGRST116 when handed several rows, which turned into a 500 on a public read.
 */
export async function findCapacityConfiguration(
  destinationId: string
): Promise<CapacityConfigurationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capacity_configurations")
    .select(CAPACITY_COLUMNS)
    .eq("destination_id", destinationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RawCapacityRow>();

  if (error) throw new Error(`findCapacityConfiguration: ${error.message}`);
  return data ? normaliseCapacity(data) : null;
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
 * A single INSERT ... ON CONFLICT (destination_id) DO UPDATE, made possible by
 * the unique index in migration 004. This replaces the earlier read-then-write,
 * which could create a second configuration row when two operators saved at the
 * same moment.
 *
 * Only maximum_capacity is in the payload, so an existing row keeps its
 * configured thresholds on update, and a new row takes the schema defaults. The
 * updated_at trigger maintains the timestamp.
 */
export async function setCapacity(
  destinationId: string,
  capacity: number
): Promise<CapacityConfigurationRow> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("capacity_configurations")
    .upsert(
      { destination_id: destinationId, maximum_capacity: capacity },
      { onConflict: "destination_id" }
    )
    .select(CAPACITY_COLUMNS)
    .single<RawCapacityRow>();

  if (error) throw new Error(`setCapacity: ${error.message}`);

  return normaliseCapacity(data);
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
