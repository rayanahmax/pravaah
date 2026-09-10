import { findDestination, updateDestination } from "@/services/destinations";
import { requireOperator } from "@/lib/api/authz";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseDestinationPatch,
  parseUuid,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * PATCH /api/v1/department/destinations/{destination_id} — operator only.
 *
 * `access_status` is the department override from PRD §6 and is deliberately the
 * only access-control field mutable here. Phase 11 adds the purpose-built
 * restrict/close/open endpoints, which are the intended operator interface; this
 * route exists so the destination record itself can be corrected.
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

  const parsed = parseDestinationPatch(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const existing = await findDestination(parsedId.value);
    if (!existing) return apiError("NOT_FOUND", "Destination not found.");

    const updated = await updateDestination(parsedId.value, parsed.value);
    if (!updated) return apiError("NOT_FOUND", "Destination not found.");

    return apiData(updated);
  } catch (error) {
    return apiDatabaseError(`PATCH /department/destinations/${parsedId.value}`, error);
  }
}
