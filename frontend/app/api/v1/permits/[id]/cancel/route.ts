import { requireUser } from "@/lib/api/authz";
import { cancelPermit } from "@/services/permits";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * POST /api/v1/permits/{permit_id}/cancel — owner cancels an eligible permit.
 *
 * The work is the database's: cancel_permit assigns only status and enforces
 * ownership and eligibility, and RLS gates it again underneath. This handler
 * translates the function's SQLSTATEs into the documented envelope.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const parsedId = parseUuid(id, "permit_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  const text = await request.text();
  if (text.trim()) {
    return apiError("VALIDATION_ERROR", "Cancellation takes no request body.");
  }

  try {
    const result = await cancelPermit(parsedId.value);
    if (!result.ok) {
      // PRV01 covers "does not exist" and "not yours" identically so the endpoint
      // cannot be used to probe other users' permits.
      if (result.code === "PRV01") return apiError("NOT_FOUND", "Permit not found.");
      if (result.code === "PRV02") return apiError("INVALID_STATE", result.message);
      if (result.code === "PRV03") return apiError("FORBIDDEN", result.message);
      return apiDatabaseError(`POST /permits/${parsedId.value}/cancel`, result.message);
    }
    return apiData(result.result);
  } catch (error) {
    return apiDatabaseError(`POST /permits/${parsedId.value}/cancel`, error);
  }
}
