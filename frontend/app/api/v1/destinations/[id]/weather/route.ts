import { findDestination } from "@/services/destinations";
import { fetchDestinationWeather } from "@/services/weather";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import { firstErrorMessage, parseUuid } from "@/lib/api/validation";

/**
 * GET /api/v1/destinations/{destination_id}/weather (docs/API.md, PRD §15).
 *
 * Server retrieves and normalises external conditions; the browser never talks to
 * the provider itself, so the upstream URL and any future key stay server-side
 * (API rules 4-5). Public like the rest of destination information.
 *
 * Failure is typed, not thrown. A destination with no coordinates is
 * NOT_CONFIGURED (409) and a provider that is down, slow or malformed is
 * UPSTREAM_UNAVAILABLE (503) — an honest status rather than a 200 that hides an
 * outage or a 500 that blames the database. PRD §15 requires weather failure to
 * break nothing, and `fetchDestinationWeather` never throws, so a provider outage
 * cannot reach the capacity or permit paths.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  let destination;
  try {
    destination = await findDestination(parsedId.value);
  } catch (error) {
    // A database fault must not be reported as "not found", or an operator would
    // go looking for a destination row that is actually fine.
    return apiDatabaseError(`GET /destinations/${parsedId.value}/weather`, error);
  }
  if (!destination) {
    return apiError("NOT_FOUND", "Destination not found.");
  }

  // Outside the try deliberately: fetchDestinationWeather never throws, so nothing
  // it does can be misreported as a database error.
  const weather = await fetchDestinationWeather(destination);
  if (!weather.ok) {
    return apiError(weather.code, weather.message);
  }

  return apiData(weather.report);
}
