/**
 * Quota engine tests. The database-backed cases — uniqueness of
 * (destination_id, quota_date), the CHECK constraints from migration 004, and the
 * HTTP authorization paths — cannot be exercised here because this module is
 * deliberately I/O-free; they are covered by the endpoint exercise and the SQL
 * notes in lib/quota.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canAdmitGroup,
  evaluateQuota,
  isQuotaReductionValid,
} from "./quota.ts";

test("remaining quota is quota minus visitors admitted", () => {
  const state = evaluateQuota({ quota: 500, visitorsAdmitted: 430 });
  assert.deepEqual(state, { quota: 500, visitorsAdmitted: 430, remaining: 70 });
});

test("a day with no quota row is unconfigured, not zero-quota", () => {
  const state = evaluateQuota({ quota: null, visitorsAdmitted: null });
  assert.equal(state.quota, null);
  assert.equal(state.visitorsAdmitted, null);
  // Fails closed: nothing may be admitted against a day nobody declared.
  assert.equal(state.remaining, 0);
  assert.equal(canAdmitGroup(state, 1), false);
});

test("a null admitted count means nobody has entered yet", () => {
  assert.deepEqual(evaluateQuota({ quota: 100, visitorsAdmitted: null }), {
    quota: 100,
    visitorsAdmitted: 0,
    remaining: 100,
  });
});

test("quota exactly exhausted admits nobody more", () => {
  const state = evaluateQuota({ quota: 500, visitorsAdmitted: 500 });
  assert.equal(state.remaining, 0);
  assert.equal(canAdmitGroup(state, 1), false);

  // The group that fills the day exactly is still allowed.
  const partlyUsed = evaluateQuota({ quota: 500, visitorsAdmitted: 496 });
  assert.equal(canAdmitGroup(partlyUsed, 4), true);
  assert.equal(canAdmitGroup(partlyUsed, 5), false);
});

test("a deliberate quota of zero closes the day", () => {
  const state = evaluateQuota({ quota: 0, visitorsAdmitted: 0 });
  assert.equal(state.quota, 0);
  assert.equal(state.remaining, 0);
  assert.equal(canAdmitGroup(state, 1), false);
});

test("remaining never goes negative for an over-admitted legacy row", () => {
  // Only reachable before migration 004's CHECK existed; the clamped remainder
  // keeps a caller from comparing against a negative number.
  const state = evaluateQuota({ quota: 100, visitorsAdmitted: 140 });
  assert.equal(state.remaining, 0);
  assert.equal(canAdmitGroup(state, 1), false);
});

test("group size must be a real positive whole number", () => {
  const state = evaluateQuota({ quota: 500, visitorsAdmitted: 0 });
  assert.equal(canAdmitGroup(state, 0), false);
  assert.equal(canAdmitGroup(state, 4), true);
  assert.throws(() => canAdmitGroup(state, -1), RangeError);
  assert.throws(() => canAdmitGroup(state, 2.5), TypeError);
  assert.throws(() => canAdmitGroup(state, Number.NaN), TypeError);
});

test("quota inputs are validated rather than coerced", () => {
  assert.throws(() => evaluateQuota({ quota: -5, visitorsAdmitted: 0 }), RangeError);
  assert.throws(() => evaluateQuota({ quota: 100, visitorsAdmitted: -1 }), RangeError);
  assert.throws(() => evaluateQuota({ quota: 99.5, visitorsAdmitted: 0 }), TypeError);
});

test("reducing a quota below admitted visitors is refused", () => {
  assert.equal(isQuotaReductionValid(500, 430), true);
  assert.equal(isQuotaReductionValid(430, 430), true); // equal is allowed
  assert.equal(isQuotaReductionValid(429, 430), false);
  assert.equal(isQuotaReductionValid(0, null), true); // nothing admitted yet
  assert.equal(isQuotaReductionValid(0, 1), false);
});

test("capacity and quota stay separate quantities", () => {
  // Same destination, both limits active: the tighter one governs admission, and
  // neither calculation reads the other.
  const quota = evaluateQuota({ quota: 500, visitorsAdmitted: 496 });
  assert.equal(canAdmitGroup(quota, 4), true);

  const exhaustedQuotaWithRoomInside = evaluateQuota({ quota: 500, visitorsAdmitted: 500 });
  assert.equal(canAdmitGroup(exhaustedQuotaWithRoomInside, 1), false);
});
