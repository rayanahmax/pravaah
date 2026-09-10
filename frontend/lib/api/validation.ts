/**
 * Hand-written request validation. API rule 1 is "validate all requests"; this is
 * the only place request bodies become trusted values.
 *
 * Deliberately dependency-free: the plan approves no schema library, and these
 * rules are short enough to read and test directly.
 */

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
  const latitude = optionalInteger(input, "latitude", { min: -90, max: 90 }, errors);
  const longitude = optionalInteger(input, "longitude", { min: -180, max: 180 }, errors);
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

export function firstErrorMessage(errors: FieldError[]): string {
  const first = errors[0];
  return first ? `${first.field}: ${first.message}` : "Invalid request.";
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
