/**
 * Emergency-contact extraction tests. The SOS dock is read-only over collected
 * data, so the only behaviour worth pinning is what it chooses to surface from a
 * JSONB column typed `unknown` — malformed rows must degrade to "nothing to show",
 * never to a crash or a dead link.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractEmergencyContacts,
  normalizePhone,
  telHref,
} from "./emergency-contacts.ts";

function permit(emergency_contact: unknown) {
  return { emergency_contact } as { emergency_contact: unknown };
}

test("normalizePhone keeps digits and a single leading plus", () => {
  assert.equal(normalizePhone("  +91 98765-43210 "), "+919876543210");
  assert.equal(normalizePhone("(080) 2222 3333"), "08022223333");
});

test("normalizePhone rejects a stray plus and non-strings", () => {
  assert.equal(normalizePhone("987+65"), "98765");
  assert.equal(normalizePhone("+"), null);
  assert.equal(normalizePhone("call me"), null);
  assert.equal(normalizePhone(42), null);
  assert.equal(normalizePhone(null), null);
});

test("telHref builds a dialable href or refuses", () => {
  assert.equal(telHref("+91 98765 43210"), "tel:+919876543210");
  assert.equal(telHref("no digits"), null);
});

test("a well-formed contact is surfaced with its parts", () => {
  const [contact] = extractEmergencyContacts([
    permit({ name: "Asha Rao", relationship: "Sister", phone: "98765 43210" }),
  ]);
  assert.deepEqual(contact, {
    name: "Asha Rao",
    relationship: "Sister",
    phone: "9876543210",
  });
});

test("name and relationship are optional; a phone alone is still dialable", () => {
  const [contact] = extractEmergencyContacts([permit({ phone: "9876543210" })]);
  assert.equal(contact.name, null);
  assert.equal(contact.relationship, null);
  assert.equal(contact.phone, "9876543210");
});

test("rows with no dialable phone are dropped", () => {
  const contacts = extractEmergencyContacts([
    permit({ name: "No Phone", relationship: "Friend" }),
    permit({ name: "Blank", phone: "   " }),
    permit({ name: "Garbage", phone: "abcdefgh" }),
    permit(null),
    permit("not an object"),
    permit(["array"]),
  ]);
  assert.deepEqual(contacts, []);
});

test("the same number in different punctuation is one contact, first seen wins", () => {
  const contacts = extractEmergencyContacts([
    permit({ name: "Asha (new)", relationship: "Sister", phone: "+91 98765-43210" }),
    permit({ name: "Asha (old)", relationship: "Sibling", phone: "+91 (98765) 43210" }),
  ]);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, "Asha (new)");
});

test("the list is capped so the panel never has to scroll to a number", () => {
  const permits = Array.from({ length: 6 }, (_, i) =>
    permit({ name: `C${i}`, phone: `900000000${i}` })
  );
  const contacts = extractEmergencyContacts(permits, 3);
  assert.equal(contacts.length, 3);
  assert.deepEqual(
    contacts.map((c) => c.phone),
    ["9000000000", "9000000001", "9000000002"]
  );
});

test("an empty permit list yields no contacts", () => {
  assert.deepEqual(extractEmergencyContacts([]), []);
});
