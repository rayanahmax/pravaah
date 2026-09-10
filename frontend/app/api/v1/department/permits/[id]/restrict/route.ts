import { requireOperator } from "@/lib/api/authz";
import { handlePermitDecision } from "@/lib/api/permit-decision";

/**
 * POST /api/v1/department/permits/{permit_id}/restrict — withdraws an issued
 * permit's access without deleting it (docs/PRD.md §8).
 *
 * The state machine also allows RESTRICTED back to APPROVED, but docs/API.md
 * defines no endpoint for lifting a restriction, so none is invented here.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handlePermitDecision(context, request, "RESTRICTED");
}
