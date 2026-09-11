/**
 * Permit details — the richer, government-style eco-tourism payload stored in
 * permits.permit_details (JSONB).
 *
 * This module is pure and dependency-free (no I/O, no clock) so it is directly
 * testable and is the single place the shape and its privacy rules live. It is
 * used SERVER-SIDE to sanitize the client's submission before it reaches the
 * database:
 *
 *  - WHITELIST: only known fields survive. Anything else the browser sends is
 *    dropped, so the JSONB column can never become a dumping ground for
 *    arbitrary or sensitive data the form did not ask for.
 *  - MASK: government ID numbers are reduced to their last four characters. The
 *    full number is never stored, matching the "realistic but masked" decision
 *    and keeping the permit honest without hoarding identifiers.
 *  - No Aadhaar/PAN/passport/bank/medical fields beyond the masked ID reference
 *    are ever collected (privacy guidance; AGENTS rule 11 keeps PII out of QRs).
 *
 * Capacity and quota remain driven by permits.group_size on the server; nothing
 * in this payload is authoritative for admission.
 */

export const ID_TYPES = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "Other"] as const;
export type PermitIdType = (typeof ID_TYPES)[number];

export const GENDERS = ["Female", "Male", "Other", "Prefer not to say"] as const;
export type PermitGender = (typeof GENDERS)[number];

export type PermitGroupMember = {
  name: string;
  age: number | null;
  nationality: string | null;
  idType: PermitIdType | null;
  idNumberMasked: string | null;
};

export type PermitLeadVisitor = {
  nationality: string | null;
  gender: PermitGender | null;
  dob: string | null;
  age: number | null;
  idType: PermitIdType | null;
  idNumberMasked: string | null;
};

export type PermitVisitDetails = {
  zone: string | null;
  entryGate: string | null;
  exitGate: string | null;
  timeSlot: string | null;
  expectedExit: string | null;
  validityFrom: string | null;
  validityTo: string | null;
  route: string | null;
};

export type PermitVehicleDetails = {
  required: boolean;
  type: string | null;
  registration: string | null;
  seatingCapacity: number | null;
  driver: string | null;
  guide: string | null;
};

export type PermitEquipmentDetails = {
  stillCamera: boolean;
  stillCount: number | null;
  videoCamera: boolean;
  videoCount: number | null;
  special: string | null;
};

/** The stored (sanitized + masked) shape. */
export type PermitDetails = {
  lead: PermitLeadVisitor;
  members: PermitGroupMember[];
  visit: PermitVisitDetails;
  vehicle: PermitVehicleDetails;
  equipment: PermitEquipmentDetails;
};

const MAX_MEMBERS = 50;
const MAX_TEXT = 200;

function cleanText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, max);
}

function cleanInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function cleanBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Reduce a government ID number to a masked reference: the last four
 * alphanumeric characters, prefixed so it reads as deliberately partial. An
 * empty or too-short value yields a fully-masked placeholder, never the raw
 * input. The full number is never returned or stored.
 */
export function maskIdNumber(value: unknown): string | null {
  const raw = cleanText(value, 40);
  if (!raw) return null;
  const alnum = raw.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length === 0) return null;
  const last4 = alnum.slice(-4).toUpperCase();
  return `XXXX-XXXX-${last4}`;
}

/**
 * Sanitize an arbitrary client-supplied value into the stored PermitDetails
 * shape: whitelist every field, coerce types, and mask ID numbers. Unknown keys
 * are dropped, so this doubles as the guard against the JSONB column being used
 * to smuggle in unapproved data.
 */
