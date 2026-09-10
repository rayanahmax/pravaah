import { findDestination } from "@/services/destinations";
import { readQuota, setQuota } from "@/services/quotas";
import { requireOperator } from "@/lib/api/authz";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseQuotaUpdate,
  parseUuid,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * PATCH /api/v1/department/destinations/{destination_id}/quota — operator only.
 *
 * Body is { "date": "YYYY-MM-DD", "quota": 500 } per docs/API.md. Authorization is
 * checked before the body is even parsed, so an anonymous caller learns nothing
 * about the rules, and the write itself runs under row level security as the
 * signed-in operator.
 *
 * `visitors_admitted` cannot be sent: an unknown field is rejected, and the upsert
 * payload never includes the column, so the browser has no path to claim how many
 * people are inside. Only the check-in flow added in Phase 8 will move it.
 *
 * Lowering a day's quota below the visitors already admitted is refused with
 * CONFLICT rather than silently clamping the count.
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

  const parsed = parseQuotaUpdate(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const destination = await findDestination(parsedId.value);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    const result = await setQuota(destination.id, parsed.value.date, parsed.value.quota);
    if (!result.ok) {
      return apiError(
        "CONFLICT",
        `Quota cannot be lower than the ${result.visitorsAdmitted} visitors already admitted for ${parsed.value.date}.`
      );
    }

    // Re-read so the response reports stored state, not the submitted figure.
    return apiData(await readQuota(destination.id, parsed.value.date));
  } catch (error) {
    return apiDatabaseError(
      `PATCH /department/destinations/${parsedId.value}/quota`,
      error
    );
  }
}
