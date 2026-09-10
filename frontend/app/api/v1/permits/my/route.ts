import { requireUser } from "@/lib/api/authz";
import { listMyPermits, toPermitDto } from "@/services/permits";
import { apiDatabaseError, apiData } from "@/lib/api/error";

/** GET /api/v1/permits/my — the caller's own requests, newest first. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const permits = await listMyPermits(auth.profile.id);
    return apiData(permits.map(toPermitDto));
  } catch (error) {
    return apiDatabaseError("GET /permits/my", error);
  }
}