export function sanitizePermitDetails(input: unknown): PermitDetails {
  const src = (input && typeof input === "object" && !Array.isArray(input))
    ? (input as Record<string, unknown>)
    : {};

  const leadSrc = (src.lead && typeof src.lead === "object") ? (src.lead as Record<string, unknown>) : {};
  const lead: PermitLeadVisitor = {
    nationality: cleanText(leadSrc.nationality, 60),
    gender: oneOf(leadSrc.gender, GENDERS),
    dob: isoDate(leadSrc.dob),
    age: cleanInt(leadSrc.age, 0, 120),
    idType: oneOf(leadSrc.idType, ID_TYPES),
    idNumberMasked: maskIdNumber(leadSrc.idNumber),
  };

  const membersSrc = Array.isArray(src.members) ? src.members.slice(0, MAX_MEMBERS) : [];
  const members: PermitGroupMember[] = membersSrc
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && !Array.isArray(m))
    .map((m) => ({
      name: cleanText(m.name, 120) ?? "Unnamed",
      age: cleanInt(m.age, 0, 120),
      nationality: cleanText(m.nationality, 60),
      idType: oneOf(m.idType, ID_TYPES),
      idNumberMasked: maskIdNumber(m.idNumber),
    }));

  const visitSrc = (src.visit && typeof src.visit === "object") ? (src.visit as Record<string, unknown>) : {};
  const visit: PermitVisitDetails = {
    zone: cleanText(visitSrc.zone, 120),
    entryGate: cleanText(visitSrc.entryGate, 120),
    exitGate: cleanText(visitSrc.exitGate, 120),
    timeSlot: cleanText(visitSrc.timeSlot, 60),
    expectedExit: cleanText(visitSrc.expectedExit, 60),
    validityFrom: isoDate(visitSrc.validityFrom),
    validityTo: isoDate(visitSrc.validityTo),
    route: cleanText(visitSrc.route, 200),
  };

  const vehicleSrc = (src.vehicle && typeof src.vehicle === "object") ? (src.vehicle as Record<string, unknown>) : {};
  const vehicleRequired = cleanBool(vehicleSrc.required);
  const vehicle: PermitVehicleDetails = {
    required: vehicleRequired,
    type: vehicleRequired ? cleanText(vehicleSrc.type, 60) : null,
    registration: vehicleRequired ? cleanText(vehicleSrc.registration, 30) : null,
    seatingCapacity: vehicleRequired ? cleanInt(vehicleSrc.seatingCapacity, 1, 100) : null,
    driver: vehicleRequired ? cleanText(vehicleSrc.driver, 120) : null,
    guide: vehicleRequired ? cleanText(vehicleSrc.guide, 120) : null,
  };

  const equipSrc = (src.equipment && typeof src.equipment === "object") ? (src.equipment as Record<string, unknown>) : {};
  const stillCamera = cleanBool(equipSrc.stillCamera);
  const videoCamera = cleanBool(equipSrc.videoCamera);
  const equipment: PermitEquipmentDetails = {
    stillCamera,
    stillCount: stillCamera ? cleanInt(equipSrc.stillCount, 0, 50) : null,
    videoCamera,
    videoCount: videoCamera ? cleanInt(equipSrc.videoCount, 0, 50) : null,
    special: cleanText(equipSrc.special, 200),
  };

  return { lead, members, visit, vehicle, equipment };
}

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function anyInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Normalize a stored permit_details value into a complete, safe-to-render shape.
 *
 * Reads the ALREADY-sanitized keys (idNumberMasked, not the raw idNumber) and
 * fills every missing field with a null/empty default, so a permit created before
 * this column existed (an empty `{}`) renders cleanly rather than throwing. This
 * is display-side only; it never unmasks anything.
 */
export function readPermitDetails(input: unknown): PermitDetails {
  const src = asObj(input);
  const lead = asObj(src.lead);
  const visit = asObj(src.visit);
  const vehicle = asObj(src.vehicle);
  const equipment = asObj(src.equipment);
  const membersRaw = Array.isArray(src.members) ? src.members : [];

  return {
    lead: {
      nationality: cleanText(lead.nationality, 60),
      gender: oneOf(lead.gender, GENDERS),
      dob: cleanText(lead.dob, 10),
      age: anyInt(lead.age),
      idType: oneOf(lead.idType, ID_TYPES),
      idNumberMasked: cleanText(lead.idNumberMasked, 40),
    },
    members: membersRaw.map((raw) => {
      const m = asObj(raw);
      return {
        name: cleanText(m.name, 120) ?? "Unnamed",
        age: anyInt(m.age),
        nationality: cleanText(m.nationality, 60),
        idType: oneOf(m.idType, ID_TYPES),
        idNumberMasked: cleanText(m.idNumberMasked, 40),
      };
    }),
    visit: {
      zone: cleanText(visit.zone, 120),
      entryGate: cleanText(visit.entryGate, 120),
      exitGate: cleanText(visit.exitGate, 120),
      timeSlot: cleanText(visit.timeSlot, 60),
      expectedExit: cleanText(visit.expectedExit, 60),
      validityFrom: cleanText(visit.validityFrom, 10),
      validityTo: cleanText(visit.validityTo, 10),
      route: cleanText(visit.route, 200),
    },
    vehicle: {
      required: cleanBool(vehicle.required),
      type: cleanText(vehicle.type, 60),
      registration: cleanText(vehicle.registration, 30),
      seatingCapacity: anyInt(vehicle.seatingCapacity),
      driver: cleanText(vehicle.driver, 120),
      guide: cleanText(vehicle.guide, 120),
    },
    equipment: {
      stillCamera: cleanBool(equipment.stillCamera),
      stillCount: anyInt(equipment.stillCount),
      videoCamera: cleanBool(equipment.videoCamera),
      videoCount: anyInt(equipment.videoCount),
      special: cleanText(equipment.special, 200),
    },
  };
}
