/**
 * Unit tests for checkout-rules.ts — pure, no I/O.
 *
 * Covers every branch in evaluateCheckOut and all ordered validation stops.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCheckOut, type CheckOutFacts } from "./checkout-rules.ts";

const PERMIT_ID = "permit-abc";
const DEST_ID = "dest-xyz";

/** Minimal passing facts — CHECKED_IN permit with an active check-in. */
function baseFacts(): CheckOutFacts {
  return {
    qrToken: "valid-qr-token",
    permit: {
      id: PERMIT_ID,
      destination_id: DEST_ID,
      visit_date: "2026-09-11",
      group_size: 4,
      status: "CHECKED_IN",
    },
    hasActiveCheckIn: true,
    alreadyCheckedOut: false,
  };
}

// ── Happy path ────────────────────────────────────────────────────────────────

test("evaluateCheckOut accepts a valid CHECKED_IN permit with active check-in", () => {
  assert.equal(evaluateCheckOut(baseFacts()).ok, true);
});

// ── QR token validation ───────────────────────────────────────────────────────

test("evaluateCheckOut rejects null qrToken", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), qrToken: null });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.code, "VALIDATION_ERROR");
});

test("evaluateCheckOut rejects empty string qrToken", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), qrToken: "" });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.code, "VALIDATION_ERROR");
});

test("evaluateCheckOut rejects whitespace-only qrToken", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), qrToken: "   " });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.code, "VALIDATION_ERROR");
});

// ── Permit lookup ─────────────────────────────────────────────────────────────

test("evaluateCheckOut rejects when permit is null (invalid token)", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), permit: null });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.code, "NOT_FOUND");
});

// ── Duplicate checkout prevention ─────────────────────────────────────────────

test("evaluateCheckOut rejects when alreadyCheckedOut flag is true", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), alreadyCheckedOut: true });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.rejection.code, "INVALID_STATE");
});

test("evaluateCheckOut rejects when permit status is already COMPLETED", () => {
  const facts = baseFacts();
  facts.permit!.status = "COMPLETED";
  const outcome = evaluateCheckOut(facts);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.rejection.code, "INVALID_STATE");
    assert.match(outcome.rejection.message, /already been checked out/);
  }
});

// ── Wrong permit status ───────────────────────────────────────────────────────

test("evaluateCheckOut rejects all non-CHECKED_IN statuses", () => {
  const invalid = ["PENDING", "APPROVED", "REJECTED", "RESTRICTED", "CANCELLED", "EXPIRED"] as const;
  for (const status of invalid) {
    const facts = baseFacts();
    facts.permit!.status = status;
    const outcome = evaluateCheckOut(facts);
    assert.equal(outcome.ok, false, `status ${status} should be rejected`);
    if (!outcome.ok) {
      assert.equal(outcome.rejection.code, "INVALID_STATE");
      assert.match(outcome.rejection.message, /CHECKED_IN first/);
    }
  }
});

// ── Missing active check-in ───────────────────────────────────────────────────

test("evaluateCheckOut rejects when CHECKED_IN permit has no active check-in row", () => {
  const outcome = evaluateCheckOut({ ...baseFacts(), hasActiveCheckIn: false });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.rejection.code, "INVALID_STATE");
    assert.match(outcome.rejection.message, /No active check-in/);
  }
});

// ── Ordering: duplicate check runs before status check ───────────────────────

test("duplicate checkout message is shown even when status has not advanced to COMPLETED yet", () => {
  // In a race, the flag may be true while status is still CHECKED_IN.
  const facts = baseFacts(); // status = CHECKED_IN
  facts.alreadyCheckedOut = true;
  const outcome = evaluateCheckOut(facts);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.rejection.code, "INVALID_STATE");
    assert.match(outcome.rejection.message, /already been checked out/);
  }
});
