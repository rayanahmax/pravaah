import { createClient } from "@/lib/supabase/server";
import type { AlertRow } from "@/types/rows";

/**
 * Alerts (PRD §16). Read side only; the create/deactivate endpoints are Phase 16.
 *
 * "Active" here means the flag is on and, when a window is set, the given instant
 * falls inside it. The instant is passed in rather than read from a clock inside
 * this module so the caller controls testability.
 */
export async function listActiveAlerts(
  destinationId: string,
  now: Date = new Date()
): Promise<AlertRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, destination_id, title, message, severity, active, starts_at, ends_at, created_at"
    )
    .eq("destination_id", destinationId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listActiveAlerts: ${error.message}`);

  const timestamp = now.getTime();
  return ((data as AlertRow[] | null) ?? []).filter((alert) => {
    const startsAt = alert.starts_at ? Date.parse(alert.starts_at) : null;
    const endsAt = alert.ends_at ? Date.parse(alert.ends_at) : null;
    if (startsAt !== null && timestamp < startsAt) return false;
    if (endsAt !== null && timestamp > endsAt) return false;
    return true;
  });
}
