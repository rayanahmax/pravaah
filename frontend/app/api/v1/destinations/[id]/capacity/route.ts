import { findDestination } from "@/services/destinations";
import { buildCapacityView, toCapacityDto } from "@/services/capacity";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * GET /api/v1/destinations/{destination_id}/capacity
 * Public status read. The numbers come from stored configuration plus derived
 * check-in state; nothing in the request can influence them.
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

    return apiData(toCapacityDto(await buildCapacityView(destination)));
  } catch (error) {
    return apiDatabaseError(`GET /destinations/${parsedId.value}/capacity`, error);
  }
}
