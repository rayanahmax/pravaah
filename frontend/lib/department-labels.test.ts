/**
 * Severity ladder tests (PRD §16, migration 015).
 *
 * The guard here is narrow on purpose. Before migration 015, `severityTone`
 * mapped WARNING and CRITICAL to the same "restricted" tone, so a console badge
 * could not distinguish a hazard from a danger — and nothing tested it, so the
 * collapse survived review. These assertions exist so it cannot come back
 * unnoticed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERT_SEVERITIES,
  severityRank,
  severityTone,
  type AlertSeverity,
} from "./department-labels.ts";

test("PRD §16 lists exactly the four severities the database now allows", () => {
  // Mirrors alerts_severity_check in migration 015. If the two ever disagree,
  // this is the test that fails first rather than an operator's INSERT.
  assert.deepEqual([...ALERT_SEVERITIES], ["INFO", "CAUTION", "WARNING", "CRITICAL"]);
});

test("every severity maps to a distinct badge tone", () => {
  const tones = ALERT_SEVERITIES.map(severityTone);
  assert.equal(new Set(tones).size, ALERT_SEVERITIES.length, `tones collided: ${tones.join(", ")}`);
});

test("severityTone returns a tone for every level rather than falling through", () => {
  for (const severity of ALERT_SEVERITIES) {
    const tone = severityTone(severity);
    assert.equal(typeof tone, "string");
    assert.notEqual(tone, "default", `${severity} rendered as the unstyled default`);
  }
});

test("rank increases with severity in the documented order", () => {
  const ranks = ALERT_SEVERITIES.map(severityRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(new Set(ranks).size, ranks.length, "two levels shared a rank");
});

test("the ladder escalates from informational to danger", () => {
  assert.ok(severityRank("CRITICAL") > severityRank("WARNING"));
  assert.ok(severityRank("WARNING") > severityRank("CAUTION"));
  assert.ok(severityRank("CAUTION") > severityRank("INFO"));
});

test("an unknown severity is a compile-time error, not a silent default", () => {
  // Record<AlertSeverity, BadgeTone> in the implementation means a missing entry
  // fails typecheck. This asserts the runtime shape stays total for the union.
  const all: AlertSeverity[] = ["INFO", "CAUTION", "WARNING", "CRITICAL"];
  assert.deepEqual(all, [...ALERT_SEVERITIES]);
});
