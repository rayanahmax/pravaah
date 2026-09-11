import { createClient } from "@/lib/supabase/server";
import { buildCapacityView } from "@/services/capacity";
import type { CapacityResult } from "@/lib/capacity";
import { readQuota, type QuotaView } from "@/services/quotas";
import { listActiveAlerts } from "@/services/alerts";
import { todayIsoDate } from "@/lib/date";
import type { AlertRow, DestinationRow } from "@/types/rows";

/**
 * Aggregated read for the department dashboard (docs/API.md "Dashboard").
 *
 * One place assembles the occupancy, capacity, quota, pending-permit and recent
 * checkpoint figures the overview and control-room screens share, so the two
 * pages cannot drift into disagreeing numbers. Everything here is read as the
 * signed-in operator through row level security; the underlying capacity engine
 * and quota evaluation remain the single source of truth for every derived
 * value — nothing is recomputed loosely at the edge.
 *
 * This is deliberately read-only. Writes stay on their own server-enforced
 * endpoints; an aggregate display must never become a second, weaker write path.
 */

export type CheckpointActivity = {
  permitId: string;
  groupSize: number;
  /** When the visitor entered (check-in) or left (check-out). */
  at: string;
  kind: "in" | "out";
};

export type DepartmentSnapshot = {
  capacity: CapacityResult;
  quota: QuotaView;
  pendingCount: number;
  checkedInCount: number;
  activity: CheckpointActivity[];
  alerts: AlertRow[];
};

const ACTIVITY_LIMIT = 8;

/**
 * The most recent check-in and check-out events for a destination, newest first.
 *
 * Read as two flat queries and merged in memory rather than a REST embed: the
 * two event tables are independent, and this mirrors how getOccupancy already
 * reads them, so occupancy and the activity feed cannot disagree about what a
 * "current" event is.
 */
export async function listRecentCheckpointActivity(
  destinationId: string,
  limit = ACTIVITY_LIMIT
): Promise<CheckpointActivity[]> {
  const supabase = await createClient();

  // check_ins/check_outs carry their own event timestamps (checked_in_at /
  // checked_out_at); neither table has a generic created_at, so ordering is on
  // the event column, matching what occupancy derivation already treats as an event.
  const [checkIns, checkOuts] = await Promise.all([
    supabase
      .from("check_ins")
      .select("permit_id, group_size, checked_in_at")
      .eq("destination_id", destinationId)
      .order("checked_in_at", { ascending: false })
      .limit(limit),
    supabase
      .from("check_outs")
      .select("permit_id, group_size, checked_out_at")
      .eq("destination_id", destinationId)
      .order("checked_out_at", { ascending: false })
      .limit(limit),
  ]);

  if (checkIns.error) throw new Error(`listRecentCheckpointActivity: ${checkIns.error.message}`);
  if (checkOuts.error) throw new Error(`listRecentCheckpointActivity: ${checkOuts.error.message}`);

  const merged: CheckpointActivity[] = [
    ...((checkIns.data as { permit_id: string; group_size: number; checked_in_at: string }[] | null) ??
      []).map((row) => ({
        permitId: row.permit_id,
        groupSize: row.group_size,
        at: row.checked_in_at,
        kind: "in" as const,
      })),
    ...((checkOuts.data as { permit_id: string; group_size: number; checked_out_at: string }[] | null) ??
      []).map((row) => ({
        permitId: row.permit_id,
        groupSize: row.group_size,
        at: row.checked_out_at,
        kind: "out" as const,
      })),
  ];

  return merged.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

/** Count permits in one status for a destination without pulling their rows. */
async function countPermitsByStatus(
  destinationId: string,
  status: "PENDING" | "CHECKED_IN"
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("permits")
    .select("id", { count: "exact", head: true })
    .eq("destination_id", destinationId)
    .eq("status", status);

  if (error) throw new Error(`countPermitsByStatus: ${error.message}`);
  return count ?? 0;
}

/** The full dashboard aggregate for one destination and the current day. */
export async function getDepartmentSnapshot(
  destination: DestinationRow,
  date: string = todayIsoDate()
): Promise<DepartmentSnapshot> {
  const [capacity, quota, pendingCount, checkedInCount, activity, alerts] = await Promise.all([
    buildCapacityView(destination),
    readQuota(destination.id, date),
    countPermitsByStatus(destination.id, "PENDING"),
    countPermitsByStatus(destination.id, "CHECKED_IN"),
    listRecentCheckpointActivity(destination.id),
    listActiveAlerts(destination.id),
  ]);

  return { capacity, quota, pendingCount, checkedInCount, activity, alerts };
}
