import { requireUser } from "@/lib/api/authz";
import { createPermit } from "@/services/permits";
import { sanitizePermitDetails } from "@/lib/permit-details";
import { apiDatabaseError, apiError, apiRejection, apiData } from "@/lib/api/error";
import {
  firstErrorMessage,
  parsePermitCreate,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * POST /api/v1/permits — a tourist requests a permit.
 *
 * The request is stored as PENDING and no decision is made here. Eligibility is
 * evaluated server-side from stored facts (docs/PRD.md §8), and the inserted row's
 * owner comes from the authenticated profile rather than the body, so a client
 * cannot request on someone else's behalf.
 *
 * permit_details is sanitized on the way in — unknown keys dropped and government
 * ID numbers masked to their last four — so the full identifiers never reach the
 * database no matter what the browser submits.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parsePermitCreate(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const result = await createPermit({
      destinationId: parsed.value.destinationId,
      visitDate: parsed.value.visitDate,
      groupSize: parsed.value.groupSize,
      contactInformation: parsed.value.contactInformation,
      emergencyContact: parsed.value.emergencyContact,
      permitDetails: sanitizePermitDetails(parsed.value.permitDetails),
    });
    if (!result.ok) return apiRejection(result.rejection);
    return apiData(result.permit, { status: 201 });
  } catch (error) {
    return apiDatabaseError("POST /permits", error);
  }
}
