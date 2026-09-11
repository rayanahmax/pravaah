import { requireOperator } from "@/lib/api/authz";
import { handleAccessOverride } from "@/lib/api/access-override";

/**
 * POST /api/v1/department/destinations/{destination_id}/restrict (docs/API.md).
 *
 * Applies the department RESTRICTED access override (PRD §6): new permit
 * requests for this destination are refused server-side and the console shows
 * the destination as restricted regardless of the computed capacity band.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;
  return handleAccessOverride(context, request, "RESTRICTED");
}
