import {
  AGE_ANSWERS,
  EXPERIENCE_LEVELS,
  YES_NO,
  type AgeAnswer,
  type ExperienceLevel,
  type ReadinessAnswers,
  type YesNo,
} from "@/lib/readiness";
import { parseIsoDate, parseUuid, type FieldError, type ParseResult } from "./validation";

/**
 * Request validation for POST /api/v1/readiness/assess. Kept in its own module so
 * lib/api/validation.ts stays dependency-free; this one leans on the readiness
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

    const checks: Array<[unknown, readonly string[], string]> = [
      [a.previousExperience, EXPERIENCE_LEVELS, "previousExperience"],
      [a.physicalPreparation, YES_NO, "physicalPreparation"],
      [a.durationReady, YES_NO, "durationReady"],
      [a.elevationExperience, YES_NO, "elevationExperience"],
      [a.equipment, YES_NO, "equipment"],
      [a.weatherPreparation, YES_NO, "weatherPreparation"],
      [a.routeKnowledge, YES_NO, "routeKnowledge"],
      [a.ageRequirement, AGE_ANSWERS, "ageRequirement"],
    ];
    const allOk = checks.every(([value, allowed, name]) => {
      const ok = isMember(value, allowed);
      if (!ok) errors.push({ field: `answers.${name}`, message: `must be one of: ${allowed.join(", ")}` });
      return ok;
    });

    if (allOk) {
      answers = {
        previousExperience: a.previousExperience as ExperienceLevel,
        physicalPreparation: a.physicalPreparation as YesNo,
        durationReady: a.durationReady as YesNo,
        elevationExperience: a.elevationExperience as YesNo,
        equipment: a.equipment as YesNo,
        weatherPreparation: a.weatherPreparation as YesNo,
        routeKnowledge: a.routeKnowledge as YesNo,
        ageRequirement: a.ageRequirement as AgeAnswer,
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
