import { requireOperator } from "@/lib/api/authz";
import { listOperatorPermits, toPermitDto } from "@/services/permits";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";
import type { PermitStatus } from "@/lib/permit-rules";

const STATUSES: readonly PermitStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "RESTRICTED",
  "CANCELLED",
  "EXPIRED",
  "CHECKED_IN",
  "COMPLETED",
];

/**
 * GET /api/v1/department/permits — the operator review queue.
 *
 * Optional ?status= and ?destination_id= filters. Both are validated before use so
 * an unexpected value is a 400 rather than a silently empty list.
 */
export async function GET(request: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  if (status && !STATUSES.includes(status as PermitStatus)) {
    return apiError(
      "VALIDATION_ERROR",
      `status: must be one of ${STATUSES.join(", ")}`
    );
  }

  const destinationId = params.get("destination_id");
  if (destinationId) {
    const parsed = parseUuid(destinationId, "destination_id");
    if (!parsed.ok) {
      return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
    }
  }

  try {
    const permits = await listOperatorPermits({
      status: (status as PermitStatus | undefined) ?? undefined,
      destinationId: destinationId ?? undefined,
    });
    return apiData(permits.map(toPermitDto));
  } catch (error) {
    return apiDatabaseError("GET /department/permits", error);
  }
}
