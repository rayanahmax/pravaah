import { findDestination } from "@/services/destinations";
import { buildCapacityView, setCapacity, toCapacityDto } from "@/services/capacity";
import { requireOperator } from "@/lib/api/authz";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseCapacityUpdate,
  parseUuid,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * PATCH /api/v1/department/destinations/{destination_id}/capacity — operator only.
 *
 * This is the action behind the PRD demonstration: occupancy 429 with capacity
 * 500 is 85.8% (NEAR_CAPACITY), and setting capacity to 440 makes the same
 * occupancy 97.5% (RESTRICTED). The new status is therefore recomputed from the
 * database after the write and returned, so a client can never assert a status of
 * its own choosing.
 *
 * Lowering capacity below current occupancy is allowed on purpose — that is
 * exactly how a department tightens access — so there is no "capacity below
 * occupancy" rejection here.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parseCapacityUpdate(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const destination = await findDestination(parsedId.value);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    await setCapacity(parsedId.value, parsed.value.capacity);

    // Re-read through the view so the response reflects stored state, not the
    // number the client happened to send.
    const updated = await findDestination(parsedId.value);
    if (!updated) return apiError("NOT_FOUND", "Destination not found.");

    return apiData(toCapacityDto(await buildCapacityView(updated)));
  } catch (error) {
    return apiDatabaseError(
      `PATCH /department/destinations/${parsedId.value}/capacity`,
      error
    );
  }
}
