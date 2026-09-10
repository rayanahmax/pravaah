import { requireUser } from "@/lib/api/authz";
import { getPermit, toPermitDto } from "@/services/permits";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * GET /api/v1/permits/{permit_id} — "get authorized permit" (docs/API.md).
 *
 * Authorization is delegated to row level security rather than repeated here: the
 * SELECT policies expose a permit to its owner, and to an operator, and to nobody
 * else, so a row that comes back is a row the caller may read. A permit belonging
 * to someone else reads as absent. qr_token_hash is deliberately not returned —
 * the QR surface is Phase 7, and a token is not information a client needs to show
 * a status.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const parsedId = parseUuid(id, "permit_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  try {
    const permit = await getPermit(parsedId.value);
    if (!permit) return apiError("NOT_FOUND", "Permit not found.");
    return apiData(toPermitDto(permit));
  } catch (error) {
    return apiDatabaseError(`GET /permits/${parsedId.value}`, error);
  }
}
