/**
 * Alert lifecycle tests (Phase 16). Fixed instants throughout — the rules take
 * `now` as an argument precisely so expiry can be tested without waiting for it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERT_STATES,
  alertState,
  isPubliclyVisible,
  isWindowValid,
} from "./alert-rules.ts";

const NOW = new Date("2026-09-11T12:00:00Z");

function windowOf(overrides: Partial<{ active: boolean; starts_at: string | null; ends_at: string | null }> = {}) {
  return { active: true, starts_at: null, ends_at: null, ...overrides };
}

test("an open-ended active alert is live", () => {
  assert.equal(alertState(windowOf(), NOW), "ACTIVE");
  assert.equal(isPubliclyVisible(windowOf(), NOW), true);
});

test("deactivation wins over an open window", () => {
  // The row's window is currently open. If `active` were checked last, turning a
  // live alert off would relabel it ACTIVE for readers until the window closed.
  const open = windowOf({
    active: false,
    starts_at: "2026-09-11T00:00:00Z",
    ends_at: "2026-09-12T00:00:00Z",
  });
  assert.equal(alertState(open, NOW), "INACTIVE");
  assert.equal(isPubliclyVisible(open, NOW), false);
});

test("a future start is scheduled, not live", () => {
  const scheduled = windowOf({ starts_at: "2026-09-11T18:00:00Z" });
  assert.equal(alertState(scheduled, NOW), "SCHEDULED");
  assert.equal(isPubliclyVisible(scheduled, NOW), false);
});

test("a past end is expired even though the row is still active", () => {
  // Expiry is read-side only: nobody flips the flag, the row simply stops
  // displaying. This is the behaviour PRD §16 calls "expiry".
  const expired = windowOf({ ends_at: "2026-09-11T09:30:00Z" });
  assert.equal(alertState(expired, NOW), "EXPIRED");
  assert.equal(isPubliclyVisible(expired, NOW), false);
});

test("a window enclosing now is live at both inclusive bounds", () => {
  assert.equal(alertState(windowOf({ starts_at: "2026-09-11T12:00:00Z" }), NOW), "ACTIVE");
  assert.equal(alertState(windowOf({ ends_at: "2026-09-11T12:00:00Z" }), NOW), "ACTIVE");
});

test("a window entirely in the past is expired, not scheduled", () => {
  const past = windowOf({
    starts_at: "2026-09-01T00:00:00Z",
    ends_at: "2026-09-02T00:00:00Z",
  });
  assert.equal(alertState(past, NOW), "EXPIRED");
});

test("an unparseable bound is treated as absent rather than hiding the alert", () => {
  // A malformed timestamp must not make an alert permanently invisible or throw.
  assert.equal(alertState(windowOf({ starts_at: "not-a-date" }), NOW), "ACTIVE");
  assert.equal(alertState(windowOf({ ends_at: "not-a-date" }), NOW), "ACTIVE");
});

test("every lifecycle state is reachable", () => {
  const seen = new Set([
    alertState(windowOf(), NOW),
    alertState(windowOf({ active: false }), NOW),
    alertState(windowOf({ starts_at: "2027-01-01T00:00:00Z" }), NOW),
    alertState(windowOf({ ends_at: "2020-01-01T00:00:00Z" }), NOW),
  ]);
  assert.equal(seen.size, ALERT_STATES.length);
  assert.deepEqual([...seen].sort(), [...ALERT_STATES].sort());
});

test("an open-ended or null-bounded window is always valid", () => {
  assert.equal(isWindowValid(null, null), true);
  assert.equal(isWindowValid("2026-09-11T00:00:00Z", null), true);
  assert.equal(isWindowValid(null, "2026-09-11T00:00:00Z"), true);
});

test("a window ending after it starts is valid", () => {
  assert.equal(isWindowValid("2026-09-11T00:00:00Z", "2026-09-11T23:59:00Z"), true);
});

test("a zero-length or inverted window is refused", () => {
  // A zero-length window would never display, so accepting it would let an
  // operator publish a notice nobody can ever see.
  const same = "2026-09-11T12:00:00Z";
  assert.equal(isWindowValid(same, same), false);
  assert.equal(isWindowValid("2026-09-12T00:00:00Z", "2026-09-11T00:00:00Z"), false);
});

test("format rejection is the parser's job, not this rule's", () => {
  // isWindowValid compares two bounds. With one side absent there is no ordering
  // to conflict, so an unparseable value alongside a null is not a window
  // problem — parseIsoTimestamp rejects that shape before it ever gets here.
  assert.equal(isWindowValid("garbage", null), true);
  assert.equal(isWindowValid(null, "garbage"), true);

  // When both are present, an unparseable value cannot be ordered, so it is
  // refused rather than treated as valid.
  assert.equal(isWindowValid("garbage", "2026-09-11T00:00:00Z"), false);
  assert.equal(isWindowValid("2026-09-11T00:00:00Z", "garbage"), false);
});

test("a scheduled alert is not publicly visible but an expired one is distinguishable", () => {
  const scheduled = windowOf({ starts_at: "2027-01-01T00:00:00Z" });
  const expired = windowOf({ ends_at: "2020-01-01T00:00:00Z" });
  assert.equal(isPubliclyVisible(scheduled, NOW), false);
  assert.equal(isPubliclyVisible(expired, NOW), false);
  assert.notEqual(alertState(scheduled, NOW), alertState(expired, NOW));
});
