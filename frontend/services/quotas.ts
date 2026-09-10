import { createClient } from "@/lib/supabase/server";
import {
  canAdmitGroup,
  evaluateQuota,
  isQuotaReductionValid,
  type QuotaState,
} from "@/lib/quota";
import type { DailyQuotaRow } from "@/types/rows";

/**
 * Daily quota reads and the operator write.
 *
 * Everything runs as the signed-in user through row level security: the public
 * SELECT policy in migration 001 makes a day readable by anyone, and the operator
 * FOR ALL policy added there and repaired in 003 is what allows a change.
 *
 * `visitors_admitted` is never accepted from a caller. It is a server-derived
 * count that only the Phase 8 check-in flow will move, so the write below sends
 * it in no payload — on conflict Postgres updates only the columns present, and on
 * insert the schema default of 0 applies.
 */

const QUOTA_COLUMNS =
  "id, destination_id, quota_date, quota, visitors_admitted";

function toState(row: DailyQuotaRow | null): QuotaState {
  return evaluateQuota({
    quota: row?.quota ?? null,
    visitorsAdmitted: row?.visitors_admitted ?? null,
  });
}

/** The stored row for one destination and day, or null when the day is unset. */
export async function findQuota(
  destinationId: string,
  date: string
): Promise<DailyQuotaRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_quotas")
    .select(QUOTA_COLUMNS)
    .eq("destination_id", destinationId)
    .eq("quota_date", date)
    .maybeSingle<DailyQuotaRow>();

  if (error) throw new Error(`findQuota: ${error.message}`);
  return data ?? null;
}

/** Response shape for one destination and day (docs/API.md quota block). */
export type QuotaView = {
  destination_id: string;
  date: string;
  quota: number | null;
  visitors_admitted: number | null;
  remaining: number;
};

/** Quota plus the derived remaining figure for one destination and day. */
export async function readQuota(
  destinationId: string,
  date: string
): Promise<QuotaView> {
  const row = await findQuota(destinationId, date);
  const state = toState(row);

  return {
    destination_id: destinationId,
    date,
    quota: state.quota,
    visitors_admitted: state.visitorsAdmitted,
    remaining: state.remaining,
  };
}

/**
 * Whether a requested group fits the day's remaining quota. Shaped for Phase 6:
 * a caller with a destination, a date and a group size needs no knowledge of how
 * the numbers are stored.
 */
export async function canAdmitGroupAt(
  destinationId: string,
  date: string,
  groupSize: number
): Promise<boolean> {
  const row = await findQuota(destinationId, date);
  return canAdmitGroup(toState(row), groupSize);
}

export type QuotaWriteResult =
  | { ok: true; quota: QuotaView }
  | { ok: false; reason: "reduction_below_admitted"; visitorsAdmitted: number };

/**
 * Operator quota write: one INSERT ... ON CONFLICT (destination_id, quota_date)
 * DO UPDATE, the conflict target the unique constraint in docs/DATABASE.md
 * provides.
 */
export async function setQuota(
  destinationId: string,
  date: string,
  quota: number
): Promise<QuotaWriteResult> {
  const existing = await findQuota(destinationId, date);
  const admitted = existing?.visitors_admitted ?? 0;

  if (!isQuotaReductionValid(quota, admitted)) {
    return { ok: false, reason: "reduction_below_admitted", visitorsAdmitted: admitted };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_quotas")
    .upsert(
      { destination_id: destinationId, quota_date: date, quota },
      { onConflict: "destination_id,quota_date" }
    );

  if (error) throw new Error(`setQuota: ${error.message}`);

  return { ok: true, quota: await readQuota(destinationId, date) };
}
