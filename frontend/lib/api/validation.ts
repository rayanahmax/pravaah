/**
 * Hand-written request validation. API rule 1 is "validate all requests"; this is
 * the only place request bodies become trusted values.
 *
 * Deliberately free of any external schema library: the plan approves none, and
 * these rules are short enough to read and test directly. That is a constraint on
 * dependencies, not on internal reuse — enums and rules that already have an owner
 * are imported rather than restated, because a second copy of ALERT_SEVERITIES is
 * exactly how a validator starts accepting a value the database rejects.
 */

/*
 * Relative, extension-bearing specifiers: the `@/` alias exists only in
 * tsconfig, so node --test cannot resolve it, and an extensionless relative
 * import fails Node's literal ESM resolution. The severity list and the window
 * rule are owned by lib/alert-rules.ts.
 */
import { ALERT_SEVERITIES, isWindowValid, type AlertSeverity } from "../alert-rules.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FieldError = { field: string; message: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

const fail = (field: string, message: string): ParseResult<never> => ({
  ok: false,
  errors: [{ field, message }],
});

export const ACCESS_STATUSES = ["OPEN", "RESTRICTED", "CLOSED"] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseUuid(value: unknown, field = "id"): ParseResult<string> {
  if (!isUuid(value)) return fail(field, "must be a valid UUID");
  return { ok: true, value: value.toLowerCase() };
}

/** Strict YYYY-MM-DD, and the date must actually exist on the calendar. */
export function parseIsoDate(value: unknown, field = "date"): ParseResult<string> {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    return fail(field, "must be a date in YYYY-MM-DD format");
  }
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return fail(field, "must be a real calendar date");
  }
  return { ok: true, value };
}

export function parseInteger(
  value: unknown,
  field: string,
  bounds: { min: number; max?: number }
): ParseResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fail(field, "must be a whole number");
  }
  if (value < bounds.min) return fail(field, `must be at least ${bounds.min}`);
  if (bounds.max !== undefined && value > bounds.max) {
    return fail(field, `must be at most ${bounds.max}`);
  }
  return { ok: true, value };
}

/**
 * For NUMERIC columns that are genuinely fractional — coordinates today.
 *
 * parseInteger cannot serve these: destinations.latitude and .longitude are
 * NUMERIC in the schema and in docs/DATABASE.md, but the endpoint rejected
 * anything but a whole number, so a real position was inexpressible. At latitude
 * 13 a whole degree is roughly 111 km, which is the difference between reporting
 * conditions for a destination and reporting them for somewhere else entirely.
 */
export function parseNumber(
  value: unknown,
  field: string,
  bounds: { min: number; max?: number; maxDecimals?: number }
): ParseResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(field, "must be a number");
  }
  if (value < bounds.min) return fail(field, `must be at least ${bounds.min}`);
  if (bounds.max !== undefined && value > bounds.max) {
    return fail(field, `must be at most ${bounds.max}`);
  }
  if (bounds.maxDecimals !== undefined) {
    // Counted from the literal rather than via float rounding, so 47.9999999
    // cannot slip past a toFixed comparison.
    const text = String(value);
    const decimals = text.includes(".") ? text.split(".")[1].length : 0;
    if (decimals > bounds.maxDecimals) {
      return fail(field, `must have at most ${bounds.maxDecimals} decimal places`);
    }
  }
  return { ok: true, value };
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function optionalText(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: FieldError[]
): string | null | undefined {
  const value = input[field];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") {
    errors.push({ field, message: "must be text" });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push({ field, message: `must be ${maxLength} characters or fewer` });
    return undefined;
  }
  return trimmed;
}

function optionalInteger(
  input: Record<string, unknown>,
  field: string,
  bounds: { min: number; max?: number },
  errors: FieldError[]
): number | null | undefined {
  const value = input[field];
  if (value === undefined || value === null) return value as number | null | undefined;
  const parsed = parseInteger(value, field, bounds);
  if (!parsed.ok) {
    errors.push(...parsed.errors);
    return undefined;
  }
  return parsed.value;
}

function optionalNumber(
  input: Record<string, unknown>,
  field: string,
  bounds: { min: number; max?: number; maxDecimals?: number },
  errors: FieldError[]
): number | null | undefined {
  const value = input[field];
  if (value === undefined || value === null) return value as number | null | undefined;
  const parsed = parseNumber(value, field, bounds);
  if (!parsed.ok) {
    errors.push(...parsed.errors);
    return undefined;
  }
  return parsed.value;
}

