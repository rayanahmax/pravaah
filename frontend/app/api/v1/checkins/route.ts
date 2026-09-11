import { requireOperator } from "@/lib/api/authz";
import { apiData, apiDatabaseError, apiError, apiRejection } from "@/lib/api/error";
import { firstErrorMessage, parseCheckIn, readJsonBody } from "@/lib/api/validation";
import { checkIn } from "@/services/checkins";

/**
 * POST /api/v1/checkins — Phase 8 (docs/API.md & PRD §10).
 *
 * Operator scans a QR token.
 * Validates operator role, token, permit state (APPROVED), visit date, destination,
 * duplicate check-in, and capacity headroom.
 * Transactionally creates check_in, transitions permit to CHECKED_IN, updates daily
 * quota admitted count, and returns updated occupancy.
 */
export async function POST(request: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  const parsed = parseCheckIn(body);

  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const result = await checkIn(parsed.value.qr_token);
    if (!result.ok) {
      return apiRejection(result.rejection);
    }
    return apiData(result.data, { status: 201 });
  } catch (error) {
    return apiDatabaseError("POST /api/v1/checkins", error);
  }
}
