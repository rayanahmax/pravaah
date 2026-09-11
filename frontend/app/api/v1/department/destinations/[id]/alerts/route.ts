import { findDestination } from "@/services/destinations";
import { createAlert } from "@/services/alerts";
import { requireOperator } from "@/lib/api/authz";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseAlertCreate,
  parseUuid,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * POST /api/v1/department/destinations/{destination_id}/alerts — operator only
 * (docs/API.md, PRD §16).
 *
 * Authorization runs before the body is parsed, so an anonymous caller learns
 * nothing about the field rules. `created_by` comes from the authenticated
 * profile, never from the request, and `active` is not accepted at all — a new
 * notice is live by definition, and taking the flag from the browser would let a
 * caller publish a row that starts switched off (AGENTS rule 6).
 *
 * The window rule is enforced here for a readable 400 and again by
 * `alerts_window_check` in the database, so a row that can never display is
 * unrepresentable whichever way it arrives.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const parsedId = parseUuid(id, "destination_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parseAlertCreate(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const destination = await findDestination(parsedId.value);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    const alert = await createAlert(destination.id, parsed.value, auth.profile.id);
    return apiData(alert, { status: 201 });
  } catch (error) {
    return apiDatabaseError(
      `POST /department/destinations/${parsedId.value}/alerts`,
      error
    );
  }
}