const DESTINATION_FIELDS = [
  "name",
  "description",
  "type",
  "latitude",
  "longitude",
  "difficulty",
  "elevation",
  "estimated_duration_minutes",
  "access_status",
] as const;

export type DestinationInput = {
  name?: string;
  description?: string | null;
  type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  difficulty?: string | null;
  elevation?: number | null;
  estimated_duration_minutes?: number | null;
  access_status?: AccessStatus;
};

/**
 * Shared parse for destination create and update. `mode: "create"` requires a
 * name; `mode: "patch"` requires at least one known field and rejects unknown
 * keys, so a typo cannot quietly turn into a successful no-op.
 */
function parseDestination(body: unknown, mode: "create" | "patch"): ParseResult<DestinationInput> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");

  const errors: FieldError[] = [];
  const unknown = Object.keys(input).filter(
    (k) => !(DESTINATION_FIELDS as readonly string[]).includes(k)
  );
  if (unknown.length) {
    return fail(unknown[0], "unknown field");
  }

  const name = optionalText(input, "name", 200, errors);
  const description = optionalText(input, "description", 5000, errors);
  const type = optionalText(input, "type", 100, errors);
  const difficulty = optionalText(input, "difficulty", 50, errors);
  // NUMERIC in the schema, and fractional in practice: whole degrees are ~111 km
  // apart, which is not a destination position. Six decimals is about 0.1 m.
  const latitude = optionalNumber(input, "latitude", { min: -90, max: 90, maxDecimals: 6 }, errors);
  const longitude = optionalNumber(input, "longitude", { min: -180, max: 180, maxDecimals: 6 }, errors);
  const elevation = optionalInteger(input, "elevation", { min: 0, max: 20000 }, errors);
  const estimatedDuration = optionalInteger(
    input,
    "estimated_duration_minutes",
    { min: 0, max: 100000 },
    errors
  );

  let accessStatus: AccessStatus | undefined;
  if (input.access_status !== undefined) {
    if (
      typeof input.access_status !== "string" ||
      !ACCESS_STATUSES.includes(input.access_status as AccessStatus)
    ) {
      errors.push({ field: "access_status", message: `must be one of: ${ACCESS_STATUSES.join(", ")}` });
    } else {
      accessStatus = input.access_status as AccessStatus;
    }
  }

  if (mode === "create" && !name) {
    errors.push({ field: "name", message: "is required" });
  }
  if (mode === "patch") {
    const supplied = [
      name,
      description,
      type,
      difficulty,
      latitude,
      longitude,
      elevation,
      estimatedDuration,
      accessStatus,
    ];
    const provided = supplied.some((v) => v !== undefined) ||
      input.description === null ||
      input.type === null ||
      input.difficulty === null;
    if (!provided) errors.push({ field: "body", message: "provide at least one field to update" });
  }

  if (errors.length) return { ok: false, errors };

  const value: DestinationInput = {};
  if (typeof name === "string") value.name = name;
  if (input.description !== undefined) value.description = description;
  if (input.type !== undefined) value.type = type;
  if (input.difficulty !== undefined) value.difficulty = difficulty;
  if (input.latitude !== undefined) value.latitude = latitude;
  if (input.longitude !== undefined) value.longitude = longitude;
  if (input.elevation !== undefined) value.elevation = elevation;
  if (input.estimated_duration_minutes !== undefined) {
    value.estimated_duration_minutes = estimatedDuration;
  }
  if (accessStatus !== undefined) value.access_status = accessStatus;
  if (mode === "create") value.name = name as string;

  return { ok: true, value };
}

export function parseDestinationCreate(body: unknown): ParseResult<DestinationInput & { name: string }> {
  const parsed = parseDestination(body, "create");
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value as DestinationInput & { name: string } };
}

export function parseDestinationPatch(body: unknown): ParseResult<DestinationInput> {
  return parseDestination(body, "patch");
}

