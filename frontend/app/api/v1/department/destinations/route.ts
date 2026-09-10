import { insertDestination } from "@/services/destinations";
import { requireOperator } from "@/lib/api/authz";
import { apiDatabaseError, apiError, apiData } from "@/lib/api/error";
import {
  firstErrorMessage,
  parseDestinationCreate,
  readJsonBody,
} from "@/lib/api/validation";

/**
 * POST /api/v1/department/destinations — operator only (docs/API.md).
 *
 * Authorization is checked before anything is written, and the insert itself runs
 * under row level security as the signed-in user, so the operator policy is
 * enforced in the database too rather than only in this handler.
 */
export async function POST(request: Request) {
  const auth = await requireOperator();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parseDestinationCreate(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  try {
    const destination = await insertDestination(parsed.value);
    return apiData(destination, { status: 201 });
  } catch (error) {
    return apiDatabaseError("POST /department/destinations", error);
  }
}
