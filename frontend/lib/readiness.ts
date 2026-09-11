/**
 * Readiness — the deterministic rule engine (Phase 14, PRD §13).
 *
 * Pure, dependency-free and clock-free: the same answers always produce the same
 * result, which is what makes it testable and trustworthy. It is deliberately
 * INFORMATIONAL — it never claims medical fitness, never guarantees safety, and
 * is never an access decision. Permit approval and capacity are decided
 * elsewhere and are unaffected by anything here (PRD §13, AGENTS rules 12-13).
 *
 * The optional AI layer (lib/readiness-ai.ts) only ever explains the output of
 * this function; it never feeds into it.
 */

export const TREKKING_LEVELS = ["none", "beginner", "moderate", "experienced"] as const;
export type TrekkingExperience = (typeof TREKKING_LEVELS)[number];

export const ALTITUDE_LEVELS = ["none", "some", "experienced"] as const;
export type HighAltitudeExperience = (typeof ALTITUDE_LEVELS)[number];

export const ACTIVITY_LEVELS = ["low", "moderate", "high"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export type ReadinessAnswers = {
  trekkingExperience: TrekkingExperience;
  highAltitudeExperience: HighAltitudeExperience;
  activityLevel: ActivityLevel;
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

const TREKKING_POINTS: Record<TrekkingExperience, number> = { none: 0, beginner: 1, moderate: 2, experienced: 3 };
const ALTITUDE_POINTS: Record<HighAltitudeExperience, number> = { none: 0, some: 2, experienced: 3 };
const ACTIVITY_POINTS: Record<ActivityLevel, number> = { low: 0, moderate: 1, high: 2 };
const MAX_POINTS = 8;

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
 * Assess readiness deterministically. `destinationDifficulty` contextualises the
 * bar: a demanding route asks for more experience than an easy one. The result is
 * advisory; it never overrides an access decision.
 */
export function assessReadiness(
  answers: ReadinessAnswers,
  destinationDifficulty?: string | null
): ReadinessResult {
  const difficulty = normalizeDifficulty(destinationDifficulty);

  const points =
    TREKKING_POINTS[answers.trekkingExperience] +
    ALTITUDE_POINTS[answers.highAltitudeExperience] +
    ACTIVITY_POINTS[answers.activityLevel];
  const score = clampScore((points / MAX_POINTS) * 100);

  // A harder destination raises the thresholds; an easier one relaxes them.
  const shift = difficulty === "HARD" ? 15 : difficulty === "EASY" ? -15 : 0;
  const readyAt = clampScore(70 + shift);
  const cautionAt = clampScore(40 + shift);

  const level: ReadinessLevel =
    score >= readyAt ? "READY" : score >= cautionAt ? "PROCEED_WITH_CAUTION" : "PREPARE_MORE";

  const strengths: string[] = [];
  const advisories: string[] = [];

  if (answers.trekkingExperience === "experienced") strengths.push("Extensive trekking experience.");
  else if (answers.trekkingExperience === "moderate") strengths.push("Some trekking experience.");

  if (answers.highAltitudeExperience === "experienced") strengths.push("Comfortable at altitude.");
  else if (answers.highAltitudeExperience === "some") strengths.push("Some high-altitude exposure.");

  if (answers.activityLevel === "high") strengths.push("High activity level.");
  else if (answers.activityLevel === "moderate") strengths.push("Moderate activity level.");

  if (difficulty === "HARD") {
    if (answers.trekkingExperience === "none" || answers.trekkingExperience === "beginner") {
      advisories.push("This route is demanding for limited trekking experience — consider a guided group or an easier route first.");
    }
    if (answers.highAltitudeExperience === "none") {
      advisories.push("Plan gradual acclimatisation for the altitude on this route.");
    }
  } else if (difficulty === "MODERATE" && answers.trekkingExperience === "none") {
    advisories.push("A short practice trek is advisable before attempting this route.");
  }

  if (answers.activityLevel === "low") {
    advisories.push("Build up your stamina beforehand — this trip involves sustained physical effort.");
  }
  if (level === "PREPARE_MORE") {
    advisories.push("Consider preparing further or choosing an easier destination before you go.");
  }
  if (level !== "READY") {
    advisories.push("Check the latest weather and any active alerts on the day of your visit.");
  }

  return { level, score, strengths, advisories, disclaimer: DISCLAIMER };
}
