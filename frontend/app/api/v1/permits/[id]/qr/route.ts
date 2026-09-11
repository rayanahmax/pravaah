import { requireUser } from "@/lib/api/authz";
import { getPermitQr } from "@/services/permits";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * GET /api/v1/permits/{permit_id}/qr — Phase 7 (docs/API.md).
 *
 * Returns the raw token the tourist's client turns into a QR image. Deliberately
 * owner-only even though RLS lets an operator SELECT the same permit: the token
 * is what a checkpoint scans, not what a console reads. Confirming "not yours"
 * as 404 rather than 403 preserves the pattern every other route here uses, so
 * a caller cannot tell an absent permit from someone else's.
 *
 * Approved-only because PRD §9 says a QR is what approved permits receive.
 * A non-approved status is refused rather than silently returning a token,
 * since a token for a permit that cannot be checked in against would just
 * confuse the client. The token itself is minted by the migration 009 trigger
 * on the first APPROVED transition and never rotates, so this endpoint is a
 * pure read.
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
    const permit = await getPermitQr(parsedId.value);
    if (!permit) return apiError("NOT_FOUND", "Permit not found.");
    if (permit.user_id !== auth.profile.id) {
      // Same response as the missing case: another user's permit is not there
      // as far as this caller is concerned, whether RLS hid it or we did.
      return apiError("NOT_FOUND", "Permit not found.");
    }
    if (permit.status !== "APPROVED") {
      return apiError(
        "INVALID_STATE",
        `Only an approved permit has a QR. This one is ${permit.status}.`
      );
    }
    if (!permit.qr_token_hash) {
      // Should be unreachable after migration 009, but the shape of the
      // response is a promise we make to the client and an approved permit
      // without a token would otherwise hand back { token: null }. A permit
      // that arrived here predates the trigger is a database condition, not
      // a client one, so report it plainly.
      return apiError(
        "INVALID_STATE",
        "This approved permit has no QR token issued; contact the department."
      );
    }

    return apiData({
      permit_id: permit.id,
      destination_id: permit.destination_id,
      visit_date: permit.visit_date,
      group_size: permit.group_size,
      status: permit.status,
      // The value stored in permits.qr_token_hash. The column name is a
      // leftover from docs/DATABASE.md's initial design; migration 009 treats
      // it as the opaque reference itself, not a hash of another secret, so
      // a checkpoint that scans it can look the row up directly.
      token: permit.qr_token_hash,
    });
  } catch (error) {
    return apiDatabaseError(`GET /permits/${parsedId.value}/qr`, error);
  }
}
