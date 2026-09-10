import { reviewPermit, type PermitDecision } from "@/services/permits";
import { apiDatabaseError, apiError, apiRejection, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * Shared implementation for the three operator decision endpoints
 * (approve, reject, restrict). They differ only in the target state, and keeping
 * one implementation means the authorization order and the error mapping cannot
 * drift apart between them.
 *
 * Order matters: authorize as an operator before touching the body, so an
 * unauthenticated caller learns nothing about permit ids or validation rules.
 */
export async function handlePermitDecision(
  context: { params: Promise<{ id: string }> },
  request: Request,
  to: PermitDecision
) {
  const { id } = await context.params;
  const parsedId = parseUuid(id, "permit_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  // Decision endpoints take no body; rejecting one avoids a silently ignored
  // payload that a client might believe was applied.
  const text = await request.text();
  if (text.trim()) {
    return apiError("VALIDATION_ERROR", "This operation takes no request body.");
  }

  try {
    const result = await reviewPermit(parsedId.value, to);
    if (!result.ok) return apiRejection(result.rejection);
    return apiData(result.permit);
  } catch (error) {
    return apiDatabaseError(`POST /department/permits/${parsedId.value}/${to.toLowerCase()}`, error);
  }
}
