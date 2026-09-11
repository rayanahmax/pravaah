import { findDestination } from "@/services/destinations";
import { listActiveAlerts } from "@/services/alerts";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";
import type { AlertRow } from "@/types/rows";

/**
 * Public shape of an alert. `created_by` is deliberately absent: it is an operator
 * user id, useful in the console where accountability belongs and unnecessary PII
 * in a response any anonymous visitor can read (API rule 4). The management view
 * reads the full row server-side through `listAllForDestination`, so this is a
 * projection for the public route only, not a restriction on what staff can see.
 */
function toPublicAlert(alert: AlertRow) {
  return {
    id: alert.id,
    destination_id: alert.destination_id,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    starts_at: alert.starts_at,
    ends_at: alert.ends_at,
    created_at: alert.created_at,
  };
}

/**
 * GET /api/v1/destinations/{destination_id}/alerts (docs/API.md).
 *
 * Public: an alert exists precisely so visitors see it. Only currently displayable
 * rows are returned — deactivated, scheduled and expired notices are filtered by
 * the same window rule the destination page uses, so this endpoint and the tourist
 * UI can never disagree about what is live.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  try {
    const destination = await findDestination(parsedId.value);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    const alerts = await listActiveAlerts(destination.id);
    return apiData(alerts.map(toPublicAlert));
  } catch (error) {
    return apiDatabaseError(`GET /destinations/${parsedId.value}/alerts`, error);
  }
}
