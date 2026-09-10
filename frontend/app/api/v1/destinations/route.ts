import { listDestinations } from "@/services/destinations";
import { apiDatabaseError, apiData } from "@/lib/api/error";

/**
 * GET /api/v1/destinations — list public destinations (docs/API.md).
 *
 * No authorization required: destinations carry public information and the RLS
 * policy grants SELECT to anyone. Route Handlers are not cached by default in
 * Next.js, and this one reads per request, so it always reflects current state.
 */
export async function GET() {
  try {
    const destinations = await listDestinations();
    return apiData(destinations);
  } catch (error) {
    return apiDatabaseError("GET /destinations", error);
  }
}
