import { requireOperator } from "@/lib/api/authz";
import { handlePermitDecision } from "@/lib/api/permit-decision";

/** POST /api/v1/department/permits/{permit_id}/reject — terminal state (docs/PRD.md §8). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handlePermitDecision(context, request, "REJECTED");
}
