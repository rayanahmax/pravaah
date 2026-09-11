import { requireOperator } from "@/lib/api/authz";
import { apiDatabaseError, apiError, apiRejection, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseCheckOut, readJsonBody } from "@/lib/api/validation";
import { processCheckOut } from "@/services/checkouts";

/**
 * POST /api/v1/checkouts — Operator QR Check-out (docs/API.md §Check-out).
 *
 * Request:
 *   { "qr_token": "secure-token" }
 *
 * Authorization:
 *   DEPARTMENT_OPERATOR role required.
 *
 * Validates token → finds permit → asserts CHECKED_IN status → prevents
 * duplicate checkout → transactionally creates check-out row, marks permit
 * COMPLETED, and re-derives occupancy under the same advisory lock used by
 * the check-in RPC so concurrent operations on the same destination/date queue.
 */
export async function POST(request: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  const parsed = parseCheckOut(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const result = await processCheckOut(parsed.value.qr_token);
    if (!result.ok) {
      return apiRejection(result.rejection);
    }
    return apiData(result.data, { status: 201 });
  } catch (error) {
    return apiDatabaseError("POST /api/v1/checkouts", error);
  }
}
