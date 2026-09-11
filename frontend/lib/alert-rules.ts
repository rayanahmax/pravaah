/**
 * Pure alert lifecycle rules (PRD §16, Phase 16).
 *
 * No I/O and no clock read inside the rules: `now` arrives as an argument, the
 * same convention lib/capacity.ts and lib/quota.ts follow, which is what lets the
 * expiry behaviour be tested against fixed instants instead of the wall clock.
 *
 * Why this exists separately from the RLS policies and the SQL CHECK:
 *  - The database decides what may be STORED. Migration 016 makes an inverted
 *    window (ends_at before starts_at) unrepresentable.
 *  - This module decides what an already-stored row MEANS right now, which is a
 *    read-side question the schema cannot answer because it depends on the instant
 *    of reading.
 *  - RLS decides what a caller may SEE. Public can read active rows; operators can
 *    read all of them, including ones that are scheduled or have expired.
 *
 * Alerts are informational. Nothing here gates entry: `destinations.access_status`
 * and the capacity engine remain the only authority over whether a visitor may
 * arrive (AGENTS rules 6-7).
 */

import type { AlertRow } from "@/types/rows";

/**
 * Alert severities in escalating order (PRD §16; widened by migration 015).
 *
 * Owned here rather than in a labels module because it is domain data: the
 * database CHECK, the request validator and the console badges all have to agree
 * with it, and a presentation module is the wrong thing for the other two to
 * depend on. lib/department-labels.ts re-exports it for display code.
 */
export const ALERT_SEVERITIES = ["INFO", "CAUTION", "WARNING", "CRITICAL"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** The four lifecycle states an alert row can be in at a given instant. */
export const ALERT_STATES = ["ACTIVE", "SCHEDULED", "EXPIRED", "INACTIVE"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

/** The minimum a state needs; keeps the rule usable without a full row. */
export type AlertWindow = Pick<AlertRow, "active" | "starts_at" | "ends_at">;

function parseInstant(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Resolve an alert's state at `now`.
 *
 * Order matters. `active` is checked first because it is the operator's explicit
 * off switch: a deactivated alert stays INACTIVE even if its window is currently
 * open, otherwise deactivating a live alert would relabel it as ACTIVE for anyone
 * reading before the row's window closed. An unparseable bound is treated as
 * absent rather than fatal, so a malformed timestamp cannot hide an alert forever.
 */
export function alertState(alert: AlertWindow, now: Date): AlertState {
  if (!alert.active) return "INACTIVE";

  const timestamp = now.getTime();
  const startsAt = parseInstant(alert.starts_at);
  const endsAt = parseInstant(alert.ends_at);

  if (startsAt !== null && timestamp < startsAt) return "SCHEDULED";
  if (endsAt !== null && timestamp > endsAt) return "EXPIRED";
  return "ACTIVE";
}

/**
 * Whether a visitor may currently see this alert. Exactly `ACTIVE` — a scheduled
 * notice has not begun and an expired one has ended, so neither is present
 * information, even though both are still `active = true` rows.
 */
export function isPubliclyVisible(alert: AlertWindow, now: Date): boolean {
  return alertState(alert, now) === "ACTIVE";
}

/**
 * Whether a proposed window is internally consistent. Nulls are open-ended and
 * always valid; a pair is valid only when it ends strictly after it starts, so a
 * zero-length window is refused rather than silently never displaying.
 *
 * The same rule is enforced by alerts_window_check in migration 016. This copy
 * exists so the API can return a readable 400 instead of leaking a constraint
 * violation as a 500 (API rule 3), and the test suite pins that the two agree.
 */
export function isWindowValid(
  startsAt: string | null,
  endsAt: string | null
): boolean {
  if (startsAt === null || endsAt === null) return true;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}

/** Human label for the state, so the console never shows a bare enum value. */
export const ALERT_STATE_LABEL: Record<AlertState, string> = {
  ACTIVE: "Live",
  SCHEDULED: "Scheduled",
  EXPIRED: "Expired",
  INACTIVE: "Deactivated",
};
