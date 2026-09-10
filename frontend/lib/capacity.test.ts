/**
 * Unit tests required by docs/DEVELOPMENT_PLAN.md Phase 4:
 * "Unit tests for 70%, 70.1%, 90%, 90.1%, 100%, 100.1%".
 *
 * Run with `npm test`. Uses Node's built-in runner, which strips TypeScript
 * natively on this toolchain — no test framework dependency is added.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyOverride,
  assertCapacityInput,
  computeStatus,
  deriveOccupancy,
  evaluateCapacity,
  DEFAULT_THRESHOLDS,
} from "./capacity.ts";

/** Capacity of 1000 makes each percentage an exact integer or one-decimal value. */
const CAP = 1000;
const at = (percent: number) => Math.round((CAP * percent) / 100);

test("PRD §6 boundary sweep", () => {
  const cases: Array<[number, string]> = [
    [0, "AVAILABLE"],
    [35, "AVAILABLE"],
    [70, "AVAILABLE"], //        0-70%            -> AVAILABLE
    [70.1, "NEAR_CAPACITY"], //  >70-90%          -> NEAR_CAPACITY
    [85, "NEAR_CAPACITY"],
    [90, "NEAR_CAPACITY"], //   >70-90% inclusive -> NEAR_CAPACITY
    [90.1, "RESTRICTED"], //    >90-100%          -> RESTRICTED
    [97.5, "RESTRICTED"], //    the PRD §16 demo value
    [100, "CLOSED"], //         >=100%            -> CLOSED
    [100.1, "CLOSED"],
    [140, "CLOSED"],
  ];

  for (const [percent, expected] of cases) {
    assert.equal(
      computeStatus((at(percent) / CAP) * 100, DEFAULT_THRESHOLDS),
      expected,
      `${percent}% (${at(percent)}/${CAP}) should be ${expected}`
    );
  }
});

test("band edges do not drift with a different capacity", () => {
  // 425/500 is exactly 85%, the documented demonstration figure.
  const r = evaluateCapacity({ occupancy: 425, capacity: 500 });
  assert.equal(r.percentage, 85);
  assert.equal(r.remaining, 75);
  assert.equal(r.status, "NEAR_CAPACITY");

  // Same proportion at a different scale must agree.
  assert.equal(
    evaluateCapacity({ occupancy: 850, capacity: 1000 }).status,
    "NEAR_CAPACITY"
  );
});

test("PRD §16 demo: 429 of 440 is 97.5% and RESTRICTED", () => {
  const r = evaluateCapacity({ occupancy: 429, capacity: 440 });
  assert.equal(r.percentage, 97.5);
  assert.equal(r.status, "RESTRICTED");
});

test("rounding is display-only and never relaxes a boundary", () => {
  // 70.04% displays as 70 but must still leave the AVAILABLE band.
  const r = evaluateCapacity({ occupancy: 1751, capacity: 2500 });
  assert.equal(r.percentage, 70);
  assert.equal(r.computedStatus, "NEAR_CAPACITY");
});

test("capacity zero is treated as full, not as a division by zero", () => {
  const r = evaluateCapacity({ occupancy: 0, capacity: 0 });
  assert.equal(r.percentage, 100);
  assert.equal(r.status, "CLOSED");
  assert.equal(r.remaining, 0);
});

test("remaining never goes negative when over capacity", () => {
  const r = evaluateCapacity({ occupancy: 600, capacity: 500 });
  assert.equal(r.remaining, 0);
  assert.equal(r.status, "CLOSED");
});

test("custom thresholds from capacity_configurations are honoured", () => {
  const thresholds = { available: 50, nearCapacity: 75, restricted: 90 };
  assert.equal(computeStatus(50, thresholds), "AVAILABLE");
  assert.equal(computeStatus(50.1, thresholds), "NEAR_CAPACITY");
  assert.equal(computeStatus(75, thresholds), "NEAR_CAPACITY");
  assert.equal(computeStatus(75.1, thresholds), "RESTRICTED");
  assert.equal(computeStatus(90, thresholds), "CLOSED");
});

test("department override wins over the computed status", () => {
  const r = evaluateCapacity({ occupancy: 10, capacity: 500, override: "CLOSED" });
  assert.equal(r.computedStatus, "AVAILABLE");
  assert.equal(r.status, "CLOSED");
  assert.equal(r.overridden, true);

  assert.equal(
    evaluateCapacity({ occupancy: 10, capacity: 500, override: "OPEN" }).status,
    "AVAILABLE"
  );
});

test("override never relaxes a stricter computed status", () => {
  const { status, overridden } = applyOverride("CLOSED", "RESTRICTED");
  assert.equal(status, "CLOSED");
  assert.equal(overridden, false);

  assert.equal(applyOverride("AVAILABLE", "RESTRICTED").status, "RESTRICTED");
  assert.equal(applyOverride("AVAILABLE", "OPEN").status, "AVAILABLE");
});

test("input validation rejects values that would mask a real problem", () => {
  assert.throws(() => assertCapacityInput({ occupancy: -1, capacity: 100 }), RangeError);
  assert.throws(() => assertCapacityInput({ occupancy: 1, capacity: -100 }), RangeError);
  assert.throws(
    () => assertCapacityInput({ occupancy: Number.NaN, capacity: 100 }),
    TypeError
  );
  assert.throws(
    () => evaluateCapacity({ occupancy: 5, capacity: Number.POSITIVE_INFINITY }),
    TypeError
  );
});

test("occupancy is active check-ins minus check-outs (PRD §7)", () => {
  const checkIns = [
    { permit_id: "a", group_size: 4 },
    { permit_id: "b", group_size: 2 },
    { permit_id: "c", group_size: 6 },
  ];

  assert.equal(deriveOccupancy(checkIns, []), 12);
  assert.equal(deriveOccupancy(checkIns, [{ permit_id: "b" }]), 10);
  assert.equal(deriveOccupancy(checkIns, [{ permit_id: "a" }, { permit_id: "c" }]), 2);
  assert.equal(deriveOccupancy([], [{ permit_id: "a" }]), 0);

  // A second check-out for the same permit must not subtract twice.
  assert.equal(
    deriveOccupancy(checkIns, [{ permit_id: "a" }, { permit_id: "a" }]),
    8
  );
});
