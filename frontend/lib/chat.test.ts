/**
 * Tourist assistant tests. The assistant's whole contract is "restate the facts,
 * refuse the things AI must not do", so these pin both halves: correct grounded
 * answers, and the weather/medical/permit-decision boundaries that must hold no
 * matter how the question is phrased.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectIntent,
  groundingPayload,
  matchDestinations,
  parseChatRequest,
  renderGrounded,
  type GroundedDestination,
  type GroundingContext,
} from "./chat.ts";

function dest(overrides: Partial<GroundedDestination> & { name: string }): GroundedDestination {
  return {
    status: "AVAILABLE",
    remaining: 120,
    occupancy: 80,
    capacity: 200,
    accessStatus: "OPEN",
    alerts: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<GroundingContext> = {}): GroundingContext {
  return {
    destinations: [
      dest({ name: "Valley of Flowers", remaining: 40, capacity: 200, status: "NEAR_CAPACITY" }),
      dest({ name: "Riverside Camp", status: "CLOSED", remaining: 0 }),
    ],
    permits: [],
    signedIn: false,
    ...overrides,
  };
}

/* ---- parsing ---- */

test("parseChatRequest accepts a message and trims history", () => {
  const result = parseChatRequest({
    message: "  is it open?  ",
    history: [
      { role: "user", content: "hi" },
      { role: "system", content: "nope" },
      { role: "assistant", content: "hello" },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.message, "is it open?");
    assert.deepEqual(result.history, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  }
});

test("parseChatRequest rejects empty or non-object bodies", () => {
  assert.equal(parseChatRequest(null).ok, false);
  assert.equal(parseChatRequest([]).ok, false);
  assert.equal(parseChatRequest({ message: "   " }).ok, false);
  assert.equal(parseChatRequest({}).ok, false);
});

test("parseChatRequest caps an over-long message", () => {
  const long = "a".repeat(5000);
  const result = parseChatRequest({ message: long });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.message.length, 800);
});

/* ---- intent ---- */

test("intent detects each supported topic", () => {
  assert.equal(detectIntent("how do I get a permit"), "howto");
  assert.equal(detectIntent("is valley of flowers full right now"), "capacity");
  assert.equal(detectIntent("any alerts or hazards today"), "alerts");
  assert.equal(detectIntent("what is the status of my permit"), "status");
  assert.equal(detectIntent("will it rain tomorrow"), "weather");
  assert.equal(detectIntent("can I take my allergy medicine"), "medical");
  assert.equal(detectIntent("hello there"), "greeting");
  assert.equal(detectIntent("tell me something random"), "unknown");
});

test("medical outranks capacity when both appear", () => {
  // "is it safe to be at a full site with my medication" must not be answered as a
  // capacity question that quietly implies a health opinion.
  assert.equal(detectIntent("is the full site safe for my medication"), "medical");
});

/* ---- destination matching ---- */

test("a named destination matches just that one", () => {
  const matches = matchDestinations("how full is riverside camp", ctx().destinations);
  assert.deepEqual(matches.map((d) => d.name), ["Riverside Camp"]);
});

test("an unnamed question matches every destination for a general answer", () => {
  const matches = matchDestinations("is it open", ctx().destinations);
  assert.equal(matches.length, 2);
});

/* ---- deterministic answers ---- */

test("capacity answer states the computed band and remaining places", () => {
  const answer = renderGrounded("how full is valley of flowers", ctx());
  assert.match(answer, /Near capacity/);
  assert.match(answer, /40 of 200/);
  assert.match(answer, /decided by the department/);
});

test("closed destination reads as closed, not as available", () => {
  const answer = renderGrounded("is riverside camp open", ctx());
  assert.match(answer, /closed/i);
});

test("alerts are listed when present and cleared when not", () => {
  const withAlert = ctx({
    destinations: [dest({ name: "Summit Ridge", alerts: [{ title: "Trail slide", severity: "WARNING" }] })],
  });
  assert.match(renderGrounded("any alerts at summit ridge", withAlert), /\[WARNING\] Trail slide/);
  assert.match(renderGrounded("is it safe here", ctx()), /no active safety alerts/i);
});

test("permit status asks a signed-out visitor to sign in", () => {
  assert.match(renderGrounded("status of my permit", ctx()), /Sign in/i);
});

test("permit status lists the caller's own permits when signed in", () => {
  const signedIn = ctx({
    signedIn: true,
    permits: [
      { reference: "PRM-ABC123", destination: "Valley of Flowers", status: "APPROVED", visitDate: "2026-09-20" },
    ],
  });
  const answer = renderGrounded("status of my permit", signedIn);
  assert.match(answer, /PRM-ABC123/);
  assert.match(answer, /Approved/);
  assert.match(answer, /department makes the approve\/reject decision/);
});

test("weather and medical are refused, never answered", () => {
  const weather = renderGrounded("will it rain tomorrow", ctx());
  assert.match(weather, /don.*forecast weather/i);
  const medical = renderGrounded("should I take this medicine", ctx());
  assert.match(medical, /can.t give medical/i);
  assert.match(medical, /SOS/);
});

/* ---- payload for the provider ---- */

test("grounding payload omits raw PII and keeps the fact fields", () => {
  const payload = groundingPayload(ctx({ signedIn: true })) as {
    destinations: unknown[];
    my_permits: unknown[];
    signed_in: boolean;
  };
  assert.equal(payload.signed_in, true);
  assert.equal(payload.destinations.length, 2);
  assert.equal(payload.my_permits.length, 0);
});
