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

/** Columns every alert read returns. Kept in one place so a new field cannot be
 *  selected on one path and missed on another. */
const ALERT_COLUMNS =
  "id, destination_id, title, message, severity, active, starts_at, ends_at, created_by, created_at, updated_at";

/**
 * Every alert for a destination, active or not.
 *
 * The management view needs this rather than `listActiveAlerts`: an operator
 * deactivating, reviewing or about to schedule an alert has to be able to see the
 * rows that are deliberately NOT displaying, or the console shows a blank list and
 * implies nothing is raised when several are merely switched off.
 *
 * Reads with the caller's own client, so the operator-only RLS policy is what
 * actually restricts this — a tourist asking for the same list gets the active
 * subset the public policy allows, never this.
 */
export async function listAllForDestination(destinationId: string): Promise<AlertRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("destination_id", destinationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listAllForDestination: ${error.message}`);
  return (data as AlertRow[] | null) ?? [];
}

/** One alert by id, or null when it does not exist or the caller may not read it. */
export async function findAlert(alertId: string): Promise<AlertRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("id", alertId)
    .maybeSingle<AlertRow>();

  if (error) throw new Error(`findAlert: ${error.message}`);
  return data ?? null;
}

export type NewAlertInput = {
  title: string;
  message: string;
  severity: AlertRow["severity"];
  starts_at: string | null;
  ends_at: string | null;
};

/**
 * Raise an alert. `operatorId` is the authenticated profile's id, passed in by the
 * route from `requireOperator()` — never read from the body, so a caller cannot
 * attribute a notice to someone else (AGENTS rule 6).
 *
 * `active` is not part of the payload: a newly created alert is live by definition,
 * and the column default already says so. Leaving it out means the browser has no
 * path to publish a row that starts off, or to set any column the operator did not
 * intend to.
 *
 * Returns the row as stored, re-read after the insert, so the caller sees the
 * database's values (id, created_at, the trigger-maintained updated_at) rather than
 * an echo of what was sent.
 */
export async function createAlert(
  destinationId: string,
  input: NewAlertInput,
  operatorId: string
): Promise<AlertRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .insert({
      destination_id: destinationId,
      title: input.title,
      message: input.message,
      severity: input.severity,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      created_by: operatorId,
    })
    .select(ALERT_COLUMNS)
    .single<AlertRow>();

  if (error) throw new Error(`createAlert: ${error.message}`);
  return data;
}

/**
 * Activate or deactivate an alert. This is the only permitted mutation: PRD §16
 * gives operators create, activate and deactivate, and a published safety notice
 * deliberately cannot be rewritten in place.
 *
 * Reports whether a row actually changed rather than trusting the status code — a
 * PATCH that matches nothing under RLS can still look like success.
 */
export async function setAlertActive(
  alertId: string,
  active: boolean
): Promise<AlertRow | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ active })
    .eq("id", alertId);

  if (error) throw new Error(`setAlertActive: ${error.message}`);

  // Re-read: a 204 from PostgREST means either "applied" or "matched no visible
  // row", and only the second read can tell them apart.
  return findAlert(alertId);
}
