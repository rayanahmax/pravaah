import { test } from "node:test";
import assert from "node:assert/strict";
import { maskIdNumber, sanitizePermitDetails } from "./permit-details.ts";

test("maskIdNumber keeps only the last four characters", () => {
  assert.equal(maskIdNumber("1234 5678 9012"), "XXXX-XXXX-9012");
  assert.equal(maskIdNumber("abcd9999"), "XXXX-XXXX-9999");
});

test("maskIdNumber returns null for empty or non-text input", () => {
  assert.equal(maskIdNumber(""), null);
  assert.equal(maskIdNumber("   "), null);
  assert.equal(maskIdNumber(null), null);
  assert.equal(maskIdNumber(12345), null); // numbers are not accepted as ID text
});

test("sanitize masks the lead and every member ID number", () => {
  const out = sanitizePermitDetails({
    lead: { idType: "Aadhaar", idNumber: "9876 5432 1098", nationality: "Indian", gender: "Male", dob: "1992-04-01" },
    members: [
      { name: "Rahul Sharma", age: 32, nationality: "Indian", idType: "Aadhaar", idNumber: "1111222233334444" },
      { name: "Ananya Sharma", age: 29, nationality: "Indian", idType: "Passport", idNumber: "Z9988776" },
    ],
  });

  assert.equal(out.lead.idNumberMasked, "XXXX-XXXX-1098");
  assert.equal(out.members[0].idNumberMasked, "XXXX-XXXX-4444");
  assert.equal(out.members[1].idNumberMasked, "XXXX-XXXX-8776");
  // The raw number never survives anywhere in the output.
  assert.doesNotMatch(JSON.stringify(out), /1111222233334444|9988776|9876/);
});

test("sanitize drops unknown keys so the JSONB cannot be a dumping ground", () => {
  const out = sanitizePermitDetails({
    lead: { idNumber: "12345678", aadhaarFull: "SECRET", bankAccount: "0000" },
    members: [{ name: "X", ssn: "SECRET" }],
    somethingElse: "injected",
  });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /SECRET|injected|aadhaarFull|bankAccount|ssn/);
  assert.equal(out.lead.idNumberMasked, "XXXX-XXXX-5678");
});

test("vehicle and equipment fields are gated by their booleans", () => {
  const noVehicle = sanitizePermitDetails({ vehicle: { required: false, registration: "MH12" } });
  assert.equal(noVehicle.vehicle.required, false);
  assert.equal(noVehicle.vehicle.registration, null);

  const withVehicle = sanitizePermitDetails({ vehicle: { required: true, registration: "MH-12-AB-3456", seatingCapacity: 6 } });
  assert.equal(withVehicle.vehicle.registration, "MH-12-AB-3456");
  assert.equal(withVehicle.vehicle.seatingCapacity, 6);

  const noCameras = sanitizePermitDetails({ equipment: { stillCamera: false, stillCount: 5 } });
  assert.equal(noCameras.equipment.stillCount, null);
});

test("invalid enum and date values are coerced to null, not stored raw", () => {
  const out = sanitizePermitDetails({
    lead: { gender: "alien", idType: "Magic", dob: "not-a-date" },
    visit: { validityFrom: "yesterday", timeSlot: "morning" },
  });
  assert.equal(out.lead.gender, null);
  assert.equal(out.lead.idType, null);
  assert.equal(out.lead.dob, null);
  assert.equal(out.visit.validityFrom, null);
  assert.equal(out.visit.timeSlot, "morning"); // free text is allowed
});

test("empty input yields a fully-shaped, empty default", () => {
  const out = sanitizePermitDetails(undefined);
  assert.deepEqual(out.members, []);
  assert.equal(out.lead.idNumberMasked, null);
  assert.equal(out.vehicle.required, false);
  assert.equal(out.equipment.stillCamera, false);
});

test("member list is bounded", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ name: `M${i}` }));
  const out = sanitizePermitDetails({ members: many });
  assert.equal(out.members.length, 50);
});
