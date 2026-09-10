import { requireOperator } from "@/lib/api/authz";
import { handlePermitDecision } from "@/lib/api/permit-decision";

/**
 * POST /api/v1/department/permits/{permit_id}/approve (docs/API.md).
 * Approval re-runs the capacity and quota rules against current state; it is
 * refused if the permit's existing reservation no longer fits.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handlePermitDecision(context, request, "APPROVED");
}
