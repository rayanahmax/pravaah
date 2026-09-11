import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessReadiness,
  normalizeDifficulty,
  type ReadinessAnswers,
} from "./readiness.ts";

const FULL: ReadinessAnswers = {
  previousExperience: "experienced",
  physicalPreparation: "yes",
  durationReady: "yes",
  elevationExperience: "yes",
  equipment: "yes",
  weatherPreparation: "yes",
  routeKnowledge: "yes",
  ageRequirement: "yes",
};
const NONE: ReadinessAnswers = {
  previousExperience: "none",
  physicalPreparation: "no",
  durationReady: "no",
  elevationExperience: "no",
  equipment: "no",
  weatherPreparation: "no",
  routeKnowledge: "no",
  ageRequirement: "not_applicable",
};

test("normalizeDifficulty maps free text onto three bands", () => {
  assert.equal(normalizeDifficulty("Easy"), "EASY");
  assert.equal(normalizeDifficulty("easy-moderate"), "EASY");
  assert.equal(normalizeDifficulty("Strenuous"), "HARD");
  assert.equal(normalizeDifficulty("difficult"), "HARD");
  assert.equal(normalizeDifficulty("Moderate"), "MODERATE");
  assert.equal(normalizeDifficulty(null), "MODERATE");
});

test("score is deterministic and bounded 0-100", () => {
  assert.equal(assessReadiness(FULL, "MODERATE").score, 100);
  assert.equal(assessReadiness(NONE, "MODERATE").score, 0);
});

test("the same answers always yield the same result", () => {
  assert.deepEqual(assessReadiness(FULL, "HARD"), assessReadiness(FULL, "HARD"));
});

test("a harder destination raises the bar for the same answers", () => {
  const answers: ReadinessAnswers = { ...FULL, previousExperience: "some", equipment: "no", weatherPreparation: "no" };
  const rank = { PREPARE_MORE: 0, PROCEED_WITH_CAUTION: 1, READY: 2 } as const;
  assert.equal(assessReadiness(answers, "EASY").score, assessReadiness(answers, "HARD").score);
  assert.ok(rank[assessReadiness(answers, "EASY").level] >= rank[assessReadiness(answers, "HARD").level]);
});

test("full readiness on an easy route is READY", () => {
  assert.equal(assessReadiness(FULL, "EASY").level, "READY");
});

test("no readiness is PREPARE_MORE with advisories for each gap", () => {
  const r = assessReadiness(NONE, "HARD");
  assert.equal(r.level, "PREPARE_MORE");
  assert.ok(r.advisories.some((a) => /acclimatisation/i.test(a)));
  assert.ok(r.advisories.some((a) => /footwear|gear|water/i.test(a)));
  assert.ok(r.advisories.some((a) => /endurance/i.test(a)));
});

test("the minimum-age gate caps the level even with full answers", () => {
  const r = assessReadiness({ ...FULL, ageRequirement: "no" }, "EASY");
  assert.equal(r.level, "PREPARE_MORE");
  assert.ok(r.advisories.some((a) => /minimum-age/i.test(a)));
});

test("strengths reflect the yes answers", () => {
  const r = assessReadiness(FULL, "MODERATE");
  assert.ok(r.strengths.length >= 7);
});

test("every result carries the non-medical disclaimer", () => {
  for (const a of [FULL, NONE]) {
    const r = assessReadiness(a, "MODERATE");
    assert.match(r.disclaimer, /not a medical assessment/i);
    assert.match(r.disclaimer, /does not\s+guarantee safety/i);
  }
});
