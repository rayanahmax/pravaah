/**
 * Date helpers.
 *
 * Deliberately tiny and explicit: quota rows are keyed by a plain DATE, so the
 * only thing that matters is which calendar day the server considers "today".
 */

/**
 * Today's date as YYYY-MM-DD in the server's local time zone.
 *
 * This is correct while the only deployment is the field office machine in
 * Asia/Kolkata, but it is not destination-aware: once destinations carry their
 * own time zone this must derive the day from the destination, not the server.
 * Tracked as a known simplification, not an accident.
 */
export function todayIsoDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(now);
}
