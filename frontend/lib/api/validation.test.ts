/**
 * Request validation tests. These cover the rules the API depends on for
 * "validate all requests" (docs/API.md rule 1), including the create-vs-patch
 * distinction that a shared parser can easily get wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseAlertCreate,
  parseAlertPatch,
  parseCapacityUpdate,
  parseCheckIn,
  parseDestinationCreate,
  parseDestinationPatch,
  parseIsoDate,
  parseIsoTimestamp,
  parseQuotaUpdate,
  parseUuid,
} from "./validation.ts";

const UUID = "caa3533d-8c4a-4d49-b668-d71849bde560";

test("uuid parsing rejects anything that is not a uuid", () => {
  assert.equal(parseUuid(UUID).ok, true);
  assert.equal(parseUuid(UUID.toUpperCase()).ok, true);
  assert.equal(parseUuid("not-a-uuid").ok, false);
  assert.equal(parseUuid(`${UUID}; drop table`).ok, false);
  assert.equal(parseUuid("").ok, false);
  assert.equal(parseUuid(undefined).ok, false);
});

test("iso date rejects impossible dates, not just bad shapes", () => {
  assert.deepEqual(parseIsoDate("2026-09-10"), { ok: true, value: "2026-09-10" });
  assert.equal(parseIsoDate("2026-13-01").ok, false); // month 13
  assert.equal(parseIsoDate("2026-02-30").ok, false); // no 30 Feb
  assert.equal(parseIsoDate("2024-02-29").ok, true); // leap day
  assert.equal(parseIsoDate("10-09-2026").ok, false);
});

test("destination create requires a name", () => {
  assert.equal(parseDestinationCreate({}).ok, false);
  assert.equal(parseDestinationCreate({ name: "   " }).ok, false);
  assert.equal(parseDestinationCreate({ name: "Valley of Flowers" }).ok, true);
});

test("destination patch accepts partial updates without a name", () => {
  const result = parseDestinationPatch({ access_status: "CLOSED" });
  assert.deepEqual(result, { ok: true, value: { access_status: "CLOSED" } });

  assert.equal(parseDestinationPatch({}).ok, false);
  assert.equal(parseDestinationPatch({ access_status: "MAYBE" }).ok, false);
});

test("unknown fields are rejected on both create and patch", () => {
  const create = parseDestinationCreate({ name: "X", role: "DEPARTMENT_OPERATOR" });
  assert.equal(create.ok, false);
  assert.equal((create as { errors: { field: string }[] }).errors[0].field, "role");

  assert.equal(parseDestinationPatch({ maximum_capacity: 500 }).ok, false);
});

test("numeric destination fields are range checked", () => {
  assert.equal(parseDestinationCreate({ name: "X", latitude: 91 }).ok, false);
  assert.equal(parseDestinationCreate({ name: "X", elevation: -5 }).ok, false);
  assert.equal(parseDestinationCreate({ name: "X", elevation: 3600 }).ok, true);

  // This test previously asserted `latitude: 28.6` was REJECTED with the comment
  // "not a whole number". That was deliberate at the time but wrong: latitude and
  // longitude are NUMERIC in the schema and in docs/DATABASE.md, and 28.6 is a
  // real coordinate. Integer-only validation made a precise position
  // inexpressible, which Phase 15 weather cannot work with — whole degrees are
  // ~111 km apart. Corrected rather than worked around.
  assert.equal(parseDestinationCreate({ name: "X", latitude: 28.6, longitude: 77.209 }).ok, true);
  assert.equal(parseDestinationCreate({ name: "X", latitude: -12.9791 }).ok, true);
  assert.equal(parseDestinationCreate({ name: "X", longitude: 181 }).ok, false);
  // Precision is capped: six decimals is already ~0.1 m.
  assert.equal(parseDestinationCreate({ name: "X", latitude: 12.1234567 }).ok, false);
  // Elevation stays a whole number; the cap is per-field, not global.
  assert.equal(parseDestinationCreate({ name: "X", elevation: 1200.5 }).ok, false);
});

test("capacity update accepts exactly one bounded integer", () => {
  assert.deepEqual(parseCapacityUpdate({ capacity: 440 }), { ok: true, value: { capacity: 440 } });
  assert.equal(parseCapacityUpdate({ capacity: 0 }).ok, true); // zero is meaningful: closed
  assert.equal(parseCapacityUpdate({ capacity: -1 }).ok, false);
  assert.equal(parseCapacityUpdate({ capacity: "440" }).ok, false);
  assert.equal(parseCapacityUpdate({ capacity: 44.5 }).ok, false);
  assert.equal(parseCapacityUpdate({ capacity: 440, occupancy: 9 }).ok, false);
  assert.equal(parseCapacityUpdate(null).ok, false);
});

test("quota update needs both a real date and an integer", () => {
  assert.deepEqual(parseQuotaUpdate({ date: "2026-09-10", quota: 500 }), {
    ok: true,
    value: { date: "2026-09-10", quota: 500 },
  });
  assert.equal(parseQuotaUpdate({ quota: 500 }).ok, false);
  assert.equal(parseQuotaUpdate({ date: "2026-09-10" }).ok, false);
  assert.equal(parseQuotaUpdate({ date: "2026-09-10", quota: 50.5 }).ok, false);
});

test("checkin parse accepts qr_token and rejects bad shapes or extra fields", () => {
  assert.deepEqual(parseCheckIn({ qr_token: "abc-123-xyz" }), {
    ok: true,
    value: { qr_token: "abc-123-xyz" },
  });
  assert.equal(parseCheckIn({}).ok, false);
  assert.equal(parseCheckIn({ qr_token: "   " }).ok, false);
  assert.equal(parseCheckIn({ qr_token: 12345 }).ok, false);
  assert.equal(parseCheckIn({ qr_token: "abc", extra: "field" }).ok, false);
});

test("a timestamp must carry an explicit zone", () => {
  assert.equal(parseIsoTimestamp("2026-09-11T18:00").ok, false);
  assert.equal(parseIsoTimestamp("2026-09-11").ok, false);
  assert.equal(parseIsoTimestamp("not-a-date").ok, false);
  assert.equal(parseIsoTimestamp(1757594400000).ok, false);

  // Normalised to UTC so what the database stores is unambiguous.
  assert.deepEqual(parseIsoTimestamp("2026-09-11T18:00+05:30"), {
    ok: true,
    value: "2026-09-11T12:30:00.000Z",
  });
  assert.equal(parseIsoTimestamp("2026-09-11T12:30:00Z").ok, true);
});

test("alert create accepts a full or open-ended window", () => {
  const open = parseAlertCreate({
    title: "Festival crowding expected",
    message: "Narrow entry lane is busy between 10:00 and 16:00.",
    severity: "CAUTION",
  });
  assert.equal(open.ok, true);
  assert.deepEqual((open as { value: unknown }).value, {
    title: "Festival crowding expected",
    message: "Narrow entry lane is busy between 10:00 and 16:00.",
    severity: "CAUTION",
    starts_at: null,
    ends_at: null,
  });

  const bounded = parseAlertCreate({
    title: "Trail maintenance",
    message: "Rope bridge out of service.",
    severity: "WARNING",
    starts_at: "2026-09-12T04:00:00.000Z",
    ends_at: "2026-09-14T10:00:00.000Z",
  });
  assert.equal(bounded.ok, true);
});

test("alert create refuses an inverted or zero-length window", () => {
  // Same rule as alerts_window_check in migration 016; enforced here first so the
  // operator gets a readable 400 rather than a constraint violation.
  assert.equal(
    parseAlertCreate({
      title: "x",
      message: "y",
      severity: "INFO",
      starts_at: "2026-09-12T00:00:00Z",
      ends_at: "2026-09-11T00:00:00Z",
    }).ok,
    false
  );
  assert.equal(
    parseAlertCreate({
      title: "x",
      message: "y",
      severity: "INFO",
      starts_at: "2026-09-12T00:00:00Z",
      ends_at: "2026-09-12T00:00:00Z",
    }).ok,
    false
  );
});

test("alert create requires title, message and a known severity", () => {
  assert.equal(parseAlertCreate({ message: "y", severity: "INFO" }).ok, false);
  assert.equal(parseAlertCreate({ title: "x", severity: "INFO" }).ok, false);
  assert.equal(parseAlertCreate({ title: "x", message: "y", severity: "URGENT" }).ok, false);
  assert.equal(parseAlertCreate({ title: "x", message: "y" }).ok, false);
  assert.equal(parseAlertCreate(null).ok, false);
});

test("alert create cannot be used to set active or authorship", () => {
  // `active` is not a create field: a new notice is live, and accepting the flag
  // would let a caller publish a row that starts switched off. created_by comes
  // from the authenticated profile, never the body.
  assert.equal(
    parseAlertCreate({ title: "x", message: "y", severity: "INFO", active: false }).ok,
    false
  );
  assert.equal(
    parseAlertCreate({
      title: "x",
      message: "y",
      severity: "INFO",
      created_by: "caa3533d-8c4a-4d49-b668-d71849bde560",
    }).ok,
    false
  );
});

test("alert patch accepts only the active flag", () => {
  assert.deepEqual(parseAlertPatch({ active: false }), { ok: true, value: { active: false } });
  assert.deepEqual(parseAlertPatch({ active: true }), { ok: true, value: { active: true } });
  assert.equal(parseAlertPatch({ active: "false" }).ok, false);
  assert.equal(parseAlertPatch({}).ok, false);
  assert.equal(parseAlertPatch(null).ok, false);

  // PRD §16 has no edit path: a published notice cannot be rewritten in place.
  assert.equal(parseAlertPatch({ active: true, title: "hijack" }).ok, false);
  assert.equal(parseAlertPatch({ title: "hijack" }).ok, false);
  assert.equal(parseAlertPatch({ severity: "CRITICAL" }).ok, false);
});
