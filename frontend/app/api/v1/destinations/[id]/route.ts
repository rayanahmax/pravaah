import { findDestination } from "@/services/destinations";
import { buildCapacityView, toCapacityDto } from "@/services/capacity";
import { readQuota } from "@/services/quotas";
import { listActiveAlerts } from "@/services/alerts";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseIsoDate, parseUuid } from "@/lib/api/validation";
import { todayIsoDate } from "@/lib/date";

/**
 * GET /api/v1/destinations/{destination_id}
 * Destination details plus capacity, occupancy, quota, status and alerts
 * (docs/API.md). Public: destination information is readable by anyone.
 *
 * `?date=YYYY-MM-DD` selects which day's quota to report; it defaults to the
 * server's current day.
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

    // Quota and alerts are independent of the destination row, so one failing
    // read does not hide the rest of the response.
    const [capacity, quota, alerts] = await Promise.all([
      buildCapacityView(destination),
      readQuota(destination.id, parsedDate.value),
      listActiveAlerts(destination.id),
    ]);

    return apiData({
      destination,
      capacity: toCapacityDto(capacity),
      quota,
      alerts,
    });
  } catch (error) {
    return apiDatabaseError(`GET /destinations/${parsedId.value}`, error);
  }
}
