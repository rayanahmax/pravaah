import { findDestination, updateDestination } from "@/services/destinations";
import { buildCapacityView, toCapacityDto } from "@/services/capacity";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid, type AccessStatus } from "@/lib/api/validation";

/**
 * Shared implementation for the three department access-override endpoints
 * (restrict, close, reopen). They differ only in the target `access_status`, so
 * one implementation keeps the authorization order, the no-body rule and the
 * error mapping identical across them (the same reasoning as
 * lib/api/permit-decision.ts).
 *
 * The override is a single-column write on the destination row; the resulting
 * access status is not asserted here but re-derived by the capacity engine, so a
 * client can never claim a status of its own choosing (AGENTS.md rules 6-7).
 * `open` is not "force available" — it removes the override and lets the
 * computed capacity band show through, exactly as PRD §6 describes.
 */
export async function handleAccessOverride(
  context: { params: Promise<{ id: string }> },
  request: Request,
  to: AccessStatus
) {
  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  // Access endpoints take no body; a payload is refused rather than ignored, so
  // a caller never believes a value they sent had any effect.
  const text = await request.text();
  if (text.trim()) {
    return apiError("VALIDATION_ERROR", "This operation takes no request body.");
  }

  try {
    const existing = await findDestination(parsedId.value);
    if (!existing) return apiError("NOT_FOUND", "Destination not found.");

    const updated = await updateDestination(parsedId.value, { access_status: to });
    // A null update means the row is absent or the operator policy refused it;
    // both read as NOT_FOUND so the response reveals nothing about hidden rows.
    if (!updated) return apiError("NOT_FOUND", "Destination not found.");

    return apiData(toCapacityDto(await buildCapacityView(updated)));
  } catch (error) {
    return apiDatabaseError(`access override ${to} on ${parsedId.value}`, error);
  }
}