/** Body of PATCH .../capacity — docs/API.md shows { "capacity": 440 }. */
export function parseCapacityUpdate(body: unknown): ParseResult<{ capacity: number }> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");
  const unknown = Object.keys(input).filter((k) => k !== "capacity");
  if (unknown.length) return fail(unknown[0], "unknown field");
  const capacity = parseInteger(input.capacity, "capacity", { min: 0, max: 1000000 });
  if (!capacity.ok) return capacity;
  return { ok: true, value: { capacity: capacity.value } };
}

/** Body of PATCH .../quota — docs/API.md shows { "date", "quota" }. */
export function parseQuotaUpdate(body: unknown): ParseResult<{ date: string; quota: number }> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");
  const unknown = Object.keys(input).filter((k) => k !== "date" && k !== "quota");
  if (unknown.length) return fail(unknown[0], "unknown field");

  const date = parseIsoDate(input.date, "date");
  if (!date.ok) return date;
  const quota = parseInteger(input.quota, "quota", { min: 0, max: 1000000 });
  if (!quota.ok) return quota;
  return { ok: true, value: { date: date.value, quota: quota.value } };
}

/** Body of POST /api/v1/permits — docs/API.md "Create request." */
export type NewPermit = {
  destinationId: string;
  visitDate: string;
  groupSize: number;
  contactInformation?: Record<string, unknown> | null;
  emergencyContact?: Record<string, unknown> | null;
  permitDetails?: Record<string, unknown> | null;
};

/**
 * JSONB columns accept an object or null. An array or a bare scalar is refused
 * because the two contact fields are documented as structured records, and
 * accepting anything would let a client store a shape nothing can read.
 */
function optionalJsonObject(
  input: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): Record<string, unknown> | null | undefined {
  const value = input[field];
  if (value === undefined || value === null) return value as Record<string, unknown> | null;
  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push({ field, message: "must be a JSON object or null" });
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parsePermitCreate(body: unknown): ParseResult<NewPermit> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");

  const errors: FieldError[] = [];
  const known = ["destination_id", "visit_date", "group_size", "contact_information", "emergency_contact", "permit_details"];
  const unknown = Object.keys(input).filter((key) => !known.includes(key));
  if (unknown.length) errors.push({ field: unknown[0], message: "unknown field" });

  const destinationId = parseUuid(input.destination_id, "destination_id");
  if (!destinationId.ok) errors.push(...destinationId.errors);

  const visitDate = parseIsoDate(input.visit_date, "visit_date");
  if (!visitDate.ok) errors.push(...visitDate.errors);

  // Bounded only structurally: the real limits are remaining capacity and daily
  // quota, which lib/permit-rules.ts evaluates.
  const groupSize = parseInteger(input.group_size, "group_size", { min: 1, max: 100000 });
  if (!groupSize.ok) errors.push(...groupSize.errors);

  const contact = optionalJsonObject(input, "contact_information", errors);
  const emergency = optionalJsonObject(input, "emergency_contact", errors);
  const details = optionalJsonObject(input, "permit_details", errors);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      destinationId: (destinationId as { ok: true; value: string }).value,
      visitDate: (visitDate as { ok: true; value: string }).value,
      groupSize: (groupSize as { ok: true; value: number }).value,
      contactInformation: contact,
      emergencyContact: emergency,
      permitDetails: details,
    },
  };
}

/** Body of POST /api/v1/checkins — docs/API.md shows { "qr_token": "secure-token" }. */
export function parseCheckIn(body: unknown): ParseResult<{ qr_token: string }> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");
  const unknown = Object.keys(input).filter((k) => k !== "qr_token");
  if (unknown.length) return fail(unknown[0], "unknown field");

  const qrToken = input.qr_token;
  if (typeof qrToken !== "string" || !qrToken.trim()) {
    return fail("qr_token", "is required and must be text");
  }
  return { ok: true, value: { qr_token: qrToken.trim() } };
}

export function firstErrorMessage(errors: FieldError[]): string {
  const first = errors[0];
  return first ? `${first.field}: ${first.message}` : "Invalid request.";
}

/** Body of POST /api/v1/checkouts — identical contract to check-in (docs/API.md §Check-out). */
export function parseCheckOut(body: unknown): ParseResult<{ qr_token: string }> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");

  const unknown = Object.keys(input).filter((k) => k !== "qr_token");
  if (unknown.length) return fail(unknown[0], "unknown field");

  if (typeof input.qr_token !== "string" || input.qr_token.trim() === "") {
    return fail("qr_token", "is required and must be a non-empty string");
  }

  return { ok: true, value: { qr_token: input.qr_token.trim() } };
}

