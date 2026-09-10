import { createClient } from "@/lib/supabase/server";
import type { DailyQuotaRow } from "@/types/rows";

/**
 * Daily quota reads (docs/DATABASE.md daily_quotas).
 *
 * Quota is separate from capacity (PRD §6) and is only read here: Phase 5 adds
 * the write path and the permit-side consumption rules.
 */
export async function findQuota(
  destinationId: string,
  date: string
): Promise<DailyQuotaRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_quotas")
    .select("id, destination_id, quota_date, quota, visitors_admitted")
    .eq("destination_id", destinationId)
    .eq("quota_date", date)
    .maybeSingle<DailyQuotaRow>();

  if (error) throw new Error(`findQuota: ${error.message}`);
  return data ?? null;
}
