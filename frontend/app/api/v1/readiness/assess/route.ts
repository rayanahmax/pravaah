import { requireUser } from "@/lib/api/authz";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import { firstErrorMessage, readJsonBody } from "@/lib/api/validation";
import { parseReadinessAssess } from "@/lib/api/readiness-validation";
import { assessReadiness } from "@/lib/readiness";
import { explainReadiness } from "@/lib/readiness-ai";
import { insertReadinessAssessment } from "@/services/readiness";
import { findDestination } from "@/services/destinations";

/**
 * POST /api/v1/readiness/assess (docs/API.md).
 *
 * Returns a DETERMINISTIC, structured readiness result computed server-side from
 * the answers plus the destination's difficulty. The AI explanation is optional
 * and non-authoritative: it is generated only if a provider is configured, and
 * any failure yields null — the deterministic result is always complete and is
 * what gets stored and returned (PRD §13-14, AGENTS rules 12-13).
 *
 * The assessment is informational. It never approves a permit, never overrides
 * capacity or access, and never claims medical fitness.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const body = await readJsonBody(request);
  if (body === null) return apiError("VALIDATION_ERROR", "A JSON body is required.");

  const parsed = parseReadinessAssess(body);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", firstErrorMessage(parsed.errors));
  }

  const { destinationId, visitDate, answers } = parsed.value;

  try {
    const destination = await findDestination(destinationId);
    if (!destination) return apiError("NOT_FOUND", "Destination not found.");

    const result = assessReadiness(answers, destination.difficulty);
    const explanation = await explainReadiness(answers, result);
    const stored = { ...result, explanation, aiGenerated: explanation !== null };

    const id = await insertReadinessAssessment({
      userId: auth.profile.id,
      destinationId,
      visitDate,
      answers,
      result: stored,
    });

    return apiData({ id, destination_id: destinationId, visit_date: visitDate, ...stored });
  } catch (error) {
    return apiDatabaseError("POST /readiness/assess", error);
  }
}
