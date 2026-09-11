import { findAlert, setAlertActive } from "@/services/alerts";
import { requireOperator } from "@/lib/api/authz";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseAlertPatch,
  parseUuid,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * PATCH /api/v1/department/alerts/{alert_id} — operator only (docs/API.md).
 *
 * Accepts `{ "active": true | false }` and nothing else. PRD §16 gives operators
 * create, activate and deactivate; it does not give them an edit path, so a safety
 * notice already on screen cannot be rewritten out from under someone reading it.
 * Correcting one means deactivating it and raising a new alert, which leaves the
 * visible event the change deserves.
 *
 * The row is re-read after the update rather than echoing the request: a PATCH that
 * matches nothing under row level security still returns 204, so only the second
 * read distinguishes "changed" from "never yours to change".
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const parsedId = parseUuid(id, "alert_id");
  if (!parsedId.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsedId.errors));
  }

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parseAlertPatch(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const existing = await findAlert(parsedId.value);
    if (!existing) return apiError("NOT_FOUND", "Alert not found.");

    const updated = await setAlertActive(parsedId.value, parsed.value.active);
    if (!updated) return apiError("NOT_FOUND", "Alert not found.");

    return apiData(updated);
  } catch (error) {
    return apiDatabaseError(`PATCH /department/alerts/${parsedId.value}`, error);
  }
}
