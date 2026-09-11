import { requireOperator } from "@/lib/api/authz";
import { handleAccessOverride } from "@/lib/api/access-override";

/**
 * POST /api/v1/department/destinations/{destination_id}/open (docs/API.md).
 *
 * Removes the department access override by returning the destination to OPEN.
 * The reported status then falls back to the capacity band the engine computes
 * from live occupancy, so reopening does not promise "available" — it simply
 * stops forcing the override.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handleAccessOverride(context, request, "OPEN");
}
