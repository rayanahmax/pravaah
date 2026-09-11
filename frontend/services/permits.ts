import { createClient } from "@/lib/supabase/server";
import type { PermitStatus } from "@/lib/permit-rules";
import type { PermitRow, PermitQrRow } from "@/types/rows";

/**
 * Permit reads and writes.
 *
 * The write paths are thin wrappers over the database functions from migrations
 * 006 and 008. That is the point rather than an abstraction: measuring capacity
 * and quota and then writing must happen in one transaction behind a lock, so
 * doing the measurement here in TypeScript would reintroduce exactly the race
 * those functions exist to close. docs/PRD.md §8 and AGENTS.md rule 7 put the
 * decision on the server, and the smallest server-side place for it is the
 * database itself.
 *
 * lib/permit-rules.ts remains the readable statement of the same rules, and its
 * tests keep the two copies aligned: probe 3d fails if the TypeScript state
 * machine and the SQL one disagree.
 *
 * Reads still go through Supabase directly, as the signed-in user, so row level
 * security decides visibility: a permit belonging to someone else reads as
 * absent rather than as forbidden.
 */

const PERMIT_COLUMNS =
  "id, user_id, destination_id, visit_date, group_size, status, contact_information, emergency_contact, permit_details, created_at, updated_at";

/** The shape the database functions return: no token material, no contact PII. */
export type PermitSummary = {
  id: string;
  destination_id: string;
  visit_date: string;
  group_size: number;
  status: PermitStatus;
  created_at: string;
  updated_at: string;
};

export type PermitRejection = { code: string; message: string };
export type PermitWriteResult =
  | { ok: true; permit: PermitSummary }
  | { ok: false; rejection: PermitRejection };

/** Postgres functions answer with { ok, permit } or { ok:false, code, message }. */
function toWriteResult(raw: unknown): PermitWriteResult {
  const value = (raw ?? {}) as {
    ok?: boolean;
    permit?: PermitSummary;
    code?: string;
    message?: string;
  };

  if (value.ok && value.permit) return { ok: true, permit: value.permit };
  return {
    ok: false,
    rejection: {
      code: value.code ?? "INVALID_STATE",
      // A function that returned neither shape is a programming error, and saying
      // so is more useful than reporting an empty refusal.
      message: value.message ?? "The database did not return a permit outcome.",
    },
  };
}

/**
 * A tourist requests a permit. The owner is taken from their token inside the
 * function, so nothing here can attribute a request to someone else, and no
 * capacity, quota or status value is accepted from the caller at all.
 */
export async function createPermit(input: {
  destinationId: string;
  visitDate: string;
  groupSize: number;
  contactInformation?: Record<string, unknown> | null;
  emergencyContact?: Record<string, unknown> | null;
  permitDetails?: Record<string, unknown> | null;
}): Promise<PermitWriteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_permit", {
    p_destination_id: input.destinationId,
    p_visit_date: input.visitDate,
    p_group_size: input.groupSize,
    p_contact_information: input.contactInformation ?? null,
    p_emergency_contact: input.emergencyContact ?? null,
    p_permit_details: input.permitDetails ?? null,
  });

  if (error) throw new Error(`createPermit: ${error.message}`);
  return toWriteResult(data);
}

/** The decisions an operator may take; cancellation belongs to the owner. */
export type PermitDecision = "APPROVED" | "REJECTED" | "RESTRICTED";

/** An operator moves a permit through the decision machine. */
export async function reviewPermit(
  permitId: string,
  decision: PermitDecision
): Promise<PermitWriteResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_permit", {
    p_permit_id: permitId,
    p_decision: decision,
  });

  if (error) throw new Error(`reviewPermit: ${error.message}`);
  return toWriteResult(data);
}

/**
 * Owner cancellation, delegated to cancel_permit.
 *
 * Not reimplemented here because that function is the only path that assigns
 * exactly one column, and it runs as the caller so RLS still guards it.
 */
export async function cancelPermit(
  permitId: string
): Promise<{ ok: true; result: unknown } | { ok: false; code: string; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_permit", { p_permit_id: permitId });

  if (error) return { ok: false, code: error.code, message: error.message };
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

/**
 * Owner-scoped QR read (Phase 7).
 *
 * Not filtered by user_id at the query layer: RLS already refuses to surface a
 * permit the caller has no SELECT policy for, so if a row comes back, the
 * caller could read it. The route that uses this additionally compares
 * `user_id` to the caller before returning the token, because an operator's
 * SELECT policy would otherwise let them fetch a tourist's QR — a token is
 * something to *scan*, not to *read*.
 *
 * qr_token_hash is only ever projected here. It is missing from PERMIT_COLUMNS
 * and from permit_summary() in migration 008 so the ordinary status reads
 * cannot return it.
 */
export async function getPermitQr(permitId: string): Promise<PermitQrRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permits")
    .select(
      "id, user_id, destination_id, visit_date, group_size, status, qr_token_hash"
    )
    .eq("id", permitId)
    .maybeSingle<PermitQrRow>();

  if (error) throw new Error(`getPermitQr: ${error.message}`);
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

/**
 * Row reads still need projecting by hand; the write functions already return this
 * shape, so the two paths cannot drift into different responses.
 */
export function toPermitDto(permit: PermitRow): PermitSummary {
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
