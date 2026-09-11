/**
 * Readiness — the deterministic rule engine (Phase 14, PRD §13).
 *
 * Pure, dependency-free and clock-free: the same answers always produce the same
 * result, which is what makes it testable and trustworthy. It is INFORMATIONAL —
 * it never claims medical fitness, never guarantees safety, and is never an access
 * decision. Permit approval and capacity are decided elsewhere and are unaffected
 * by anything here (PRD §13, AGENTS rules 12-13).
 *
 * The questionnaire is an eight-point self-assessment. Prior experience is graded;
 * the rest are yes/no checks; the minimum-age item is a gate that can only make
 * the advice stricter, never admit someone. The optional AI layer
 * (lib/readiness-ai.ts) only ever explains the output of this function.
 */

export const EXPERIENCE_LEVELS = ["none", "some", "experienced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];

export const AGE_ANSWERS = ["yes", "no", "not_applicable"] as const;
export type AgeAnswer = (typeof AGE_ANSWERS)[number];

export type ReadinessAnswers = {
  previousExperience: ExperienceLevel;
  physicalPreparation: YesNo;
  durationReady: YesNo;
  elevationExperience: YesNo;
  equipment: YesNo;
  weatherPreparation: YesNo;
  routeKnowledge: YesNo;
  ageRequirement: AgeAnswer;
};

export type ReadinessLevel = "READY" | "PROCEED_WITH_CAUTION" | "PREPARE_MORE";

export type ReadinessResult = {
  level: ReadinessLevel;
  /** Deterministic 0-100 readiness score. */
  score: number;
  strengths: string[];
  advisories: string[];
  /** Fixed, non-medical disclaimer — always present. */
  disclaimer: string;
};

const DISCLAIMER =
  "This is general, informational guidance only. It is not a medical assessment and does not " +
  "guarantee safety. Consult a qualified professional about your fitness, and follow all posted " +
  "rules, weather advisories and guide instructions.";

const EXPERIENCE_POINTS: Record<ExperienceLevel, number> = { none: 0, some: 2, experienced: 3 };
// Prior experience is worth up to 3; the six yes/no checks are worth 1 each.
const MAX_POINTS = 3 + 6;

export type DestinationDifficulty = "EASY" | "MODERATE" | "HARD";

/** Best-effort mapping of a destination's free-text difficulty onto three bands. */
export function normalizeDifficulty(difficulty: string | null | undefined): DestinationDifficulty {
  const d = (difficulty ?? "").trim().toUpperCase();
  if (!d) return "MODERATE";
  if (d.includes("EASY") || d === "GENTLE" || d.includes("STROLL")) return "EASY";
  if (
    d.includes("HARD") ||
    d.includes("DIFFICULT") ||
    d.includes("STRENUOUS") ||
    d.includes("EXTREME") ||
    d.includes("DEMANDING")
  ) {
    return "HARD";
  }
  return "MODERATE";
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Assess readiness deterministically. `destinationDifficulty` raises the bar for a
 * demanding route and relaxes it for an easy one. A "no" on the minimum-age gate
 * caps the level at PREPARE_MORE and adds a prominent advisory — it can never
 * admit someone, only warn them.
 */
export function assessReadiness(
  answers: ReadinessAnswers,
  destinationDifficulty?: string | null
): ReadinessResult {
  const difficulty = normalizeDifficulty(destinationDifficulty);

  let points = EXPERIENCE_POINTS[answers.previousExperience];
  const strengths: string[] = [];
  const advisories: string[] = [];

  if (answers.previousExperience === "experienced") {
    strengths.push("Extensive prior trekking / high-altitude experience.");
  } else if (answers.previousExperience === "some") {
    strengths.push("Some prior trekking / high-altitude experience.");
  } else {
    advisories.push("You have little prior trekking or high-altitude experience — consider a guided group or an easier route first.");
  }

  const yesChecks: Array<[YesNo, string, string]> = [
    [answers.physicalPreparation, "Comfortable walking for several hours.", "This trek involves several hours on foot — build up your endurance beforehand."],
    [answers.durationReady, "Can manage the expected duration.", "The expected duration may be more than you are comfortable with; consider a shorter route."],
    [answers.elevationExperience, "Has travelled to a similar elevation.", "You have not been to a similar elevation — plan for gradual acclimatisation."],
    [answers.equipment, "Has the required gear.", "Make sure you have proper footwear, clothing and water before you go."],
    [answers.weatherPreparation, "Has trained in similar conditions.", "You have not trained in similar conditions — prepare for the expected weather."],
    [answers.routeKnowledge, "Has reviewed the route.", "Review the route difficulty and requirements before your visit."],
  ];

  for (const [value, strength, advice] of yesChecks) {
    if (value === "yes") {
      points += 1;
      strengths.push(strength);
    } else {
      advisories.push(advice);
    }
  }

  const score = clampScore((points / MAX_POINTS) * 100);

  const shift = difficulty === "HARD" ? 15 : difficulty === "EASY" ? -15 : 0;
  const readyAt = clampScore(70 + shift);
  const cautionAt = clampScore(40 + shift);

  let level: ReadinessLevel =
    score >= readyAt ? "READY" : score >= cautionAt ? "PROCEED_WITH_CAUTION" : "PREPARE_MORE";

  // The age gate can only make the advice stricter, never admit the visitor.
  if (answers.ageRequirement === "no") {
    level = "PREPARE_MORE";
    advisories.unshift("You may not meet this destination's minimum-age requirement — verify it with the department before travelling.");
  }

  if (level !== "READY") {
    advisories.push("Check the latest weather and any active alerts on the day of your visit.");
  }

  return { level, score, strengths, advisories, disclaimer: DISCLAIMER };
}
