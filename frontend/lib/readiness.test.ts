import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessReadiness,
  normalizeDifficulty,
  type ReadinessAnswers,
} from "./readiness.ts";

const MAX: ReadinessAnswers = { trekkingExperience: "experienced", highAltitudeExperience: "experienced", activityLevel: "high" };
const NONE: ReadinessAnswers = { trekkingExperience: "none", highAltitudeExperience: "none", activityLevel: "low" };

test("normalizeDifficulty maps free text onto three bands", () => {
  assert.equal(normalizeDifficulty("Easy"), "EASY");
  assert.equal(normalizeDifficulty("easy-moderate"), "EASY");
  assert.equal(normalizeDifficulty("Strenuous"), "HARD");
  assert.equal(normalizeDifficulty("difficult"), "HARD");
  assert.equal(normalizeDifficulty("Moderate"), "MODERATE");
  assert.equal(normalizeDifficulty(null), "MODERATE");
  assert.equal(normalizeDifficulty("  "), "MODERATE");
});

test("score is deterministic and bounded 0-100", () => {
  assert.equal(assessReadiness(MAX, "MODERATE").score, 100);
  assert.equal(assessReadiness(NONE, "MODERATE").score, 0);
  const mid = assessReadiness({ trekkingExperience: "moderate", highAltitudeExperience: "some", activityLevel: "moderate" }, "MODERATE");
  assert.ok(mid.score > 0 && mid.score < 100);
});

test("the same answers always yield the same result", () => {
  const a = assessReadiness(MAX, "HARD");
  const b = assessReadiness(MAX, "HARD");
  assert.deepEqual(a, b);
});

test("a harder destination raises the bar for the same answers", () => {
  const answers: ReadinessAnswers = { trekkingExperience: "moderate", highAltitudeExperience: "some", activityLevel: "high" };
  const easy = assessReadiness(answers, "EASY").level;
  const hard = assessReadiness(answers, "HARD").level;
  // Score is identical; the level can only be the same or stricter under HARD.
  assert.equal(assessReadiness(answers, "EASY").score, assessReadiness(answers, "HARD").score);
  const rank = { PREPARE_MORE: 0, PROCEED_WITH_CAUTION: 1, READY: 2 } as const;
  assert.ok(rank[easy] >= rank[hard]);
});

test("maximum experience on an easy route is READY", () => {
  assert.equal(assessReadiness(MAX, "EASY").level, "READY");
});

test("no experience on a hard route is PREPARE_MORE with advisories", () => {
  const r = assessReadiness(NONE, "HARD");
  assert.equal(r.level, "PREPARE_MORE");
  assert.ok(r.advisories.length > 0);
  assert.ok(r.advisories.some((a) => /acclimatisation|guided|easier/i.test(a)));
});

test("strengths reflect the answers", () => {
  const r = assessReadiness(MAX, "MODERATE");
  assert.ok(r.strengths.length >= 3);
});

test("every result carries the non-medical disclaimer", () => {
  for (const a of [MAX, NONE]) {
    const r = assessReadiness(a, "MODERATE");
    assert.match(r.disclaimer, /not a medical assessment/i);
    assert.match(r.disclaimer, /does not\s+guarantee safety/i);
  }
});