/**
 * A full ISO 8601 instant with an explicit zone.
 *
 * The zone is required rather than inferred. A bare `2026-09-11T18:00` is
 * ambiguous, and `Date.parse` resolves it against the *server's* zone — so an
 * operator in IST raising an alert for "6pm" would store 18:00 UTC and the notice
 * would appear six hours early. The client sends `toISOString()`, which always
 * carries the Z, and anything looser is refused here rather than guessed.
 */
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseIsoTimestamp(
  value: unknown,
  field = "timestamp"
): ParseResult<string> {
  if (typeof value !== "string" || !ISO_TIMESTAMP_RE.test(value)) {
    return fail(field, "must be a full ISO 8601 datetime with an explicit zone");
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return fail(field, "must be a real date and time");
  return { ok: true, value: new Date(parsed).toISOString() };
}

function optionalTimestamp(
  input: Record<string, unknown>,
  field: string,
  errors: FieldError[]
): string | null | undefined {
  const value = input[field];
  if (value === undefined || value === null) return value as null | undefined;
  const parsed = parseIsoTimestamp(value, field);
  if (!parsed.ok) {
    errors.push(...parsed.errors);
    return undefined;
  }
  return parsed.value;
}

/** Fields an operator may set when creating an alert. */
export type NewAlert = {
  title: string;
  message: string;
  severity: AlertSeverity;
  starts_at: string | null;
  ends_at: string | null;
};

/** Body of POST /api/v1/department/destinations/{id}/alerts. */
export function parseAlertCreate(body: unknown): ParseResult<NewAlert> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");

  const allowed = ["title", "message", "severity", "starts_at", "ends_at"];
  const unknown = Object.keys(input).filter((k) => !allowed.includes(k));
  if (unknown.length) return fail(unknown[0], "unknown field");

  const errors: FieldError[] = [];
  const title = optionalText(input, "title", 120, errors);
  const message = optionalText(input, "message", 2000, errors);

  const severity = input.severity;
  const validSeverity =
    typeof severity === "string" &&
    (ALERT_SEVERITIES as readonly string[]).includes(severity)
      ? (severity as AlertSeverity)
      : undefined;
  if (!validSeverity) {
    errors.push({
      field: "severity",
      message: `must be one of: ${ALERT_SEVERITIES.join(", ")}`,
    });
  }

  // Both bounds are optional: an alert raised "until further notice" has neither.
  const startsAt = optionalTimestamp(input, "starts_at", errors);
  const endsAt = optionalTimestamp(input, "ends_at", errors);

  if (errors.length) return { ok: false, errors };

  if (title === null || title === undefined || title === "") {
    return fail("title", "is required");
  }
  if (message === null || message === undefined || message === "") {
    return fail("message", "is required");
  }
  if (!validSeverity) return { ok: false, errors };

  // Same rule as alerts_window_check in migration 016. Enforced here first so a
  // mistyped window is a readable 400 rather than a constraint violation that the
  // route would have to report as a 500 (API rule 3).
  if (!isWindowValid(startsAt ?? null, endsAt ?? null)) {
    return fail("ends_at", "must be after starts_at");
  }

  return {
    ok: true,
    value: {
      title,
      message,
      severity: validSeverity,
      starts_at: startsAt ?? null,
      ends_at: endsAt ?? null,
    },
  };
}

/**
 * Body of PATCH /api/v1/department/alerts/{alert_id} — the active flag and nothing
 * else. PRD §16 gives operators create, activate and deactivate; there is no
 * deliberate edit path, so a published notice cannot be rewritten out from under
 * someone who already read it. Correcting one means deactivating it and raising a
 * new alert, which leaves the visible event the change deserves.
 */
export function parseAlertPatch(body: unknown): ParseResult<{ active: boolean }> {
  const input = asRecord(body);
  if (!input) return fail("body", "must be a JSON object");

  const unknown = Object.keys(input).filter((k) => k !== "active");
  if (unknown.length) return fail(unknown[0], "unknown field");

  if (typeof input.active !== "boolean") {
    return fail("active", "must be true or false");
  }
  return { ok: true, value: { active: input.active } };
}

/** Returns null when the body is absent or is not valid JSON. */
export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

