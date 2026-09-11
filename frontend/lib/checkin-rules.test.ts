import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCheckIn, type CheckInFacts } from "./checkin-rules.ts";

const TODAY = "2026-09-11";

const validFacts: CheckInFacts = {
  permitStatus: "APPROVED",
  visitDate: TODAY,
  today: TODAY,
  accessStatus: "OPEN",
  capacity: 500,
  occupancy: 425,
  groupSize: 4,
};

test("PRD §10: valid approved permit on visit date fits in capacity", () => {
  const result = evaluateCheckIn(validFacts);
  assert.equal(result.ok, true);
});

test("duplicate check-in is refused with CONFLICT", () => {
  const checkedInStatus = evaluateCheckIn({
    ...validFacts,
    permitStatus: "CHECKED_IN",
  });
  assert.equal(checkedInStatus.ok, false);
  if (!checkedInStatus.ok) {
    assert.equal(checkedInStatus.rejection.code, "CONFLICT");
  }

  const alreadyRecorded = evaluateCheckIn({
    ...validFacts,
    alreadyCheckedIn: true,
  });
  assert.equal(alreadyRecorded.ok, false);
  if (!alreadyRecorded.ok) {
    assert.equal(alreadyRecorded.rejection.code, "CONFLICT");
  }
});

test("non-APPROVED statuses are refused with INVALID_STATE", () => {
  const unapproved = ["PENDING", "REJECTED", "RESTRICTED", "CANCELLED", "EXPIRED", "COMPLETED"] as const;
  for (const status of unapproved) {
    const result = evaluateCheckIn({ ...validFacts, permitStatus: status });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejection.code, "INVALID_STATE");
    }
  }
});

test("visit date in past is refused with DATE_IN_PAST", () => {
  const result = evaluateCheckIn({ ...validFacts, visitDate: "2026-09-10" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.code, "DATE_IN_PAST");
  }
});

test("visit date in future is refused with INVALID_STATE", () => {
  const result = evaluateCheckIn({ ...validFacts, visitDate: "2026-09-12" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.code, "INVALID_STATE");
  }
});

test("closed destination is refused with DESTINATION_CLOSED", () => {
  const result = evaluateCheckIn({ ...validFacts, accessStatus: "CLOSED" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.code, "DESTINATION_CLOSED");
  }
});

test("restricted destination is refused with DESTINATION_RESTRICTED", () => {
  const result = evaluateCheckIn({ ...validFacts, accessStatus: "RESTRICTED" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.code, "DESTINATION_RESTRICTED");
  }
});

test("unconfigured capacity is refused with NOT_CONFIGURED", () => {
  const result = evaluateCheckIn({ ...validFacts, capacity: null });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.rejection.code, "NOT_CONFIGURED");
  }
});

test("capacity boundary: exact fit succeeds, exceeding by 1 person fails", () => {
  const exactFit = evaluateCheckIn({
    ...validFacts,
    capacity: 500,
    occupancy: 496,
    groupSize: 4,
  });
  assert.equal(exactFit.ok, true);

  const overflow = evaluateCheckIn({
    ...validFacts,
    capacity: 500,
    occupancy: 497,
    groupSize: 4,
  });
  assert.equal(overflow.ok, false);
  if (!overflow.ok) {
    assert.equal(overflow.rejection.code, "CAPACITY_EXCEEDED");
  }
});
