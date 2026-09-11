import {
  ACTIVITY_LEVELS,
  ALTITUDE_LEVELS,
  TREKKING_LEVELS,
  type ActivityLevel,
  type HighAltitudeExperience,
  type ReadinessAnswers,
  type TrekkingExperience,
} from "@/lib/readiness";
import { parseIsoDate, parseUuid, type FieldError, type ParseResult } from "./validation";

/**
 * Request validation for POST /api/v1/readiness/assess. Kept in its own module so
 * lib/api/validation.ts stays dependency-free; this one may lean on the readiness
 * engine's enum definitions so the two never drift apart.
 */
export type ReadinessRequest = {
  destinationId: string;
  visitDate: string | null;
  answers: ReadinessAnswers;
};

function isMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function parseReadinessAssess(body: unknown): ParseResult<ReadinessRequest> {
  const errors: FieldError[] = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", message: "must be a JSON object" }] };
  }
  const input = body as Record<string, unknown>;

  const destinationId = parseUuid(input.destination_id, "destination_id");
  if (!destinationId.ok) errors.push(...destinationId.errors);

  let visitDate: string | null = null;
  if (input.visit_date !== undefined && input.visit_date !== null) {
    const parsed = parseIsoDate(input.visit_date, "visit_date");
    if (parsed.ok) visitDate = parsed.value;
    else errors.push(...parsed.errors);
  }

  let answers: ReadinessAnswers | null = null;
  const raw = input.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ field: "answers", message: "must be an object" });
  } else {
    const a = raw as Record<string, unknown>;
    const trekOk = isMember(a.trekkingExperience, TREKKING_LEVELS);
    const altOk = isMember(a.highAltitudeExperience, ALTITUDE_LEVELS);
    const actOk = isMember(a.activityLevel, ACTIVITY_LEVELS);
    if (!trekOk) errors.push({ field: "answers.trekkingExperience", message: `must be one of: ${TREKKING_LEVELS.join(", ")}` });
    if (!altOk) errors.push({ field: "answers.highAltitudeExperience", message: `must be one of: ${ALTITUDE_LEVELS.join(", ")}` });
    if (!actOk) errors.push({ field: "answers.activityLevel", message: `must be one of: ${ACTIVITY_LEVELS.join(", ")}` });
    if (trekOk && altOk && actOk) {
      answers = {
        trekkingExperience: a.trekkingExperience as TrekkingExperience,
        highAltitudeExperience: a.highAltitudeExperience as HighAltitudeExperience,
        activityLevel: a.activityLevel as ActivityLevel,
      };
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      destinationId: (destinationId as { ok: true; value: string }).value,
      visitDate,
      answers: answers as ReadinessAnswers,
    },
  };
}
