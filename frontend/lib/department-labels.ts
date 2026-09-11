/**
 * Pure presentation helpers shared by the department console.
 *
 * Deliberately free of any I/O and of server-only imports so both Server
 * Components and Client Components can use it. It maps the authoritative
 * backend states onto the label + badge tone already defined in
 * globals.css; it never decides a status on its own (AGENTS.md rules 6-7).
 */

import type { CapacityStatus } from "@/lib/capacity";
import type { PermitStatus } from "@/lib/permit-rules";
/*
 * The severity list is owned by lib/alert-rules.ts, the domain module. It is
 * re-exported here so display code keeps one import path. The .ts extension is
 * required: node --test resolves ES module specifiers literally and will not
 * follow an extensionless relative import.
 */
import { ALERT_SEVERITIES, type AlertSeverity } from "./alert-rules.ts";

export { ALERT_SEVERITIES };
export type { AlertSeverity };

export type BadgeTone =
  | "default"
  | "green"
  | "pending"
  | "restricted"
  /*
   * Alert-only tones. Deliberately not reusing `restricted`: capacity and permit
   * badges already mean "attention, restricted state" with it, and alerts need one
   * distinguishable step per severity. The previous mapping gave WARNING and
   * CRITICAL the same tone, so a badge could not tell a hazard from a danger.
   */
  | "caution"
  | "warning"
  | "critical";

/** Presentation tone for each severity. One distinct tone per level. */
const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = {
  INFO: "pending",
  CAUTION: "caution",
  WARNING: "warning",
  CRITICAL: "critical",
};

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  INFO: 0,
  CAUTION: 1,
  WARNING: 2,
  CRITICAL: 3,
};

/** Numeric order, for sorting a list or picking the dominant alert. */
export function severityRank(severity: AlertSeverity): number {
  return SEVERITY_RANK[severity];
}

export const CAPACITY_STATUS_LABEL: Record<CapacityStatus, string> = {
  AVAILABLE: "Available",
  NEAR_CAPACITY: "Near capacity",
  RESTRICTED: "Restricted",
  CLOSED: "Closed",
};

const CAPACITY_STATUS_TONE: Record<CapacityStatus, BadgeTone> = {
  AVAILABLE: "green",
  NEAR_CAPACITY: "pending",
  RESTRICTED: "restricted",
  CLOSED: "restricted",
};

/**
 * A capacity status plus the department access override. When the override
 * forced the value, `overridden` is true and we surface the underlying computed
 * state so an operator is never surprised about why a band reads the way it does.
 */
export function describeCapacity(result: {
  status: CapacityStatus;
  computedStatus: CapacityStatus;
  overridden: boolean;
}): { label: string; tone: BadgeTone; overrideNote: string | null } {
  return {
    label: CAPACITY_STATUS_LABEL[result.status],
    tone: CAPACITY_STATUS_TONE[result.status],
    overrideNote: result.overridden
      ? `Set by department override (calculated: ${CAPACITY_STATUS_LABEL[result.computedStatus]})`
      : null,
  };
}

export const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RESTRICTED: "Restricted",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
};

const PERMIT_STATUS_TONE: Record<PermitStatus, BadgeTone> = {
  PENDING: "pending",
  APPROVED: "green",
  REJECTED: "restricted",
  RESTRICTED: "restricted",
  CANCELLED: "default",
  EXPIRED: "default",
  CHECKED_IN: "green",
  COMPLETED: "green",
};

export function permitBadge(status: PermitStatus): { label: string; tone: BadgeTone } {
  return { label: PERMIT_STATUS_LABEL[status], tone: PERMIT_STATUS_TONE[status] };
}

/** How many trailing UUID characters a reference shows. */
const REFERENCE_LENGTH = 6;

/**
 * The human-readable permit reference, e.g. `PRM-D8DE22`. Single source of truth:
 * the review queue, the tourist's permit list, the visitor home and the printed
 * pass must all agree, or a visitor reading their code off the pass and a staff
 * member reading it off the queue are looking at two different strings for the
 * same permit.
 *
 * Six characters, matching the certificate, because that is the artefact a
 * checkpoint officer actually reads; a four-character tail also collides far more
 * often once a queue has hundreds of rows.
 *
 * Privacy-preserving (API rule 4): a UUID tail reveals no owner identity and is
 * not the permit's primary key.
 *
 * This is a label, never a credential. The checkpoint scanner accepts only the
 * opaque QR token stored in `permits.qr_token_hash`; a reference pasted there is
 * meant to be refused.
 */
export function permitReference(id: string): string {
  return `PRM-${id.slice(-REFERENCE_LENGTH).toUpperCase()}`;
}

/** One tone per level. See lib/department-labels.test.ts, which pins that. */
export function severityTone(severity: AlertSeverity): BadgeTone {
  return SEVERITY_TONE[severity];
}

/**
 * Whether a permit can still be moved by an operator decision, matching the
 * states the review_permit machine accepts from. Terminal or in-field states
 * render no action buttons rather than a button that would be refused.
 */
export function isDecisionPending(status: PermitStatus): boolean {
  return status === "PENDING";
}

/** Local wall-clock HH:MM for a stored ISO instant; blank when unparseable. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

/** Human day label relative to the given reference date (defaults to now). */
export function describeDay(isoDate: string, reference: Date = new Date()): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const startOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOf(date) - startOf(reference)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

export function formatPercent(value: number): string {
  return `${value}%`;
}
