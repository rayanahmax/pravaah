import { readQuota } from "@/services/quotas";
import { findDestination } from "@/services/destinations";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseIsoDate, parseUuid } from "@/lib/api/validation";
import { todayIsoDate } from "@/lib/date";

/**
 * GET /api/v1/destinations/{destination_id}/quota?date=YYYY-MM-DD
 * Public read (docs/API.md). Shows the declared quota, who has already been
 * admitted, and the remainder the Phase 6 permit rules will consult.
 *
 * A destination with no quota row for the day is still a successful response:
 * `quota` and `visitors_admitted` are null and `remaining` is 0. Null distinguishes
 * "never declared" from a deliberate quota of 0, while the zero remainder keeps any
 * consumer failing closed.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  const requestedDate = new URL(request.url).searchParams.get("date");
  const parsedDate = requestedDate
    ? parseIsoDate(requestedDate, "date")
    : { ok: true as const, value: todayIsoDate() };
  if (!parsedDate.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedDate.errors));
  }

  try {
    const destination = await findDestination(parsedId.value);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    return apiData(await readQuota(destination.id, parsedDate.value));
  } catch (error) {
    return apiDatabaseError(`GET /destinations/${parsedId.value}/quota`, error);
  }
}
