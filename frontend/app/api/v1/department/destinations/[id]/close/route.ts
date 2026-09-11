import { requireOperator } from "@/lib/api/authz";
import { handleAccessOverride } from "@/lib/api/access-override";

/**
 * POST /api/v1/department/destinations/{destination_id}/close (docs/API.md).
 *
 * Applies the department CLOSED access override (PRD §6): the destination admits
 * no new permits and the console reports it closed. Closing is an access
 * decision, not a deletion — existing permits, check-ins and history are left
 * untouched.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handleAccessOverride(context, request, "CLOSED");
}
