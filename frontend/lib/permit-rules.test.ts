/**
 * Permit rule tests. Covers docs/PRD.md §8 approval conditions and the §8 state
 * machine, with emphasis on the booked-plus-admitted quota model, because that is
 * the interpretation this phase adds rather than one the docs spell out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canTransition,
  evaluatePermitEligibility,
  RESERVING_STATUSES,
  type EligibilityFacts,
} from "./permit-rules.ts";

const base: EligibilityFacts = {
  visitDate: "2026-10-05",
  today: "2026-10-01",
  groupSize: 4,
  accessStatus: "OPEN",
  capacity: 500,
  occupancy: 425,
  quota: 500,
  booked: 0,
  admitted: 0,
};

const codeOf = (result: ReturnType<typeof evaluatePermitEligibility>) =>
  result.ok ? null : result.rejection.code;

test("PRD §17 demonstration figures admit a group of four", () => {
  assert.deepEqual(evaluatePermitEligibility(base), { ok: true });
});

test("capacity boundary is inclusive at exactly full", () => {
  // 425 + 75 = 500 fits; one more does not.
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, groupSize: 75 })), null);
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, groupSize: 76 })),
    "CAPACITY_EXCEEDED"
  );
});

test("remaining capacity reported in the refusal is the real headroom", () => {
  const result = evaluatePermitEligibility({ ...base, groupSize: 100 });
  assert.ok(!result.ok);
  assert.match(result.rejection.message, /remaining capacity of 75/);
});

test("a day's quota is consumed by reservations as well as admissions", () => {
  // Capacity has room (425 inside of 500) but the day is already booked out.
  assert.equal(
    codeOf(
      evaluatePermitEligibility({ ...base, occupancy: 10, booked: 497 })
    ),
    "QUOTA_EXCEEDED"
  );
  // 496 booked plus a group of 4 lands exactly on the quota and still fits.
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, occupancy: 10, booked: 496, groupSize: 4 })),
    null
  );
});

test("booked and admitted add without double counting", () => {
  // A permit leaves RESERVING_STATUSES when it checks in, so the two figures are
  // disjoint: 250 booked + 250 admitted consumes a 500 quota.
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, occupancy: 250, booked: 250, admitted: 0, groupSize: 1 })),
    null
  );
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, occupancy: 0, booked: 250, admitted: 250, groupSize: 1 })),
    "QUOTA_EXCEEDED"
  );
});

test("cancelling releases a reservation, which is why cancel is capacity control", () => {
  const full = { ...base, occupancy: 0, booked: 500, admitted: 0 };
  assert.equal(codeOf(evaluatePermitEligibility({ ...full, groupSize: 1 })), "QUOTA_EXCEEDED");
  // After 100 people cancel, their slots are back.
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...full, booked: 400, groupSize: 1 })),
    null
  );
});

test("only PENDING and APPROVED reserve a place", () => {
  assert.deepEqual([...RESERVING_STATUSES].sort(), ["APPROVED", "PENDING"]);
});

test("a closed destination admits nobody regardless of numbers", () => {
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, accessStatus: "CLOSED", occupancy: 0, booked: 0 })),
    "DESTINATION_CLOSED"
  );
});

test("a restricted destination blocks new permits (PRD §6 override)", () => {
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, accessStatus: "RESTRICTED" })),
    "DESTINATION_RESTRICTED"
  );
});

test("unconfigured capacity or quota fails closed", () => {
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, capacity: null })), "NOT_CONFIGURED");
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, quota: null })), "NOT_CONFIGURED");
});

test("visit date in the past is refused, today is allowed", () => {
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, visitDate: "2026-09-30" })),
    "DATE_IN_PAST"
  );
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, visitDate: "2026-10-01", today: "2026-10-01" })),
    null
  );
});

test("group size must be a positive whole number", () => {
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, groupSize: 0 })), "GROUP_SIZE_INVALID");
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, groupSize: -3 })), "GROUP_SIZE_INVALID");
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, groupSize: 2.5 })), "GROUP_SIZE_INVALID");
  assert.equal(codeOf(evaluatePermitEligibility({ ...base, groupSize: 1 })), null);
});

test("the PRD §8 state machine allows only the defined transitions", () => {
  assert.equal(canTransition("PENDING", "APPROVED"), true);
  assert.equal(canTransition("PENDING", "REJECTED"), true);
  assert.equal(canTransition("PENDING", "CANCELLED"), true);
  assert.equal(canTransition("APPROVED", "RESTRICTED"), true);
  assert.equal(canTransition("APPROVED", "CANCELLED"), true);
  assert.equal(canTransition("APPROVED", "CHECKED_IN"), true); // Phase 8
  assert.equal(canTransition("CHECKED_IN", "COMPLETED"), true); // Phase 9
  assert.equal(canTransition("RESTRICTED", "APPROVED"), true); // restriction lifted

  assert.equal(canTransition("APPROVED", "APPROVED"), false);
  assert.equal(canTransition("CANCELLED", "APPROVED"), false, "cancelled is terminal");
  assert.equal(canTransition("REJECTED", "APPROVED"), false, "rejected is terminal");
  assert.equal(canTransition("EXPIRED", "APPROVED"), false);
  assert.equal(canTransition("COMPLETED", "CANCELLED"), false);
  assert.equal(canTransition("PENDING", "CHECKED_IN"), false, "no check-in before approval");
  assert.equal(canTransition("PENDING", "COMPLETED"), false);
});

test("ISO dates compare correctly without a parser, including across months", () => {
  // The rule relies on lexicographic comparison, which only holds for padded ISO.
  assert.equal("2026-09-30" < "2026-10-01", true);
  assert.equal("2025-12-31" < "2026-01-01", true);
  assert.equal(
    codeOf(evaluatePermitEligibility({ ...base, today: "2026-11-01" })),
    "DATE_IN_PAST"
  );
});
