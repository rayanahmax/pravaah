import { createClient } from "@/lib/supabase/server";
import {
  canTransition,
  evaluateApproval,
  evaluatePermitEligibility,
  invalidState,
  RESERVING_STATUSES,
  type PermitStatus,
  type Rejection,
} from "@/lib/permit-rules";
import { getOccupancy, findCapacityConfiguration } from "@/services/capacity";
import { findQuota } from "@/services/quotas";
import { findDestination } from "@/services/destinations";
import { todayIsoDate } from "@/lib/date";
import type { DestinationRow, PermitRow } from "@/types/rows";

/**
 * Permit reads and writes.
 *
 * Nothing here decides policy: eligibility and the state machine live in
 * lib/permit-rules.ts, and row level security plus migration 007's trigger are
 * the boundary the database enforces regardless of this code. The caller's role is
 * taken from the profiles row through an authenticated server client, never from
 * the request (AGENTS.md rules 6 and 7).
 */

const PERMIT_COLUMNS =
  "id, user_id, destination_id, visit_date, group_size, status, contact_information, emergency_contact, created_at, updated_at";

export type PermitFacts = {
  destination: DestinationRow;
  capacity: number | null;
  occupancy: number;
  quota: number | null;
  booked: number;
  admitted: number;
  today: string;
};

/** Group sizes still reserved against a destination's visit date. */
export async function getBookedForDate(
  destinationId: string,
  visitDate: string
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permits")
    .select("id, group_size, status")
    .eq("destination_id", destinationId)
    .eq("visit_date", visitDate)
    .in("status", [...RESERVING_STATUSES]);

  if (error) throw new Error(`getBookedForDate: ${error.message}`);

  return ((data as { group_size: number }[] | null) ?? []).reduce(
    (total, row) => total + row.group_size,
    0
  );
}

/**
 * Everything the rules need, resolved from the database.
 *
 * Occupancy is derived from active check-ins, and once Phase 8 writes them the
 * figure becomes live. Quota consumption is booked plus admitted; see the note in
 * lib/permit-rules.ts.
 *
 * KNOWN LIMITATION, deliberate and recorded rather than hidden: these are separate
 * reads followed by a write, so two concurrent requests or approvals can each see
 * enough room and both take it. Closing that needs a transactional RPC that locks
 * the destination row and re-checks inside one statement, the same shape as
 * cancel_permit. It should land before check-in exists, because that is when
 * occupancy starts moving under a live queue.
 */
export async function resolvePermitFacts(
  destination: DestinationRow,
  visitDate: string
): Promise<PermitFacts> {
  const [capacityConfig, occupancy, quota, booked] = await Promise.all([
    findCapacityConfiguration(destination.id),
    getOccupancy(destination.id),
    findQuota(destination.id, visitDate),
    getBookedForDate(destination.id, visitDate),
  ]);

  return {
    destination,
    capacity: capacityConfig?.maximum_capacity ?? null,
    occupancy,
    quota: quota?.quota ?? null,
    booked,
    admitted: quota?.visitors_admitted ?? 0,
    today: todayIsoDate(),
  };
}

export type CreatePermitInput = {
  destinationId: string;
  visitDate: string;
  groupSize: number;
  contactInformation?: unknown;
  emergencyContact?: unknown;
};

export type PermitWriteResult =
  | { ok: true; permit: PermitRow }
  | { ok: false; rejection: Rejection };

/** A tourist requests a permit. Stored as PENDING; no decision is made here. */
export async function createPermit(
  userId: string,
  input: CreatePermitInput
): Promise<PermitWriteResult> {
  const destination = await findDestination(input.destinationId);
  if (!destination) {
    return {
      ok: false,
      rejection: { code: "INVALID_STATE", message: "Destination not found." },
    };
  }

  const facts = await resolvePermitFacts(destination, input.visitDate);
  const eligibility = evaluatePermitEligibility({
    visitDate: input.visitDate,
    today: facts.today,
    groupSize: input.groupSize,
    accessStatus: facts.destination.access_status,
    capacity: facts.capacity,
    occupancy: facts.occupancy,
    quota: facts.quota,
    booked: facts.booked,
    admitted: facts.admitted,
  });
  if (!eligibility.ok) return { ok: false, rejection: eligibility.rejection };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permits")
    .insert({
      user_id: userId,
      destination_id: input.destinationId,
      visit_date: input.visitDate,
      group_size: input.groupSize,
      status: "PENDING",
      contact_information: input.contactInformation ?? null,
      emergency_contact: input.emergencyContact ?? null,
    })
    .select(PERMIT_COLUMNS)
    .single<PermitRow>();

  if (error) throw new Error(`createPermit: ${error.message}`);
  return { ok: true, permit: data };
}

