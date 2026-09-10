/**
 * Request validation tests. These cover the rules the API depends on for
 * "validate all requests" (docs/API.md rule 1), including the create-vs-patch
 * distinction that a shared parser can easily get wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCapacityUpdate,
  parseDestinationCreate,
  parseDestinationPatch,
  parseIsoDate,
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
  assert.equal(parseDestinationCreate({ name: "X", latitude: 28.6 }).ok, false); // not a whole number
  assert.equal(parseDestinationCreate({ name: "X", elevation: -5 }).ok, false);
  assert.equal(parseDestinationCreate({ name: "X", elevation: 3600 }).ok, true);
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