/**
 * An operator moves a permit through the decision machine.
 *
 * Approval re-runs the full eligibility check, because the numbers that justified
 * a request are not the numbers of the day it is reviewed. A refusal leaves the
 * permit untouched, and the database still has the final say: RLS permits the
 * status change only for operators, and migration 007 makes every other column
 * immutable for everyone else.
 */
export async function reviewPermit(
  permitId: string,
  to: PermitStatus
): Promise<PermitWriteResult> {
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("permits")
    .select(PERMIT_COLUMNS)
    .eq("id", permitId)
    .maybeSingle<PermitRow>();

  if (readError) throw new Error(`reviewPermit: ${readError.message}`);
  if (!current) {
    return { ok: false, rejection: { code: "INVALID_STATE", message: "Permit not found." } };
  }

  if (!canTransition(current.status as PermitStatus, to)) {
    return {
      ok: false,
      rejection: invalidState(current.status as PermitStatus, to),
    };
  }

  if (to === "APPROVED") {
    const destination = await findDestination(current.destination_id);
    if (!destination) {
      return { ok: false, rejection: { code: "INVALID_STATE", message: "Destination not found." } };
    }
    const facts = await resolvePermitFacts(destination, current.visit_date);
    const eligibility = evaluateApproval({
      accessStatus: destination.access_status,
      capacity: facts.capacity,
      occupancy: facts.occupancy,
      quota: facts.quota,
      booked: facts.booked,
      admitted: facts.admitted,
    });
    if (!eligibility.ok) return { ok: false, rejection: eligibility.rejection };
  }

  const { data, error } = await supabase
    .from("permits")
    .update({ status: to })
    .eq("id", permitId)
    .select(PERMIT_COLUMNS)
    .maybeSingle<PermitRow>();

  if (error) throw new Error(`reviewPermit: ${error.message}`);
  if (!data) {
    return { ok: false, rejection: { code: "INVALID_STATE", message: "Permit not found." } };
  }
  return { ok: true, permit: data };
}

/**
 * Owner cancellation, delegated to the cancel_permit RPC.
 *
 * The function is deliberately not re-implemented here: it is the only path that
 * assigns exactly one column, and RLS remains the gate underneath it.
 */
export async function cancelPermit(
  permitId: string
): Promise<{ ok: true; result: unknown } | { ok: false; code: string; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_permit", { p_permit_id: permitId });

  if (error) {
    return { ok: false, code: error.code, message: error.message };
  }
  return { ok: true, result: data };
}

export async function listMyPermits(userId: string): Promise<PermitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permits")
    .select(PERMIT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listMyPermits: ${error.message}`);
  return (data as PermitRow[] | null) ?? [];
}

export async function getPermit(permitId: string): Promise<PermitRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permits")
    .select(PERMIT_COLUMNS)
    .eq("id", permitId)
    .maybeSingle<PermitRow>();

  if (error) throw new Error(`getPermit: ${error.message}`);
  return data ?? null;
}

export async function listOperatorPermits(filters: {
  status?: PermitStatus;
  destinationId?: string;
}): Promise<PermitRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("permits")
    .select(PERMIT_COLUMNS)
    .order("visit_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.destinationId) query = query.eq("destination_id", filters.destinationId);

  const { data, error } = await query;
  if (error) throw new Error(`listOperatorPermits: ${error.message}`);
  return (data as PermitRow[] | null) ?? [];
}

/** Permit fields safe to return to a tourist: no token material, no row internals. */
export function toPermitDto(permit: PermitRow) {
  return {
    id: permit.id,
    destination_id: permit.destination_id,
    visit_date: permit.visit_date,
    group_size: permit.group_size,
    status: permit.status,
    created_at: permit.created_at,
    updated_at: permit.updated_at,
  };
}
